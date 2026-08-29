import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const WORK = process.env.AGENT_WORK_DIR;
const REPO = process.env.REPO_DIR;
const targets = JSON.parse(fs.readFileSync(path.join(WORK, "repass.json"), "utf8"));
const ANS = path.join(WORK, "repass-answers.json");
const log = (o) => fs.appendFileSync(path.join(WORK, "repass-results.jsonl"), JSON.stringify(o) + "\n");
for (const t of targets) {
  console.log(`START ${t.company} (${t.match}%)`);
  fs.rmSync(path.join(WORK, "gh-code.txt"), { force: true });
  const out = await new Promise((resolve) => {
    const p = spawn("node", [path.join(REPO, "agent/finishers/gh-finish.mjs"), t.url, ANS, "--submit"], { cwd: REPO, env: process.env });
    let o = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), 480000);
    p.stdout.on("data", (d) => { o += d; });
    p.stderr.on("data", (d) => { if (/WAITING_FOR_CODE/.test(d.toString())) console.log("NEED_CODE " + t.company); });
    p.on("exit", () => { clearTimeout(timer); resolve(o); });
  });
  let res = null;
  try { res = JSON.parse(out.slice(out.indexOf("{"))); } catch {}
  const ok = Boolean(res?.confirmation);
  console.log(ok ? `OK ${t.company}` : `FAILED ${t.company}: ${JSON.stringify(res?.missingRequired ?? res?.errors ?? res?.error ?? "?").slice(0, 140)}`);
  log({ ...t, ok, missing: res?.missingRequired, combos: res?.combos, at: new Date().toISOString() });
  await new Promise((r) => setTimeout(r, 180000));
}
console.log("REPASS DONE");
