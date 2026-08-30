// Daytime rule factory — runs on the USER'S MAC, fully automatic (launchd).
// Pulls the repo, feeds every unanswered question (cloud brain-queue + local
// replay failures) to the local Qwen via agent/local-brain.mjs, merges the
// generated rules straight into agent/finishers/generic-answers.json, and
// pushes to the ashby-local-results side branch. The cloud agent merges the
// branch at the start of the next 1am window and re-runs the parked jobs —
// so Claude never spends tokens writing answer rules again.
//
//   node agent/brain-rules.mjs            # normal run
//   node agent/brain-rules.mjs --dry      # show rules, change nothing
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { brainAvailable, answerQuestions } from "./local-brain.mjs";

const REPO = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const DRY = process.argv.includes("--dry");
const sh = (c) => execSync(c, { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

if (!(await brainAvailable())) {
  console.error("Local model not reachable — start your Qwen server (or set QWEN_BASE_URL) and rerun.");
  process.exit(2);
}

// 1) sync to latest main (hard reset is safe: this machine only produces
//    generic-answers/queue edits, which we re-apply below)
if (!DRY) {
  sh("git fetch origin main");
  sh("git reset --hard origin/main");
}

// 2) collect every unanswered question set
const items = []; // { id, company, title, missing[] }
const seen = new Set();
const add = (o) => {
  if (!o || !o.missing?.length || seen.has(o.id)) return;
  seen.add(o.id);
  items.push(o);
};
const qPath = path.join(REPO, "data/agent/brain-queue.jsonl");
if (fs.existsSync(qPath)) {
  for (const line of fs.readFileSync(qPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); add({ id: r.id, company: r.company, title: r.title, missing: r.missing }); } catch {}
  }
}
const fPath = path.join(REPO, "data/agent/replay-failures.jsonl");
if (fs.existsSync(fPath)) {
  for (const line of fs.readFileSync(fPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); add({ id: r.id, company: r.company, title: r.title, missing: r.missing }); } catch {}
  }
}
const pend = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/pending.json"), "utf8"));
for (const i of pend.items) {
  if (i.status === "needs_answers" && i.missing?.length) add({ id: i.id, company: i.company, title: i.title, missing: i.missing });
}

if (!items.length) { console.log("Nothing to answer — queue is empty."); process.exit(0); }
console.log(`${items.length} job(s) with unanswered questions.`);

// 3) Qwen writes rules; merge (label+prefer/text dedupe) into generic-answers
const ansPath = path.join(REPO, "agent/finishers/generic-answers.json");
const answers = JSON.parse(fs.readFileSync(ansPath, "utf8"));
const key = (o) => JSON.stringify([o.label, o.prefer ?? o.text ?? "", o.type ?? ""]);
const haveC = new Set(answers.combos.map(key));
const haveT = new Set(answers.texts.map(key));
let added = 0;
for (const job of items) {
  process.stdout.write(`→ ${job.company} (${job.missing.length} question(s))… `);
  try {
    const rules = await answerQuestions(REPO, job, job.missing);
    let n = 0;
    for (const c of rules.combos) if (!haveC.has(key(c))) { answers.combos.push(c); haveC.add(key(c)); n++; }
    for (const t of rules.texts) if (!haveT.has(key(t))) { answers.texts.push(t); haveT.add(key(t)); n++; }
    added += n;
    console.log(`${n} new rule(s)`);
  } catch (e) {
    console.log(`brain error: ${String(e.message).slice(0, 100)}`);
  }
}
if (!added) { console.log("No new rules produced."); process.exit(0); }
if (DRY) { console.log(`DRY: would add ${added} rule(s).`); process.exit(0); }

fs.writeFileSync(ansPath, JSON.stringify(answers, null, 1));
// leave the queue in place — the cloud agent clears entries after the retry
// succeeds, so a bad rule gets a second brain pass the following day.

// 4) publish via the side branch (never touches main directly)
sh("git add agent/finishers/generic-answers.json");
sh(`git -c user.name="Qwen Brain" -c user.email="huiluckylucky@gmail.com" commit -m "qwen brain: +${added} answer rules for ${items.length} job(s)"`);
sh("git push -f origin HEAD:ashby-local-results");
console.log(`Pushed ${added} rule(s) to ashby-local-results — the 1am cloud window will merge and retry the parked jobs.`);
