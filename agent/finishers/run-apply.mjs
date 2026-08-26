// One-job apply driver for the supervised first run.
// Usage: node run-apply.mjs <jobrightUrl> [--submit] [--direct <atsUrl>]
// Flow: jobright info page -> dismiss promo modals -> APPLY WITH AUTOFILL
// (popup = company ATS) -> attach resume + autofill -> submit -> verify.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const WORK = process.env.AGENT_WORK_DIR;
const REPO = process.env.REPO_DIR ?? "/home/user/AI_Infra_Hiring_Radar_USA";
const url = process.argv[2];
const SUBMIT = process.argv.includes("--submit");
const directIdx = process.argv.indexOf("--direct");
const directUrl = directIdx > 0 ? process.argv[directIdx + 1] : null;

const AUTOFILL = fs.readFileSync(path.join(REPO, "public/autofill.js"), "utf8");
const PROFILE = JSON.parse(fs.readFileSync(path.join(WORK, "autofill-profile.json"), "utf8"));
const RESUME = path.join(WORK, "Hui_Mao_Backend_Software_Engineer.pdf");
const tag = Date.now();

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  proxy: { server: process.env.HTTPS_PROXY },
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--ssl-version-max=tls1.2"],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
  storageState: path.join(WORK, "jobright-state.json"),
});

const out = { url, steps: [] };
const step = (s, extra = {}) => { out.steps.push({ s, ...extra }); };

async function shot(page, name) {
  const p = path.join(WORK, `${name}-${tag}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

async function dismissModals(page) {
  for (const make of [
    () => page.getByRole("button", { name: /^exit$/i }),
    () => page.locator(".ant-modal-close"),
    () => page.locator('[aria-label="Close"], [aria-label="close"]'),
  ]) {
    for (let i = 0; i < 3; i++) {
      const el = make().first();
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {});
        await page.waitForTimeout(800);
      } else break;
    }
  }
}

try {
  let ats = null;
  let atsUrl = directUrl;

  if (!directUrl) {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3500);
    await dismissModals(page);
    step("jobright-page-open", { pageUrl: page.url() });

    const popupP = ctx.waitForEvent("page", { timeout: 20000 }).catch(() => null);
    const btn = page.getByRole("button", { name: /apply with autofill|apply now|^apply$/i }).first();
    if (!(await btn.isVisible().catch(() => false))) {
      out.result = "no_apply_button";
      out.screenshot = await shot(page, "no-apply-btn");
      throw new Error("no apply button");
    }
    await btn.click();
    step("clicked-apply");
    // Jobright pitches its Chrome extension first; "No, Apply Manually"
    // opens the company ATS directly, which is the path we automate.
    await page.waitForTimeout(2500);
    const manual = page.getByRole("button", { name: /no, apply manually/i }).first();
    if (await manual.isVisible().catch(() => false)) {
      await manual.click().catch(() => {});
      step("declined-extension-pitch");
    }
    ats = await popupP;
    if (!ats) {
      await page.waitForTimeout(3000);
      out.result = "no_popup";
      out.screenshot = await shot(page, "no-popup");
      throw new Error("apply click produced no popup");
    }
    await ats.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => {});
    atsUrl = ats.url();
  } else {
    ats = await ctx.newPage();
    await ats.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  }

  await ats.waitForTimeout(4000);
  step("ats-open", { atsUrl: ats.url() });

  // Some ATS pages show the description first with their own Apply button.
  for (const label of ["Apply for this job", "Apply now", "Apply"]) {
    const b = ats.getByRole("button", { name: label, exact: false }).first();
    if (await b.isVisible().catch(() => false)) {
      const before = ats.url();
      await b.click().catch(() => {});
      await ats.waitForTimeout(2500);
      step("clicked-ats-apply", { from: before, to: ats.url() });
      break;
    }
  }
  await ats.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await ats.waitForTimeout(1500);

  // Resume + fields via the shared autofill runtime; its attach is
  // context-aware, so a "Cover letter" upload never receives the resume.
  const resumeB64 = fs.readFileSync(RESUME).toString("base64");
  await ats.evaluate(`(() => { ${AUTOFILL} })()`);
  const report = await ats.evaluate(
    ([p, r, opts]) => window.__radarAutofill({ profile: p, resume: r }, opts),
    [PROFILE, { base64: resumeB64, fileName: "Hui_Mao_Backend_Software_Engineer.pdf", mimeType: "application/pdf" }, { submit: false, overwrite: false }],
  );
  step("autofilled-1", {
    filled: report.filled.map((f) => `${f.label}=${String(f.value).slice(0, 40)}`),
    skipped: report.skipped.slice(0, 15),
  });

  // ATSes like Rippling parse the resume and only then enable/populate the
  // fields — wait for parsing to finish, then run the filler again.
  await ats
    .waitForFunction(
      () => !/parsing the r[eé]sum|parsing resume/i.test(document.body?.innerText ?? ""),
      { timeout: 90000 },
    )
    .catch(() => step("resume-parse-wait-timeout"));
  await ats.waitForTimeout(2500);
  const report2 = await ats.evaluate(
    ([p, opts]) => window.__radarAutofill({ profile: p, resume: null }, opts),
    [PROFILE, { submit: false, overwrite: false }],
  );
  step("autofilled-2", {
    filled: report2.filled.map((f) => `${f.label}=${String(f.value).slice(0, 40)}`),
    skipped: report2.skipped.slice(0, 15),
  });

  // Anything still required and empty decides submit vs park.
  const missing = await ats.evaluate(() => {
    const seen = new Set();
    const out = [];
    for (const e of document.querySelectorAll("input,select,textarea")) {
      if (e.type === "file" || e.type === "hidden") continue;
      const req = e.required || e.getAttribute("aria-required") === "true";
      if (!req || e.offsetParent === null) continue;
      const filled = e.type === "radio" || e.type === "checkbox"
        ? Array.from(document.getElementsByName(e.name)).some((r) => r.checked)
        : Boolean(e.value);
      if (filled) continue;
      const label = (e.labels?.[0]?.innerText || e.getAttribute("aria-label") || e.placeholder || e.name || e.id || "?")
        .trim().slice(0, 70);
      if (!seen.has(label)) { seen.add(label); out.push(label); }
    }
    return out;
  });
  out.missingRequired = missing;
  out.filledScreenshot = await shot(ats, "filled");

  if (SUBMIT) {
    const submitted = await ats.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'));
      const norm = (s) => (s || "").trim().toLowerCase();
      const el = cands.find((e) => /^(submit application|submit|send application|submit my application)$/.test(norm(e.innerText || e.value)))
        ?? cands.find((e) => /submit|apply/.test(norm(e.innerText || e.value)) && !/save|later|linkedin|indeed|autofill|attach/.test(norm(e.innerText || e.value)));
      if (el) { el.click(); return (el.innerText || el.value || "").trim(); }
      return null;
    });
    step("submit-clicked", { button: submitted });
    await ats.waitForTimeout(6000);
    const text = await ats.evaluate(() => document.body?.innerText ?? "");
    out.confirmation = /thank you|application (received|submitted|sent)|successfully (applied|submitted)|we('|’)ve received/i.test(text);
    out.confirmationSnippet = text.slice(0, 500);
    out.submitScreenshot = await shot(ats, "after-submit");
  }

  out.result = "done";
  out.atsUrl = atsUrl;
} catch (e) {
  out.error = String(e?.message ?? e);
} finally {
  await ctx.storageState({ path: path.join(WORK, "jobright-state.json") }).catch(() => {});
  await browser.close().catch(() => {});
  console.log(JSON.stringify(out, null, 2));
}
