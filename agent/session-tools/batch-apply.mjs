// Serial batch applier for the daily quota. Discovers each job's ATS via the
// jobright handoff, dispatches to the platform finisher, enforces pacing and
// circuit breakers, and emits one JSON line per job to batch-results.jsonl.
// The supervising session watches that file and feeds Greenhouse codes into
// gh-code.txt when a NEED_CODE line appears.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WORK = process.env.AGENT_WORK_DIR;
const REPO = process.env.REPO_DIR ?? "/home/user/AI_Infra_Hiring_Radar_USA";
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const START = Number(opt("start", "0"));
const COUNT = Number(opt("count", "5"));
const GH_CAP = Number(opt("gh-cap", "15"));
const GH_PACE_MS = Number(opt("gh-pace", "180")) * 1000;

const queue = JSON.parse(fs.readFileSync(path.join(WORK, "today-queue.json"), "utf8"));
const RESULTS = path.join(WORK, "batch-results.jsonl");
const log = (obj) => fs.appendFileSync(RESULTS, JSON.stringify(obj) + "\n");
const say = (s) => console.log(s);

function runNode(script, args, timeoutMs = 420000) {
  return new Promise((resolve) => {
    const p = spawn("node", [script, ...args], { cwd: REPO, env: process.env });
    let out = "", err = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); }, timeoutMs);
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => {
      err += d;
      if (/WAITING_FOR_CODE/.test(d.toString())) say(`NEED_CODE now — check Gmail`);
    });
    p.on("exit", () => { clearTimeout(t); resolve({ out, err }); });
  });
}

function parseJson(out) {
  const cleaned = out.replace(/^WAITING_FOR_CODE.*$/m, "").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  try { return JSON.parse(cleaned.slice(start)); } catch { return null; }
}

let ghCount = 0, ghDisabled = false, ashbyDisabled = false;
const slice = queue.slice(START, START + COUNT);
say(`BATCH start=${START} count=${slice.length} ghCap=${GH_CAP}`);

for (let i = 0; i < slice.length; i++) {
  const job = slice[i];
  const tag = `${START + i}: ${job.company} — ${job.title} (${job.matchPercent}%)`;
  try {
    // 1. Discover the ATS through the jobright handoff.
    const disc = await runNode(path.join(REPO, ".run-apply.mjs"), [job.jobrightUrl], 240000);
    const dj = parseJson(disc.out) ?? {};
    const atsUrl = dj.atsUrl ?? dj.steps?.find((s) => s.s === "ats-open")?.atsUrl ?? "";
    if (!atsUrl) {
      log({ ...job, status: "park", reason: dj.result ?? "no ATS url discovered" });
      say(`PARK ${tag} — no ATS url (${dj.result ?? "?"})`);
      continue;
    }
    const host = new URL(atsUrl).hostname;

    // 2. Dispatch by platform.
    if (/greenhouse\.io$/.test(host) || /greenhouse/.test(host)) {
      if (ghDisabled) { log({ ...job, atsUrl, status: "park", reason: "greenhouse disabled this window (rate limit)" }); say(`SKIP-GH ${tag}`); continue; }
      if (ghCount >= GH_CAP) { log({ ...job, atsUrl, status: "park", reason: "greenhouse window cap reached" }); say(`CAP-GH ${tag}`); continue; }
      fs.rmSync(path.join(WORK, "gh-code.txt"), { force: true });
      const res = await runNode(path.join(REPO, ".gh-finish.mjs"), [atsUrl, path.join(WORK, "generic-answers.json"), "--submit"], 600000);
      const rj = parseJson(res.out) ?? {};
      const snippet = rj.confirmationSnippet ?? "";
      if (rj.confirmation) {
        ghCount++;
        log({ ...job, atsUrl, status: "submitted", via: "greenhouse", codeEntered: rj.codeEntered ?? false });
        say(`OK ${tag} [greenhouse ${ghCount}/${GH_CAP}]`);
        say(`PACE ${GH_PACE_MS / 1000}s`);
        await new Promise((r) => setTimeout(r, GH_PACE_MS));
      } else if (/too many requests/i.test(snippet) || /too many requests/i.test(res.out)) {
        ghDisabled = true;
        log({ ...job, atsUrl, status: "park", reason: "greenhouse 429 — window closed" });
        say(`RATE-LIMITED ${tag} — greenhouse disabled for this window`);
      } else if ((rj.missingRequired ?? []).length) {
        log({ ...job, atsUrl, status: "needs_answers", missing: rj.missingRequired });
        say(`NEEDS-ANSWERS ${tag}: ${JSON.stringify(rj.missingRequired).slice(0, 160)}`);
      } else {
        log({ ...job, atsUrl, status: "park", reason: `unconfirmed submit: ${snippet.slice(0, 120)}` });
        say(`UNCONFIRMED ${tag}`);
      }
    } else if (/ashbyhq\.com$/.test(host)) {
      if (ashbyDisabled) { log({ ...job, atsUrl, status: "park", reason: "ashby blocked this IP earlier" }); say(`SKIP-ASHBY ${tag}`); continue; }
      const res = await runNode(path.join(REPO, ".ashby-finish.mjs"), [atsUrl, "--submit"], 420000);
      const rj = parseJson(res.out) ?? {};
      if (rj.confirmation) {
        log({ ...job, atsUrl, status: "submitted", via: "ashby" });
        say(`OK ${tag} [ashby]`);
        await new Promise((r) => setTimeout(r, 60000));
      } else if (/spam|couldn'?t submit/i.test(rj.confirmationSnippet ?? "")) {
        ashbyDisabled = true;
        log({ ...job, atsUrl, status: "park", reason: "ashby anti-bot flagged the datacenter IP" });
        say(`ASHBY-BLOCKED ${tag} — ashby disabled for this window`);
      } else {
        log({ ...job, atsUrl, status: "park", reason: `ashby unconfirmed: ${(rj.confirmationSnippet ?? rj.error ?? "?").slice(0, 100)}` });
        say(`UNCONFIRMED ${tag} [ashby]`);
      }
    } else {
      log({ ...job, atsUrl, status: "park", reason: `platform not automated from cloud: ${host}` });
      say(`PARK ${tag} — ${host}`);
    }
  } catch (e) {
    log({ ...job, status: "error", reason: String(e?.message ?? e).slice(0, 150) });
    say(`ERR ${tag}: ${String(e?.message ?? e).slice(0, 100)}`);
  }
}
say(`BATCH DONE gh=${ghCount} ghDisabled=${ghDisabled} ashbyDisabled=${ashbyDisabled}`);
