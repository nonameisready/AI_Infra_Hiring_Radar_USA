// Book a confirmed application that never passed through pending.json.
//
//   node book-fresh.mjs '<queue file>' '<companyRegex>' '<detail>'
//
// book-generic.mjs moves a PENDING row into applied.json, which is right for the
// backlog lanes but useless for a fresh Jobright match applied to on the same
// day — it was never parked, so there is no pending row to move. This books the
// queue entry itself, with the same dedupe rules book-generic enforces: never
// twice by Jobright id, by company::title key, or by Greenhouse board token.
import fs from "node:fs";

const REPO = "/home/user/AI_Infra_Hiring_Radar_USA";
const [queueFile, companyRe, detail] = process.argv.slice(2);
if (!queueFile || !companyRe || !detail) {
  throw new Error("usage: book-fresh.mjs <queueFile> <companyRegex> <detail>");
}
const rx = new RegExp(companyRe, "i");
const today = process.env.BOOK_DATE
  || new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

const queue = JSON.parse(fs.readFileSync(queueFile, "utf8"));
const job = queue.find((j) => rx.test(j.company ?? ""));
if (!job) throw new Error("not in queue: " + companyRe);

const applied = JSON.parse(fs.readFileSync(`${REPO}/data/agent/applied.json`, "utf8"));
if (applied.jobs[job.id]) throw new Error("already applied (id): " + job.id);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const key = job.key ?? `${norm(job.company)}::${norm(job.title)}`;
if (Object.values(applied.jobs).some((j) => j.key === key)) {
  throw new Error("already applied (key): " + key);
}
const tokenOf = (u) => (String(u ?? "").match(/[?&]token=(\d+)/) ?? [])[1];
const tok = tokenOf(job.atsUrl);
if (tok && Object.values(applied.jobs).some((j) => tokenOf(j.originalUrl) === tok)) {
  throw new Error("already applied (board token): " + tok);
}

applied.jobs[job.id] = {
  id: job.id,
  key,
  title: job.title,
  company: job.company,
  matchPercent: job.matchPercent,
  jobrightUrl: job.jobrightUrl,
  originalUrl: job.atsUrl,
  status: "applied_direct",
  at: today,
  via: "greenhouse (cloud batch)",
  detail,
};
applied.updatedAt = new Date().toISOString();
fs.writeFileSync(`${REPO}/data/agent/applied.json`, JSON.stringify(applied, null, 1));
console.log(`booked #${Object.keys(applied.jobs).length} ${job.company} — ${job.title}`);
