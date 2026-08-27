// Ashby finisher. Usage: node ashby-finish.mjs <url> [--submit]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const WORK = process.env.AGENT_WORK_DIR;
const url = process.argv[2];
const SUBMIT = process.argv.includes("--submit");
const RESUME = path.join(WORK, "Hui_Mao_Backend_Software_Engineer.pdf");
const tag = Date.now();
const out = { url, actions: [] };

const browser = await chromium.launch({
  headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled",
         ...(process.env.HTTPS_PROXY ? ["--ssl-version-max=tls1.2"] : [])],
});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1400 } })).newPage();
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);

  // Resume first so Ashby's own parser fills what it can.
  const file = page.locator('input[type="file"]').first();
  await file.setInputFiles(RESUME).catch(() => {});
  await page.waitForTimeout(6000);
  out.actions.push("resume attached");

  const fill = async (labelRe, value) => {
    const inputs = page.locator('input[type="text"], input[type="email"], input[type="tel"], input:not([type])');
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      const el = inputs.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const label = await el.evaluate((e) =>
        (e.labels?.[0]?.innerText || e.getAttribute("aria-label") || e.closest("div,fieldset")?.querySelector("label")?.innerText || "").trim());
      if (new RegExp(labelRe, "i").test(label)) {
        const cur = await el.inputValue().catch(() => "");
        if (!cur) { await el.fill(value); out.actions.push(`${label}=${value}`); }
        return;
      }
    }
    out.actions.push(`NOT FOUND: ${labelRe}`);
  };
  await fill("^name", "Hui Mao");
  await fill("^email", "huiluckylucky@gmail.com");
  await fill("^phone", "281-250-7589");

  // Any other empty text field whose label matches a memory rule (autofill-profile customAnswers).
  let RULES = [];
  try {
    const prof = JSON.parse(fs.readFileSync(path.join(WORK, "autofill-profile.json"), "utf8"));
    RULES = typeof prof.customAnswers === "string" ? JSON.parse(prof.customAnswers) : (prof.customAnswers ?? []);
  } catch {}
  const blanks = page.locator('input[type="text"], input[type="email"], input[type="tel"], input:not([type]), textarea');
  const bn = await blanks.count();
  for (let i = 0; i < bn; i++) {
    const el = blanks.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if (await el.inputValue().catch(() => "")) continue;
    const label = await el.evaluate((e) =>
      (e.labels?.[0]?.innerText || e.getAttribute("aria-label") || e.closest("div,fieldset")?.querySelector("label")?.innerText || "").trim());
    if (!label) continue;
    const rule = RULES.find((r) => { try { return new RegExp(r.match, "i").test(label); } catch { return false; } });
    if (rule) {
      await el.fill(String(rule.value ?? rule.answer ?? "")).catch(() => {});
      out.actions.push(`memory: ${label.slice(0, 50)}`);
    }
  }

  // Sponsorship yes/no button group.
  const spons = page.locator("div,fieldset").filter({ hasText: /require sponsorship to work in the United States/i }).last();
  const yes = spons.getByRole("button", { name: /^yes$/i }).first();
  if (await yes.isVisible().catch(() => false)) { await yes.click(); out.actions.push("sponsorship=Yes"); }
  else {
    const yesRadio = spons.getByText(/^yes$/i).first();
    if (await yesRadio.isVisible().catch(() => false)) { await yesRadio.click(); out.actions.push("sponsorship=Yes (radio)"); }
    else out.actions.push("sponsorship control not found");
  }

  // Voluntary EEO — decline options, honestly.
  for (const txt of ["Decline to self-identify", "I decline to self-identify for protected veteran status"]) {
    const els = page.getByText(txt, { exact: false });
    const n = await els.count();
    for (let i = 0; i < n; i++) {
      const el = els.nth(i);
      if (await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); out.actions.push(`clicked: ${txt} #${i}`); }
    }
  }
  await page.waitForTimeout(1000);

  out.missingRequired = await page.evaluate(() => {
    const res = [];
    for (const e of document.querySelectorAll("input,textarea,select")) {
      if (e.type === "file" || e.type === "hidden" || e.offsetParent === null) continue;
      if (!(e.required || e.getAttribute("aria-required") === "true")) continue;
      if (e.value) continue;
      res.push((e.labels?.[0]?.innerText || e.getAttribute("aria-label") || e.placeholder || e.name || "?").trim().slice(0, 60));
    }
    return res;
  });
  out.filledScreenshot = path.join(WORK, `ashby-${tag}.png`);
  await page.screenshot({ path: out.filledScreenshot, fullPage: true });

  if (SUBMIT) {
    await page.getByRole("button", { name: /submit application/i }).first().click();
    await page.waitForTimeout(8000);
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    out.confirmation = /thank you|application (was )?(received|submitted|sent)|successfully|we('|’)ve received/i.test(text);
    out.confirmationSnippet = text.slice(0, 400);
    if (!out.confirmation) {
      out.finalUrl = page.url();
      out.errors = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="alert"], [class*="error" i], [class*="Error"]'))
          .map((e) => e.innerText?.trim())
          .filter((t) => t && t.length > 2 && t.length < 200)
          .slice(0, 10));
    }
    out.submitScreenshot = path.join(WORK, `ashby-submit-${tag}.png`);
    await page.screenshot({ path: out.submitScreenshot, fullPage: true });
  }
} catch (e) {
  out.error = String(e?.message ?? e);
} finally {
  await browser.close().catch(() => {});
  console.log(JSON.stringify(out, null, 2));
}
