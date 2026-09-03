// Nightly Greenhouse batch — runs UNATTENDED on the user's Mac (launchd, 1:00am).
// Home IP for submissions, local Qwen for answers, local Gmail OAuth for codes.
// Claude's 5am cloud window only merges the results, audits, and handles
// Workday/Amazon — it never re-applies anything this run already logged.
//
// Requirements (one-time):
//   ~/.jobright-agent/env           exports JOBRIGHT_PASSWORD=... and RESUME_PDF=/path/to/resume.pdf
//   ~/.jobright-agent/gmail-*.json  Gmail OAuth (agent/gmail-auth.mjs)
//   Qwen server on 127.0.0.1:8080 (or QWEN_BASE_URL)
//
//   node agent/local-batch.mjs [--cap N] [--gh-cap N] [--dry]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { waitForSecurityCode, waitForJobrightCode } from "./gmail-code.mjs";

const REPO = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const CFG_DIR = path.join(os.homedir(), ".jobright-agent");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DRY = argv.includes("--dry");
const DAILY_CAP = Number(opt("cap", "100"));
const GH_CAP = Number(opt("gh-cap", "45"));
const sh = (c) => execSync(c, { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const RESUME = process.env.RESUME_PDF;
if (!RESUME || !fs.existsSync(RESUME)) {
  console.error("Set RESUME_PDF in ~/.jobright-agent/env (export RESUME_PDF=/path/to/resume.pdf)");
  process.exit(2);
}

// 0) fresh repo
sh("git fetch origin main");
sh("git reset --hard origin/main");

// 1) work dir the finishers expect
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "agent-batch-"));
fs.copyFileSync(RESUME, path.join(WORK, "Hui_Mao_Backend_Software_Engineer.pdf"));
const profile = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/profile.json"), "utf8"));
const memory = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/memory.json"), "utf8"));
fs.writeFileSync(path.join(WORK, "autofill-profile.json"), JSON.stringify({
  firstName: profile.firstName, lastName: profile.lastName, email: profile.email,
  phone: profile.phone, location: profile.location, linkedin: profile.linkedin,
  github: profile.github, website: profile.website, workAuth: profile.workAuth,
  needsSponsor: profile.needsSponsor, usAuthorized: profile.usAuthorized,
  gender: "Decline to self identify", race: "Decline to self identify",
  veteran: "I don't wish to answer", disability: "I don't wish to answer", coverLetter: "",
  customAnswers: JSON.stringify(memory.answers.map((a) => ({ match: a.match, value: a.answer }))),
}, null, 1));
const stateHome = path.join(CFG_DIR, "jobright-state.json");
if (fs.existsSync(stateHome)) fs.copyFileSync(stateHome, path.join(WORK, "jobright-state.json"));
const env = { ...process.env, AGENT_WORK_DIR: WORK, REPO_DIR: REPO, ANSWERS_FILE: path.join(REPO, "agent/finishers/generic-answers.json") };

function run(script, args, onLine, maxMs = 15 * 60_000) {
  return new Promise((resolve) => {
    const p = spawn("node", [script, ...args], { cwd: REPO, env });
    let out = "";
    const watchdog = setTimeout(() => {
      log(`WATCHDOG: ${path.basename(script)} exceeded ${maxMs / 60000}min — killing it. Last output:`);
      for (const l of out.split("\n").slice(-6)) if (l.trim()) log(`  | ${l.slice(0, 160)}`);
      p.kill("SIGKILL");
    }, maxMs);
    const feed = (d) => {
      out += d;
      for (const line of d.toString().split("\n")) if (line.trim() && onLine) onLine(line);
    };
    p.stdout.on("data", feed);
    p.stderr.on("data", feed);
    p.on("exit", () => { clearTimeout(watchdog); resolve(out); });
  });
}
// hard cap on the whole batch so a wedged run can never block the next night
setTimeout(() => { log("GLOBAL TIMEOUT (5h) — exiting so launchd can run tomorrow"); process.exit(3); }, 5 * 60 * 60_000).unref();

// 2) harvest (login if the saved cookie expired; Jobright may email a code —
//    fetch it via Gmail OAuth and feed it through the worker's --code-file)
const loginStartedAt = () => Date.now();
async function jobrightLogin() {
  const t0 = Date.now();
  const out = await run(path.join(REPO, "worker/jobright-agent.mjs"), ["login"], async (line) => {
    if (/verification_code_needed|waiting for verification code/.test(line)) {
      log("Jobright emailed a login code — polling Gmail…");
      const hit = await waitForJobrightCode(t0, 150_000);
      if (hit) { fs.writeFileSync(path.join(WORK, "login-code.txt"), hit.code); log(`login code ${hit.code}`); }
      else log("no login code arrived in time");
    }
  });
  const m = out.match(/"reason"\s*:\s*"([^"]+)"/);
  if (m && !/already/.test(out)) log(`login result: ${m[1]}`);
  return out;
}
log("harvesting Jobright matches…");
let harvest = await run(path.join(REPO, "worker/jobright-agent.mjs"), ["matches"]);
if (/not_logged_in/.test(harvest)) {
  log("cookie expired — logging in…");
  await jobrightLogin();
  harvest = await run(path.join(REPO, "worker/jobright-agent.mjs"), ["matches"]);
}
let matches;
try { matches = JSON.parse(harvest.slice(harvest.indexOf("{"))); } catch { matches = null; }
if (!matches?.ok) { console.error("Harvest failed:", harvest.slice(-400)); process.exit(1); }
if (fs.existsSync(path.join(WORK, "jobright-state.json"))) fs.copyFileSync(path.join(WORK, "jobright-state.json"), stateHome);
log(`harvested ${matches.jobs.length} matches`);

// 3) dedupe + queue
const ap = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/applied.json"), "utf8"));
const pend = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/pending.json"), "utf8"));
const today = new Date().toLocaleDateString("sv", { timeZone: "America/New_York" }); // YYYY-MM-DD ET
const doneToday = Object.values(ap.jobs).filter((j) => String(j.appliedAt ?? j.at ?? "").slice(0, 10) === today).length;
const budget = Math.max(0, DAILY_CAP - doneToday);
const idOf = (u) => (String(u).match(/info\/([a-f0-9]+)/) || [])[1];
const seenIds = new Set(), seenKeys = new Set(), seenTok = new Set();
const tok = (u) => { const m = String(u ?? "").match(/token=(\d+)/); if (m) seenTok.add(m[1]); };
for (const [id, j] of Object.entries(ap.jobs)) { seenIds.add(id); if (j.key) seenKeys.add(j.key); tok(j.originalUrl); }
for (const i of pend.items) { seenIds.add(i.id); if (i.key) seenKeys.add(i.key); tok(i.originalUrl); tok(i.atsUrl); }
const norm = (s) => String(s ?? "").toLowerCase().trim();
// Standing rule: never apply to defense/clearance companies (applicant cannot
// hold a US security clearance). Mirrors RUNBOOK; extend as new ones appear.
const DEFENSE_BLOCK = /palantir|anduril|varda|havocai|\bstr\b|l3harris|lockheed|raytheon|\brtx\b|northrop|general dynamics|bae systems|leidos|booz allen|draper|mitre|sierra nevada corp|epirus|shield ?ai|saronic|castelion|mach industries|helsing/i;
const queue = [];
const qKeys = new Set();
for (const j of matches.jobs) {
  const id = idOf(j.jobrightUrl);
  if (!id || seenIds.has(id)) continue;
  if (DEFENSE_BLOCK.test(j.company ?? "")) { log(`blocked (defense/clearance): ${j.company}`); continue; }
  const key = `${norm(j.company)}::${norm(j.title)}`;
  if (seenKeys.has(key) || qKeys.has(key)) continue;
  if ((j.matchPercent ?? 0) < 70) continue;
  queue.push({ id, ...j, key });
  qKeys.add(key);
  if (queue.length >= budget) break;
}
queue.sort((a, b) => b.matchPercent - a.matchPercent);
fs.writeFileSync(path.join(WORK, "today-queue.json"), JSON.stringify(queue, null, 1));
log(`queue ${queue.length} (budget ${budget}, already ${doneToday} today)`);
if (!queue.length) { log("nothing to do"); process.exit(0); }
if (DRY) { console.log(queue.map((q) => `${q.matchPercent} ${q.company} — ${q.title}`).join("\n")); process.exit(0); }

// 4) code fetcher: on NEED_CODE, poll Gmail (OAuth) and drop gh-code.txt
let codeRequestedAt = 0;
async function onLine(line) {
  if (/NEED_CODE/.test(line)) {
    const since = codeRequestedAt || Date.now() - 60_000;
    log(`security code needed — polling Gmail…`);
    const hit = await waitForSecurityCode(since, 150_000);
    if (hit) { fs.writeFileSync(path.join(WORK, "gh-code.txt"), hit.code); log(`code ${hit.code} (${hit.subject.slice(0, 60)})`); }
    else log("no code arrived in time — job will fail and be parked");
    codeRequestedAt = hit ? hit.at : Date.now();
  }
  if (/^(OK|PARK|NEEDS-ANSWERS|FAIL|UNCONFIRMED|SKIP|CAP-GH|BATCH)/.test(line)) log(line.slice(0, 140));
}

// 5) run the batch (session-tools batch-apply: resolves ATS urls, caps, pacing)
fs.copyFileSync(path.join(REPO, "agent/session-tools/batch-apply.mjs"), path.join(WORK, "batch-apply.mjs"));
await run(path.join(WORK, "batch-apply.mjs"), ["--start", "0", "--count", String(queue.length), "--gh-cap", String(GH_CAP)], onLine, 4 * 60 * 60_000);

// 6) collect results
const lines = fs.readFileSync(path.join(WORK, "batch-results.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const results = lines.slice(-queue.length);

// 7) Qwen retry for needs_answers (rules merged into a live overlay, one repass)
const needs = results.filter((r) => r.status === "needs_answers" && r.missing?.length);
let retried = [];
if (needs.length) {
  let brain = null;
  try { brain = await import("./local-brain.mjs"); if (!(await brain.brainAvailable())) brain = null; } catch { brain = null; }
  if (brain) {
    const live = JSON.parse(fs.readFileSync(path.join(REPO, "agent/finishers/generic-answers.json"), "utf8"));
    for (const job of needs) {
      try {
        const rules = await brain.answerQuestions(REPO, job, job.missing);
        live.combos.push(...rules.combos); live.texts.push(...rules.texts);
        log(`qwen: ${rules.combos.length + rules.texts.length} rule(s) for ${job.company}`);
      } catch (e) { log(`qwen failed for ${job.company}: ${String(e.message).slice(0, 80)}`); }
    }
    fs.writeFileSync(path.join(WORK, "repass-answers.json"), JSON.stringify(live, null, 1));
    fs.writeFileSync(path.join(WORK, "repass.json"), JSON.stringify(needs.map((r) => ({ company: r.company, match: r.matchPercent, url: r.atsUrl, id: r.id, title: r.title, key: r.key })), null, 1));
    fs.copyFileSync(path.join(REPO, "agent/session-tools/repass.mjs"), path.join(WORK, "repass.mjs"));
    await run(path.join(WORK, "repass.mjs"), [], onLine, 90 * 60_000);
    try { retried = fs.readFileSync(path.join(WORK, "repass-results.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch {}
  } else log("qwen not reachable — needs_answers go to brain-queue as-is");
}

// 8) bookkeeping
const now = new Date().toISOString();
const okRetry = new Map(retried.filter((r) => r.ok).map((r) => [r.id, r]));
let submitted = 0, parked = 0, queuedBrain = 0;
for (const r of results) {
  const viaRetry = okRetry.has(r.id);
  if (r.status === "submitted" || viaRetry) {
    ap.jobs[r.id] = { key: r.key, title: r.title, company: r.company, matchPercent: r.matchPercent,
      jobrightUrl: r.jobrightUrl, originalUrl: r.atsUrl, appliedAt: today,
      via: "greenhouse (mac local batch)", detail: viaRetry ? "Confirmed on Qwen-assisted repass (home IP)" : "Submitted from the user's home IP by local-batch" };
    submitted++;
    continue;
  }
  if (pend.items.some((i) => i.id === r.id)) continue;
  const item = { id: r.id, key: r.key, title: r.title, company: r.company, matchPercent: r.matchPercent,
    jobrightUrl: r.jobrightUrl, atsUrl: r.atsUrl ?? null, addedAt: today };
  if (r.status === "needs_answers") {
    item.status = "needs_answers"; item.missing = r.missing;
    fs.appendFileSync(path.join(REPO, "data/agent/brain-queue.jsonl"),
      JSON.stringify({ id: r.id, company: r.company, title: r.title, missing: r.missing, at: now }) + "\n");
    queuedBrain++;
  } else if (/ashby/i.test(r.reason ?? "") || r.status === "skip-ashby") {
    item.status = "local replay";
  } else { item.status = "parked"; item.note = r.reason ?? "not automatable"; parked++; }
  pend.items.push(item);
}
ap.updatedAt = pend.updatedAt = now;
fs.writeFileSync(path.join(REPO, "data/agent/applied.json"), JSON.stringify(ap, null, 1));
fs.writeFileSync(path.join(REPO, "data/agent/pending.json"), JSON.stringify(pend, null, 1));
fs.appendFileSync(path.join(REPO, "data/agent/APPLIED.md"),
  `\n## ${today} (Mac local batch, home IP)\n\n${submitted} submitted, ${parked} parked, ${queuedBrain} queued for Qwen. All-time ${Object.keys(ap.jobs).length}.\n` +
  results.filter((r) => r.status === "submitted" || okRetry.has(r.id)).map((r) => `- ${r.company} — ${r.title} (${r.matchPercent}%) — greenhouse, confirmed\n`).join(""));

// 9) publish via side branch (cloud merges at 5am ET)
sh("git add data/agent agent/finishers/generic-answers.json 2>/dev/null || git add data/agent");
sh(`git -c user.name="Local Batch" -c user.email="huiluckylucky@gmail.com" commit -m "mac local batch ${today}: ${submitted} submitted, ${queuedBrain} for qwen"`);
sh("git push -f origin HEAD:ashby-local-results");
log(`DONE: ${submitted} submitted / ${parked} parked / ${queuedBrain} for Qwen — pushed to ashby-local-results. All-time ${Object.keys(ap.jobs).length}.`);
