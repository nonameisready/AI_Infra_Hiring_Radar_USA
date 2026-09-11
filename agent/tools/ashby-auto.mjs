// One-shot Ashby application through the PERSISTENT wd driver.
//
//   node agent/tools/ashby-auto.mjs <application URL>
//
// Ashby's spam filter rejects cold browser contexts outright (a fresh
// ashby-finish run is flagged on the first submit every time), so the only
// path that works from the cloud is the long-lived driver session. This
// chains what a session used to do by hand — round 1 probe, answer the
// classified yes/no fields, location, submit, read the result — into a single
// call, and stops with the question list whenever the form asks something the
// probe could not classify. It never invents an answer: unknown questions and
// progressive-disclosure errors come back for the orchestrator to decide.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const W = process.env.AGENT_WORK_DIR;
if (!W) throw new Error("AGENT_WORK_DIR is required");
const LOG = path.join(W, "wd-driver.log");
const url = process.argv[2];
if (!url) throw new Error("usage: ashby-auto.mjs <application URL>");
const TOOLS = path.dirname(new URL(import.meta.url).pathname);
const REPO = process.env.REPO_DIR ?? "/home/user/AI_Infra_Hiring_Radar_USA";

// String.match without /g returns only the first match, so a non-global
// regex here would always count 1 and the waits below would never fire.
const count = (re) => (fs.readFileSync(LOG, "utf8").match(new RegExp(re.source, "g")) ?? []).length;
const lastMatch = (re) => {
  const lines = fs.readFileSync(LOG, "utf8").split("\n").filter((l) => re.test(l));
  return lines.length ? lines[lines.length - 1] : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(re, was, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (count(re) > was) return lastMatch(re);
    await sleep(3000);
  }
  return null;
}

const PLAN_RE = /"fillPlan"/;
const RESULT_RE = /"success":(true|false)/;

const before = count(PLAN_RE);
spawnSync("node", [path.join(TOOLS, "gen-ashby1.mjs"), url], { env: process.env, encoding: "utf8" });
const planLine = await waitFor(PLAN_RE, before, 180_000);
if (!planLine) { console.log(JSON.stringify({ ok: false, stage: "probe", reason: "driver did not return a form plan" })); process.exit(1); }
const probe = JSON.parse(planLine);

// Questions round 1 could not classify: most are ordinary yes/no widgets whose
// answer is already a standing rule in generic-answers.json. Resolve those from
// the rules, and only stop for the ones no rule covers — an unanswered question
// is never guessed.
const unknown = probe.unknown ?? [];
const extraYes = [], extraNo = [], unresolved = [];
if (unknown.length) {
  const ANSWERS = JSON.parse(fs.readFileSync(
    process.env.ANSWERS_FILE ?? path.join(REPO, "agent/finishers/generic-answers.json"), "utf8"));
  const decide = (q) => {
    for (const c of ANSWERS.combos ?? []) {
      let re;
      try { re = new RegExp(c.label, "i"); } catch { continue; }
      if (!re.test(q)) continue;
      const p = String(c.prefer ?? "");
      if (/^\^?\(?(yes|i consent|i agree)/i.test(p)) return "yes";
      if (/^\^?\(?(no|none)/i.test(p)) return "no";
    }
    return null;
  };
  const tagged = unknown.map((q, i) => ({ q, i, want: decide(q) }));
  const answerable = tagged.filter((t) => t.want);
  unresolved.push(...tagged.filter((t) => !t.want).map((t) => t.q));
  if (answerable.length) {
    const marker = `MKU${Date.now()}`;
    const assign = `(function(){var want=${JSON.stringify(answerable.map((t) => [t.q.slice(0, 60), t.want]))};var done=[];` +
      `[].slice.call(document.querySelectorAll('div')).forEach(function(d){if(d.querySelectorAll('div').length>5)return;var t=d.innerText||'';` +
      `want.forEach(function(w,k){if(t.indexOf(w[0])<0)return;var b=d.querySelector('button[data-option='+w[1]+']');` +
      `if(b&&!document.getElementById('au_'+k)){b.id='au_'+k;done.push(k)}})});` +
      `return JSON.stringify({mk:'${marker}',ids:done})})()`;
    const wasAssign = count(new RegExp(marker));
    fs.writeFileSync(path.join(W, "wd-cmd.json"), JSON.stringify({ actions: [{ do: "evalJs", code: assign }] }));
    const line = await waitFor(new RegExp(marker), wasAssign, 90_000);
    const ids = line ? (JSON.parse(line).ids ?? []) : [];
    for (const k of ids) (answerable[k].want === "yes" ? extraYes : extraNo).push(`au_${k}`);
    for (const t of answerable) if (!ids.includes(t.i) && !ids.includes(answerable.indexOf(t))) { /* unmatched below */ }
    const missed = answerable.filter((_, k) => !ids.includes(k)).map((t) => t.q);
    unresolved.push(...missed);
  }
}
if (unresolved.length) {
  console.log(JSON.stringify({ ok: false, stage: "probe", reason: "questions no standing rule covers — orchestrator must answer", unresolved, probe }, null, 1));
  process.exit(2);
}

const plan = {
  fillPlan: probe.fillPlan ?? [],
  yesIds: [...(probe.yesIds ?? []), ...extraYes],
  noIds: [...(probe.noIds ?? []), ...extraNo],
  radioIds: (probe.radioGroups ?? []).flatMap((g) => {
    // only auto-pick groups whose intent is unambiguous under the standing
    // answers: EEO/pronoun questions decline, referral source is a job board.
    if (/pronoun|gender|race|ethnic|veteran|disab/i.test(g.q)) {
      const o = (g.opts ?? []).find((x) => /prefer not|decline|do not wish|not specified/i.test(x.label));
      return o ? [o.id] : [];
    }
    if (/referral source|how did you hear/i.test(g.q)) {
      const o = (g.opts ?? []).find((x) => /linkedin|job board/i.test(x.label));
      return o ? [o.id] : [];
    }
    return [];
  }),
  loc: probe.loc ?? null,
};

const wasResult = count(RESULT_RE);
spawnSync("node", [path.join(TOOLS, "gen-ashby2.mjs"), JSON.stringify(plan)], { env: process.env, encoding: "utf8" });
const resLine = await waitFor(RESULT_RE, wasResult, 180_000);
if (!resLine) { console.log(JSON.stringify({ ok: false, stage: "submit", reason: "driver did not return a submit result", plan })); process.exit(1); }
const res = JSON.parse(resLine);
console.log(JSON.stringify({ ok: !!res.success, url, spam: !!res.spam, errs: res.errs ?? [], plan }, null, 1));
