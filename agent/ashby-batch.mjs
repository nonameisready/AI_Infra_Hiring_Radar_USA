#!/usr/bin/env node
/**
 * Ashby batch — works the Ashby backlog from the user's own Mac.
 *
 *   node agent/ashby-batch.mjs --prep              # build today's worklist + answer sheet, no browser
 *   node agent/ashby-batch.mjs --count 10          # assisted run: fills 10 forms, you click Submit
 *   node agent/ashby-batch.mjs --count 10 --dry    # fill + screenshot only, never submits
 *
 * Why this is assisted and not automatic
 * -------------------------------------
 * Ashby's spam detection rejects Playwright submissions regardless of IP or
 * headless mode. That was tested on 2026-08-27 from this user's own residential
 * network with a real headed browser window and it still flagged (RUNBOOK,
 * "Ashby verdict"). Getting past it would mean defeating an anti-bot control,
 * which the standing rules forbid outright. So this script does everything up
 * to the submit click — picks the jobs, opens the form, uploads the resume,
 * answers every question — and the user clicks Submit. ashby-finish.mjs then
 * watches for the confirmation page and only a real confirmation is booked.
 *
 * --prep is the part that IS safe to schedule daily: it needs no browser and no
 * human, and it leaves a ready worklist and per-job answer sheet so a sitting
 * costs a couple of minutes per job instead of re-deriving every answer.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = process.env.REPO_DIR ?? process.cwd();
const WORK = process.env.AGENT_WORK_DIR ?? path.join(REPO, ".agent-work");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const PREP = flag("prep");
const DRY = flag("dry");
const COUNT = Number(opt("count", PREP ? 9999 : 10));
const PACE_MS = Number(opt("pace", 5)) * 1000;

const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const log = (m) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(l);
  try { fs.appendFileSync(path.join(WORK, "ashby-batch.log"), l + "\n"); } catch {} };

fs.mkdirSync(WORK, { recursive: true });

// ---------------------------------------------------------------- selection --
const ap = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/applied.json"), "utf8"));
const pd = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/pending.json"), "utf8"));
const pend = pd.items ?? pd;

// Same standing blocks the Greenhouse batch enforces. Kept in sync by hand;
// local-batch.mjs is the source of truth for the wording of each rule.
const DEFENSE_BLOCK = /palantir|peregrine|freedom ?(technology|consulting)|nt ?concepts|anduril|varda|havocai|\bstr\b|l3harris|lockheed|raytheon|\brtx\b|northrop|general dynamics|bae systems|leidos|booz allen|draper|mitre|sierra nevada corp|epirus|shield ?ai|saronic|castelion|mach industries|helsing|wyetech|maxar|vantor|intrepid solutions|oklo|spacex|sphinx ?defense|\bdefense\b|arcfield|accenture federal|legion intelligence|rampant technologies|rackner|tria federal|\btria\b|metrostar|applied intuition|dzyne|rhombus power|base-2 solutions|mclaurin aerospace|protolabs|hii-tsd|\bhii\b|vannevar|two ?six|\bcaci\b|\bsaic\b|parry ?labs|firestorm|ursa major|x-?bow|primer ?ai|sev1tech|peraton|\bgdit\b|nightwing|noblis|amentum/i;
const NO_REAPPLY = /\bramp\b|\bmercor\b/i;
const USER_BLOCK = /\baxon\b|\bgrvty\b|\bamazon\b|capital one|^\s*sas\b|\bsas institute\b|\bcisco\b|\bhp\b|\bhpe\b|hewlett/i;
// User directive 2026-09-15: W2 only, so a 1099/contract posting is not work to
// park, it is work to drop.
const CONTRACT_BLOCK = /\b(1099|c2c|corp[- ]to[- ]corp)\b|\bcontract(or)? (role|position|opportunity)\b|\((contract|contractor|1099)\)|\b(contract|contractor)\s*[-–—:]\s|[-–—:]\s*(contract|contractor|1099)\s*$|\bindependent contractor\b|\bw2 or c2c\b/i;
const COOLDOWN = [
  { re: /\bcanonical\b/i, until: "2027-09-13" },
  { re: /jpmorgan|\bchase\b/i, until: "2027-09-13" },
  { re: /bank of america|\bbofa\b/i, until: "2027-09-13" },
];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// An Ashby posting's identity is the uuid in its url.
const ashbyId = (u) => (String(u ?? "").match(/ashbyhq\.com\/[^/]+\/([0-9a-f-]{16,})/i) ?? [])[1];

const appliedIds = new Set(Object.keys(ap.jobs));
const appliedKeys = new Set(Object.values(ap.jobs).map((j) => j.key ?? `${norm(j.company)}::${norm(j.title)}`));
const appliedAshby = new Set(Object.values(ap.jobs).map((j) => ashbyId(j.originalUrl)).filter(Boolean));

const skips = {};
const skip = (w) => { skips[w] = (skips[w] ?? 0) + 1; };
const queue = [];
for (const j of pend) {
  const url = String(j.atsUrl ?? "");
  if (!/ashbyhq\.com/i.test(url)) continue;
  if (["applied", "closed", "dropped", "manual_done", "already_applied_externally"].includes(j.status)) continue;
  const co = j.company ?? "";
  if (DEFENSE_BLOCK.test(co)) { skip("defense/clearance"); continue; }
  if (NO_REAPPLY.test(co)) { skip("no-reapply"); continue; }
  if (USER_BLOCK.test(co)) { skip("user block"); continue; }
  if (CONTRACT_BLOCK.test(j.title ?? "")) { skip("contract (W2 only)"); continue; }
  const cool = COOLDOWN.find((c) => c.re.test(co) && new Date() < new Date(c.until));
  if (cool) { skip(`cooldown to ${cool.until}`); continue; }
  const key = j.key ?? `${norm(co)}::${norm(j.title)}`;
  const aid = ashbyId(url);
  if (appliedIds.has(j.id) || appliedKeys.has(key) || (aid && appliedAshby.has(aid))) { skip("already applied"); continue; }
  queue.push({ id: j.id, key, company: co, title: j.title, matchPercent: j.matchPercent ?? 0, atsUrl: url });
}
queue.sort((a, b) => b.matchPercent - a.matchPercent);
log(`ashby backlog: ${queue.length} open${Object.keys(skips).length ? ` | skipped: ${JSON.stringify(skips)}` : ""}`);

// ------------------------------------------------------------- answer sheet --
// Straight from profile.json and the user's own answers, so a sitting is
// clicking and confirming rather than deciding. Anything genuinely unknown is
// left blank on purpose rather than guessed.
const pr = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/profile.json"), "utf8"));
const SHEET = [
  `姓名 ${pr.fullName}   邮箱 ${pr.email}   电话 ${pr.phone}`,
  `地点 ${pr.location}（Jersey City, NJ — 纽约都会区）   LinkedIn ${pr.linkedin}`,
  `是否有工作授权 → Yes（F-1 CPT/EAD，有效期至 2027-05-31）`,
  `是否需要 sponsorship → Yes（cap-exempt H-1B transfer，H-1B 已批准并启用过，I-140 已批）`,
  `当前身份 → F-1。绝不要选 citizen / green card / permanent resident`,
  `年限 → 约 7 年（选诚实的区间）   期望薪资 → $150,000+ base`,
  `Notice period → 两周`,
  `是否在考虑其它 offer → 没有`,
  `是否受竞业/离职后限制 → 不受约束`,
  `每周超过 40 小时 → Yes    出差 → 可以，25% 以上也行`,
  `能否以 1099/独立承包商身份工作 → No（只能 W2）`,
  `是否曾在该公司工作过 → No，但如果公司是 BlackRock 或 Bank of America，答 Yes（她确实在那里工作过）`,
  `EEO / veteran / disability → decline to answer`,
  `任何保密协议、仲裁协议、AI 使用声明、自费搬家承诺 → 你本人决定，代理不代答`,
];

if (PREP) {
  const worklist = queue.slice(0, COUNT);
  fs.writeFileSync(path.join(WORK, "ashby-worklist.json"), JSON.stringify(worklist, null, 1));
  const md = [
    `# Ashby 待投清单 — ${today}`, ``,
    `共 ${worklist.length} 个。逐个跑：\`node agent/ashby-batch.mjs --count 10\``,
    `代理会自动填好表单并停在 Submit 前，你确认无误后点 Submit。`, ``,
    `## 标准答案（每个表单都一样）`, ``,
    ...SHEET.map((l) => `- ${l}`), ``,
    `## 职位`, ``,
    ...worklist.map((j, i) => `${i + 1}. **${j.company}** — ${j.title} (${j.matchPercent}%)\n   ${j.atsUrl}`),
  ].join("\n");
  fs.writeFileSync(path.join(REPO, "data/agent/ASHBY-TODO.md"), md + "\n");
  log(`prep done → data/agent/ASHBY-TODO.md (${worklist.length} jobs) and ${path.join(WORK, "ashby-worklist.json")}`);
  process.exit(0);
}

// ------------------------------------------------------------------ assisted --
const RESUME = path.join(WORK, "HUI_MAO_AI_Engineer_2026.pdf");
if (!fs.existsSync(RESUME)) {
  const src = process.env.RESUME_PDF;
  if (src && fs.existsSync(src)) fs.copyFileSync(src, RESUME);
  else { log(`简历不在 ${RESUME}，也没有 RESUME_PDF 环境变量 — 先设置再跑`); process.exit(2); }
}

const runFinisher = (url) => new Promise((resolve) => {
  const p = spawn("node", [path.join(REPO, "agent/finishers/ashby-finish.mjs"), url, ...(DRY ? [] : ["--submit"])], {
    cwd: REPO,
    // HEADED so the user can see and finish the form; ASSIST so the finisher
    // waits for their Submit click and then verifies the confirmation page.
    env: { ...process.env, AGENT_WORK_DIR: WORK, REPO_DIR: REPO, HEADED: "1", ASSIST: DRY ? "" : "1" },
  });
  let out = "", err = "";
  const timer = setTimeout(() => p.kill("SIGKILL"), 12 * 60_000);
  p.stdout.on("data", (d) => { out += d; });
  p.stderr.on("data", (d) => { err += d; const s = String(d); if (/ASSIST_NEEDED/.test(s)) log("  ↳ 需要你在窗口里点 Submit"); });
  p.on("exit", () => {
    clearTimeout(timer);
    let j = {};
    const i = out.indexOf("{");
    if (i >= 0) { try { j = JSON.parse(out.slice(i)); } catch {} }
    resolve({ j, err });
  });
});

console.log("\n" + SHEET.map((l) => "  " + l).join("\n") + "\n");
log(`assisted run: ${Math.min(COUNT, queue.length)} job(s)${DRY ? " (dry — 不会提交)" : ""}`);

let confirmed = 0, spamFlags = 0, consecutiveSpam = 0, failed = 0;
const booked = [];
for (const job of queue.slice(0, COUNT)) {
  log(`${job.company} — ${job.title} (${job.matchPercent}%)`);
  const { j } = await runFinisher(job.atsUrl);

  if (j.confirmation) {
    confirmed++; consecutiveSpam = 0;
    booked.push({ ...job, assisted: !!j.assisted });
    // Book immediately: a crash later must not lose a real submission.
    ap.jobs[job.id] = {
      id: job.id, key: job.key, title: job.title, company: job.company,
      matchPercent: job.matchPercent, originalUrl: job.atsUrl,
      status: "applied_direct", at: today, via: "ashby (mac, user-submitted)",
      detail: j.assisted
        ? "Agent filled the form on the user's Mac; the user clicked Submit; Ashby confirmation page verified."
        : "Agent filled and submitted from the user's Mac; Ashby confirmation page verified.",
    };
    const pi = pend.findIndex((x) => x.id === job.id);
    if (pi >= 0) { pend[pi].status = "applied"; pend[pi].note = `${today}: submitted from the Mac, Ashby confirmation verified.`; }
    ap.updatedAt = pd.updatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(REPO, "data/agent/applied.json"), JSON.stringify(ap, null, 1) + "\n");
    fs.writeFileSync(path.join(REPO, "data/agent/pending.json"), JSON.stringify(pd, null, 1) + "\n");
    log(`  ✔ confirmed (${confirmed})`);
  } else {
    failed++;
    const spam = !!j.retriedAfterSpamFlag || /flagged as possible spam/i.test(j.confirmationSnippet ?? "");
    if (spam) { spamFlags++; consecutiveSpam++; } else consecutiveSpam = 0;
    const why = spam ? "Ashby 判定为垃圾流量（内建的一次重试也已用完）"
      : j.error ? `error: ${String(j.error).slice(0, 120)}`
      : (j.errs ?? j.errors ?? []).length ? `form errors: ${JSON.stringify(j.errors ?? j.errs).slice(0, 160)}`
      : "no confirmation page";
    const pi = pend.findIndex((x) => x.id === job.id);
    const note = `${today} ashby (mac): ${why}`;
    if (pi >= 0) { pend[pi].status = "user_manual"; pend[pi].note = note; }
    fs.writeFileSync(path.join(REPO, "data/agent/pending.json"), JSON.stringify(pd, null, 1) + "\n");
    log(`  ✘ ${why}`);
    // Standing rule: two spam flags parks the lane; two in a row stops it.
    if (consecutiveSpam >= 2) { log("连续两次被判垃圾流量 — 今天停掉 Ashby，约 3 小时后再试"); break; }
    if (spamFlags >= 2) { log("今天累计两次垃圾流量标记 — 停掉 Ashby 这条线"); break; }
  }
  await new Promise((r) => setTimeout(r, PACE_MS));
}

// ---------------------------------------------------------------- bookkeeping --
if (booked.length) {
  fs.appendFileSync(path.join(REPO, "data/agent/APPLIED.md"),
    `\n## ${today} (Ashby, Mac — user-submitted)\n\n` +
    `${booked.length} confirmed. All-time ${Object.keys(ap.jobs).length}.\n` +
    booked.map((b) => `- ${b.company} — ${b.title} (${b.matchPercent}%) — ashby, confirmation page verified${b.assisted ? " (user clicked Submit)" : ""}\n`).join(""));
}
log(`DONE: ${confirmed} confirmed / ${failed} not confirmed / ${queue.length - Math.min(COUNT, queue.length)} still queued. All-time ${Object.keys(ap.jobs).length}.`);
if (booked.length && !DRY) {
  const sh = (c) => { try { return execSync(c, { cwd: REPO, stdio: "pipe" }).toString(); } catch (e) { return String(e.message); } };
  sh("git add data/agent");
  sh(`git commit -m "Ashby batch ${today}: ${booked.length} confirmed from the Mac"`);
  sh("git push -f origin HEAD:ashby-local-results");
  log("pushed to branch ashby-local-results");
}
