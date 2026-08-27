#!/usr/bin/env node
/**
 * Local replay — clear the agent's cloud-blocked backlog from your own machine.
 *
 * Ashby, Cloudflare Turnstile and Greenhouse rate limits block the cloud
 * container's datacenter IP, but the forms themselves auto-fill. From a
 * residential connection they submit like any normal applicant — because they
 * are: your machine, your resume, your authorization.
 *
 *   node agent/local-replay.mjs --resume ~/Downloads/Hui_Mao_Backend.pdf
 *   node agent/local-replay.mjs --resume <pdf> --dry     # fill + screenshot, never submit
 *   node agent/local-replay.mjs --resume <pdf> --only ashby|greenhouse
 *
 * Prereqs (once): npm install && npx playwright install chromium
 *
 * What it does: reads data/agent/pending.json, takes every item whose reason
 * mentions the local replay, fills and submits per platform (Greenhouse
 * security codes: check your email and type the 8-char code into the
 * terminal), verifies the confirmation page, then updates
 * data/agent/{pending,applied}.json and APPLIED.md. Push the result with:
 *   git add data/agent && git commit -m "local replay results" && git push
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

const argv = process.argv.slice(2);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const DRY = argv.includes("--dry");
const ONLY = opt("only");
const RESUME_SRC = opt("resume");
const REPO = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), ".."));

if (!RESUME_SRC || !fs.existsSync(RESUME_SRC)) {
  console.error("Pass your resume: node agent/local-replay.mjs --resume /path/to/resume.pdf");
  process.exit(2);
}

// Scratch dir with everything the finishers expect.
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "agent-replay-"));
fs.copyFileSync(RESUME_SRC, path.join(WORK, "Hui_Mao_Backend_Software_Engineer.pdf"));
const profile = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/profile.json"), "utf8"));
const memory = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/memory.json"), "utf8"));
fs.writeFileSync(
  path.join(WORK, "autofill-profile.json"),
  JSON.stringify({
    firstName: profile.firstName, lastName: profile.lastName, email: profile.email,
    phone: profile.phone, location: profile.location, linkedin: profile.linkedin,
    github: profile.github, website: profile.website, workAuth: profile.workAuth,
    needsSponsor: profile.needsSponsor, usAuthorized: profile.usAuthorized,
    gender: "Decline to self identify", race: "Decline to self identify",
    veteran: "I don't wish to answer", disability: "I don't wish to answer",
    coverLetter: "",
    customAnswers: JSON.stringify(memory.answers.map((a) => ({ match: a.match, value: a.answer }))),
  }, null, 1),
);
const ANSWERS = path.join(REPO, "agent/finishers/generic-answers.json");

const pendPath = path.join(REPO, "data/agent/pending.json");
const apPath = path.join(REPO, "data/agent/applied.json");
const pend = JSON.parse(fs.readFileSync(pendPath, "utf8"));
const ap = JSON.parse(fs.readFileSync(apPath, "utf8"));

const targets = pend.items.filter((i) => /local replay/i.test(i.reason || ""));
const platformOf = (u) =>
  /ashbyhq\.com/.test(u ?? "") ? "ashby" : /greenhouse|thatch\.com/.test(u ?? "") ? "greenhouse" : null;
const jobs = targets
  .map((i) => ({ ...i, platform: platformOf(i.originalUrl) }))
  .filter((i) => i.platform && (!ONLY || i.platform === ONLY));
console.log(`${jobs.length} job(s) to replay (${DRY ? "DRY RUN — no submissions" : "submitting for real"})`);
console.log(`Screenshots and work files: ${WORK}`);
console.log("A real browser window will open for each job — you can watch, but don't click or type in it.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function runFinisher(script, args) {
  return new Promise((resolve) => {
    const p = spawn("node", [path.join(REPO, "agent/finishers", script), ...args], {
      cwd: REPO,
      env: { ...process.env, AGENT_WORK_DIR: WORK, REPO_DIR: REPO, HEADED: "1" },
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", async (d) => {
      err += d;
      if (/WAITING_FOR_CODE/.test(d.toString())) {
        const code = await ask("  📧 Greenhouse emailed you a security code — type it here: ");
        fs.writeFileSync(path.join(WORK, "gh-code.txt"), code.trim());
      }
    });
    p.on("exit", () => {
      const start = out.indexOf("{");
      try { resolve(JSON.parse(out.slice(start))); } catch {
        const tail = err.trim().split("\n").slice(-25).join("\n");
        if (tail) console.error(`  ⚠ finisher crashed:\n${tail.replace(/^/gm, "    ")}`);
        resolve(null);
      }
    });
  });
}

const results = [];
const now = new Date().toISOString();
for (const job of jobs) {
  console.log(`→ ${job.company} — ${job.title} (${job.matchPercent}%) [${job.platform}]`);
  fs.rmSync(path.join(WORK, "gh-code.txt"), { force: true });
  const res =
    job.platform === "ashby"
      ? await runFinisher("ashby-finish.mjs", [job.originalUrl, ...(DRY ? [] : ["--submit"])])
      : await runFinisher("gh-finish.mjs", [job.originalUrl, ANSWERS, ...(DRY ? [] : ["--submit"])]);

  const ok = Boolean(res?.confirmation);
  results.push({ job, ok, res });
  fs.appendFileSync(path.join(WORK, "results.jsonl"), JSON.stringify({ id: job.id, company: job.company, ...res }) + "\n");
  if (DRY) {
    console.log(`  filled — screenshot: ${res?.filledScreenshot ?? "?"}  missing: ${JSON.stringify(res?.missingRequired ?? "?")}\n`);
    continue;
  }
  if (ok) {
    console.log("  ✅ confirmed\n");
    ap.jobs[job.id] = {
      id: job.id, key: `${job.company.toLowerCase().trim()}::${job.title.toLowerCase().trim()}`,
      title: job.title, company: job.company, matchPercent: job.matchPercent,
      jobrightUrl: job.jobrightUrl, originalUrl: job.originalUrl,
      status: "applied_direct", via: `${job.platform} (local replay)`,
      detail: "Submitted from the user's own network via agent/local-replay.mjs; confirmation page verified.",
      at: now,
    };
    pend.items = pend.items.filter((i) => i.id !== job.id);
  } else {
    const why =
      (res?.errors?.length && `page errors: ${JSON.stringify(res.errors)}`) ||
      (res?.error && `crash: ${res.error}`) ||
      (res?.note) ||
      (res?.confirmationSnippet && `page said: ${res.confirmationSnippet.slice(0, 200).replace(/\n/g, " | ")}`) ||
      "no result";
    console.log(`  ✗ not confirmed — ${why}`);
    if (res?.finalUrl) console.log(`    final url: ${res.finalUrl}`);
    if (res?.submitScreenshot) console.log(`    submit screenshot: ${res.submitScreenshot}`);
    console.log("");
  }
  await new Promise((r) => setTimeout(r, 150_000)); // pace between submissions
}
rl.close();

if (!DRY) {
  ap.updatedAt = now;
  pend.updatedAt = now;
  fs.writeFileSync(apPath, JSON.stringify(ap, null, 1));
  fs.writeFileSync(pendPath, JSON.stringify(pend, null, 1));
  const okJobs = results.filter((r) => r.ok);
  if (okJobs.length) {
    const lines = okJobs.map((r) => `| ${r.job.company} | ${r.job.title} | ${r.job.matchPercent}% | ${r.job.platform} (local replay) | ✅ confirmed |`);
    fs.appendFileSync(
      path.join(REPO, "data/agent/APPLIED.md"),
      `\n### ${now.slice(0, 10)} — local replay from the user's machine\n\n| Company | Title | Match | Via | Status |\n| --- | --- | --- | --- | --- |\n${lines.join("\n")}\n`,
    );
  }
  console.log(`\nDone: ${okJobs.length}/${results.length} confirmed. State files updated — publish with:`);
  console.log(`  git add data/agent && git commit -m "local replay: ${okJobs.length} submitted" && git push`);
} else {
  console.log("\nDry run complete — check the screenshots above, then rerun without --dry.");
}
