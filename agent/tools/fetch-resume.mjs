// Fetch the applicant's real resume PDF out of Jobright into $AGENT_WORK_DIR.
//
// A fresh cloud container has no resume file, and the finishers all need one
// (Greenhouse/Ashby/Lever make the attachment a required field). The canonical
// copy lives in Jobright, where the user uploaded it; this pulls it with the
// logged-in session cookies that `worker/jobright-agent.mjs login` leaves in
// $AGENT_WORK_DIR/jobright-state.json.
//
//   node agent/tools/fetch-resume.mjs          # primary resume
//
// Never invents or regenerates a resume — if Jobright has none, it exits
// non-zero so the caller parks the day instead of sending a made-up CV.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const WORK = process.env.AGENT_WORK_DIR;
if (!WORK) throw new Error("AGENT_WORK_DIR is required");
const OUT = path.join(WORK, "Hui_Mao_Backend_Software_Engineer.pdf");

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  args: ["--no-sandbox", "--ssl-version-max=tls1.2"],
});
const ctx = await browser.newContext({ storageState: path.join(WORK, "jobright-state.json") });
const page = await ctx.newPage();
await page.goto("https://jobright.ai/jobs/resume", { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(2500);

const list = await page.evaluate(async () => {
  const res = await fetch("/swan/resume/collection/get", { credentials: "include" });
  return res.json();
});
const resumes = list?.result ?? [];
if (!resumes.length) {
  console.log(JSON.stringify({ ok: false, reason: "no resume stored in jobright" }));
  await browser.close();
  process.exit(2);
}
const pick = resumes.find((r) => r.primary) ?? resumes[0];
const b64 = await page.evaluate(async (id) => {
  const res = await fetch(`/swan/resume/preview?resumeId=${id}`, { credentials: "include" });
  const buf = new Uint8Array(await res.arrayBuffer());
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
}, pick.resumeId);
const bytes = Buffer.from(b64, "base64");
if (bytes.slice(0, 5).toString() !== "%PDF-") {
  console.log(JSON.stringify({ ok: false, reason: "download was not a PDF" }));
  await browser.close();
  process.exit(3);
}
fs.writeFileSync(OUT, bytes);
console.log(JSON.stringify({ ok: true, file: OUT, bytes: bytes.length, resumeName: pick.resumeNameWithSuffix }));
await browser.close();
