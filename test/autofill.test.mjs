#!/usr/bin/env node
/**
 * Drives public/autofill.js against offline copies of the three ATS form styles
 * the radar actually meets: a classic Greenhouse form, a Lever form, and a
 * genuinely React-controlled form in Ashby's shape.
 *
 *   node test/autofill.test.mjs
 *
 * PLAYWRIGHT_CHROMIUM_PATH can point at an existing Chromium build.
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const AUTOFILL = fs.readFileSync(path.join(root, "public", "autofill.js"), "utf8");

const PROFILE = {
  firstName: "Test",
  lastName: "Candidate",
  email: "test.candidate@example.com",
  phone: "+1 415 555 0100",
  location: "San Francisco, CA",
  linkedin: "https://linkedin.com/in/testcandidate",
  github: "https://github.com/testcandidate",
  website: "https://example.com",
  workAuth: "US Citizen",
  needsSponsor: false,
  usAuthorized: true,
  gender: "Decline To Self Identify",
  race: "Decline To Self Identify",
  veteran: "I am not a protected veteran",
  disability: "No, I do not have a disability",
  coverLetter: "I am excited about this role.",
  customAnswers: JSON.stringify([{ match: "how did you hear", value: "Company website" }]),
};

const RESUME_BYTES = Buffer.from("%PDF-1.4\n% test resume\n");
const RESUME = {
  fileName: "resume-ai.pdf",
  mimeType: "application/pdf",
  base64: RESUME_BYTES.toString("base64"),
};

// --- static server so Chromium never leaves localhost ----------------------
const MIME = { ".html": "text/html", ".js": "text/javascript" };
const VENDOR = {
  "/vendor/react.js": path.join(root, "node_modules/react/umd/react.development.js"),
  "/vendor/react-dom.js": path.join(root, "node_modules/react-dom/umd/react-dom.development.js"),
};

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const file = VENDOR[url] ?? path.join(here, "fixtures", path.basename(url));
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "text/plain" }).end(data);
  });
});

const port = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});
const BASE = `http://127.0.0.1:${port}`;

// --- helpers ---------------------------------------------------------------
let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n      ${e.message.split("\n")[0]}`);
    failed++;
  }
}

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const context = await browser.newContext();

const resumeDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-test-"));
const resumePath = path.join(resumeDir, RESUME.fileName);
fs.writeFileSync(resumePath, RESUME_BYTES);

async function runAutofill(page, { submit = false, useDataTransfer = true } = {}) {
  await page.evaluate(`(() => { ${AUTOFILL} })()`);
  return page.evaluate(
    ([profile, resume, opts]) => window.__radarAutofill({ profile, resume }, opts),
    [PROFILE, useDataTransfer ? RESUME : null, { submit, overwrite: false }],
  );
}

// --- 1. Greenhouse ---------------------------------------------------------
console.log("\nGreenhouse-style form");
{
  const page = await context.newPage();
  await page.goto(`${BASE}/greenhouse.html`);
  const report = await runAutofill(page);

  const val = (sel) => page.inputValue(sel);

  check("first name filled", assertEq(await val("#first_name"), "Test"));
  check("last name filled", assertEq(await val("#last_name"), "Candidate"));
  check("email filled", assertEq(await val("#email"), PROFILE.email));
  check("phone filled", assertEq(await val("#phone"), PROFILE.phone));
  check("linkedin filled", assertEq(await val("#question_linkedin"), PROFILE.linkedin));
  check("github filled", assertEq(await val("#question_github"), PROFILE.github));
  check("website filled", assertEq(await val("#question_website"), PROFILE.website));
  check("location filled", assertEq(await val("#question_location"), PROFILE.location));
  check("work authorization → Yes", assertEq(await selectedText(page, "#q_authorized"), "Yes"));
  check("sponsorship → No", assertEq(await selectedText(page, "#q_sponsor"), "No"));
  check("custom answer used for 'how did you hear'", assertEq(await val("#q_hear"), "Company website"));
  check("gender EEO", assertEq(await selectedText(page, "#gender"), "Decline To Self Identify"));
  check("veteran EEO", assertEq(await selectedText(page, "#veteran_status"), "I am not a protected veteran"));
  check("disability EEO", assertEq(await selectedText(page, "#disability_status"), "No, I do not have a disability"));
  check("resume attached via DataTransfer", assertEq(report.resumeAttached, true));
  check(
    "cover-letter upload left alone",
    assertEq(await page.evaluate(() => document.getElementById("cover_letter").files.length), 0),
  );
  check("not submitted in fill-only mode", assertEq(report.submitted, false));
  await page.close();
}

// --- 2. Lever --------------------------------------------------------------
console.log("\nLever-style form");
{
  const page = await context.newPage();
  await page.goto(`${BASE}/lever.html`);
  const report = await runAutofill(page);

  check("combined full-name field", assertEq(await page.inputValue('[name="name"]'), "Test Candidate"));
  check("email filled", assertEq(await page.inputValue('[name="email"]'), PROFILE.email));
  check("urls[LinkedIn] filled", assertEq(await page.inputValue('[name="urls[LinkedIn]"]'), PROFILE.linkedin));
  check("urls[GitHub] filled", assertEq(await page.inputValue('[name="urls[GitHub]"]'), PROFILE.github));
  check("cover letter into textarea", assertEq(await page.inputValue("#comments"), PROFILE.coverLetter));
  check(
    "work-auth radio → Yes",
    assertEq(await page.isChecked('input[name="cards[auth][field0]"][value="Yes"]'), true),
  );
  check(
    "sponsorship radio → No",
    assertEq(await page.isChecked('input[name="cards[sponsor][field0]"][value="No"]'), true),
  );
  check("resume attached", assertEq(report.resumeAttached, true));
  await page.close();
}

// --- 3. React-controlled (Ashby shape) -------------------------------------
console.log("\nReact-controlled form (the case naive autofillers fail)");
{
  const page = await context.newPage();
  await page.goto(`${BASE}/ashby-react.html`);
  await page.waitForSelector("#react-state");

  // Playwright drives the file input the way the worker does.
  await page.setInputFiles("#resume_file", resumePath);
  const report = await runAutofill(page, { useDataTransfer: false });

  const state = JSON.parse(await page.textContent("#react-state"));

  check("React state has the name (not just the DOM)", assertEq(state.name, "Test Candidate"));
  check("React state has the email", assertEq(state.email, PROFILE.email));
  check("React state has the phone", assertEq(state.phone, PROFILE.phone));
  check("React state has the location", assertEq(state.location, PROFILE.location));
  check("React state has linkedin", assertEq(state.linkedin, PROFILE.linkedin));
  check("React state has github", assertEq(state.github, PROFILE.github));
  check("controlled radio → authorized Yes", assertEq(state.auth, "Yes"));
  check("controlled radio → sponsorship No", assertEq(state.sponsor, "No"));
  check("worker-attached resume survives", assertEq(
    await page.evaluate(() => document.getElementById("resume_file").files[0]?.name),
    "resume-ai.pdf",
  ));
  check("fields reported", assertEq(report.filled.length >= 7, true));
  await page.close();
}

// --- 4. submit path --------------------------------------------------------
console.log("\nSubmit path");
{
  const page = await context.newPage();
  await page.goto(`${BASE}/greenhouse.html`);
  const report = await runAutofill(page, { submit: true });
  check("submit button found and clicked", assertEq(report.submitted, true));
  check(
    "page observed the submit",
    assertEq(await page.getAttribute("body", "data-submitted"), "true"),
  );
  await page.close();
}

// --- 5. nothing to fill ----------------------------------------------------
console.log("\nNon-application page");
{
  const page = await context.newPage();
  await page.setContent("<html><body><h1>Careers</h1><p>No form here.</p></body></html>");
  const report = await runAutofill(page);
  check("fills nothing", assertEq(report.filled.length, 0));
  check("reports no file inputs", assertEq(report.fileInputs, 0));
  await page.close();
}

fs.rmSync(resumeDir, { recursive: true, force: true });
await context.close();
await browser.close();
server.close();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// Small helpers kept at the bottom so the assertions above read as a list.
function assertEq(actual, expected) {
  return () => assert.deepEqual(actual, expected);
}

async function selectedText(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el.options[el.selectedIndex]?.text ?? "";
  }, selector);
}
