// Write $AGENT_WORK_DIR/autofill-profile.json from the repo's profile + memory.
//
// Every finisher (run-apply, gh-finish, lever-finish, ashby-finish, rippling)
// reads this file at import time, so a work dir without it makes ATS discovery
// fail instantly and the whole batch logs "no ATS url" — which is exactly how
// the 2026-09-12 cloud batch lost its first 45 jobs. The Mac batch builds it in
// local-batch.mjs; this is the same writer for any other machine.
//
//   node agent/tools/make-profile.mjs
import fs from "node:fs";
import path from "node:path";

const WORK = process.env.AGENT_WORK_DIR;
if (!WORK) throw new Error("AGENT_WORK_DIR is required");
const REPO = process.env.REPO_DIR ?? "/home/user/AI_Infra_Hiring_Radar_USA";
const profile = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/profile.json"), "utf8"));
const memory = JSON.parse(fs.readFileSync(path.join(REPO, "data/agent/memory.json"), "utf8"));
const out = path.join(WORK, "autofill-profile.json");

fs.writeFileSync(out, JSON.stringify({
  firstName: profile.firstName, lastName: profile.lastName, email: profile.email,
  phone: profile.phone, location: profile.location, linkedin: profile.linkedin,
  github: profile.github, website: profile.website, workAuth: profile.workAuth,
  needsSponsor: profile.needsSponsor, usAuthorized: profile.usAuthorized,
  gender: "Decline to self identify", race: "Decline to self identify",
  veteran: "I don't wish to answer", disability: "I don't wish to answer", coverLetter: "",
  customAnswers: JSON.stringify((memory.answers ?? []).map((a) => ({ match: a.match, value: a.answer }))),
}, null, 1));
console.log(JSON.stringify({ ok: true, file: out }));
