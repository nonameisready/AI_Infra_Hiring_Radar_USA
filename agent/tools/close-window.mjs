// Fold one cloud window's lane results into pending.json (statuses + notes) and
// print the list of postings whose submission still needs a Gmail confirmation
// before it may be booked. It never books anything itself: only a confirmation
// the orchestrator has actually seen turns a submit into an applied row.
//
//   node agent/tools/close-window.mjs            # report + write pending statuses
//   node agent/tools/close-window.mjs --dry      # report only
import fs from "node:fs";
import path from "node:path";

const WORK = process.env.AGENT_WORK_DIR;
if (!WORK) throw new Error("AGENT_WORK_DIR is required");
const REPO = process.env.REPO_DIR ?? "/home/user/AI_Infra_Hiring_Radar_USA";
const DRY = process.argv.includes("--dry");
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

const ashby = read(path.join(WORK, "ashby-lane-results.jsonl"));
const batch = read(path.join(WORK, "batch-results.jsonl"));
const pd = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/pending.json"), "utf8"));
const byId = new Map(pd.items.map((x) => [x.id, x]));
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

const awaiting = [];       // submitted on-page, not yet confirmed by email
const forUser = [];        // needs the applicant herself
const unanswered = [];     // questions no standing rule covers

const note = (it, status, reason, extra) => {
  if (!it) return;
  it.status = status;
  it.reason = reason;
  if (extra) it.note = extra;
  it.updatedAt = today;
};

for (const r of ashby) {
  if (!r.id) continue;
  const it = byId.get(r.id);
  const row = { id: r.id, company: r.company, title: r.title, match: r.match, url: r.url };
  if (r.result === "submitted") { awaiting.push(row); note(it, "submitted_unconfirmed", `${today} cloud: Ashby driver reported on-page success with no spam flag. Check from:ashbyhq.com before counting or re-applying.`); }
  else if (r.result === "spam_flagged") { forUser.push({ ...row, why: "Ashby flagged the datacenter IP as spam twice" }); note(it, "user_manual", `${today} cloud: Ashby's spam filter rejected two submissions from this container's IP. The form is fully worked out — about two minutes from a residential browser.`); }
  else if (r.result === "needs_answers") { unanswered.push({ ...row, questions: r.unresolved ?? [] }); note(it, "needs_answers", `${today} cloud: form asks something no standing rule covers.`, (r.unresolved ?? []).join(" | ")); }
  else if (r.result === "failed" || r.result === "driver_error") { note(it, "parked", `${today} cloud: Ashby lane could not complete the form (${(r.errs ?? []).join("; ").slice(0, 160) || r.result}).`); }
}

for (const r of batch) {
  if (!r.id) continue;
  const it = byId.get(r.id);
  const row = { id: r.id, company: r.company, title: r.title, match: r.matchPercent, url: r.atsUrl };
  if (r.status === "submitted") { awaiting.push({ ...row, via: r.via }); note(it, "submitted_unconfirmed", `${today} cloud: ${r.via} reported a confirmation page. Verify the acknowledgement mail before booking.`); }
  else if (r.status === "needs_answers") { unanswered.push({ ...row, questions: r.missing ?? [] }); note(it, "needs_answers", `${today} cloud: required questions with no standing answer.`, JSON.stringify(r.unmatched ?? r.missing ?? [])); }
  else if (r.status === "park") { note(it, "parked", `${today} cloud: ${r.reason ?? "parked"}`); }
}

if (!DRY) {
  pd.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(REPO, "data/agent/pending.json"), JSON.stringify(pd, null, 2) + "\n");
}
console.log(JSON.stringify({ awaitingConfirmation: awaiting, forUser, unanswered }, null, 1));
