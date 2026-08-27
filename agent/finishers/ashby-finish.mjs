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
  headless: !process.env.HEADED, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
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

  // Yes/No button groups and radio questions, answered from the shared rules file.
  let COMBOS = [];
  try {
    const ansFile = process.env.ANSWERS_FILE ||
      path.join(process.env.REPO_DIR ?? path.join(path.dirname(new URL(import.meta.url).pathname), "../.."), "agent/finishers/generic-answers.json");
    COMBOS = JSON.parse(fs.readFileSync(ansFile, "utf8")).combos ?? [];
  } catch {}
  for (const rule of COMBOS) {
    const prefer = rule.prefer ?? rule.pick;
    if (!prefer) continue;
    let labelRe, preferRe;
    try { labelRe = new RegExp(rule.label, "i"); preferRe = new RegExp(prefer, "i"); } catch { continue; }
    const grp = page.locator("div,fieldset").filter({ hasText: labelRe }).last();
    if (!(await grp.count().catch(() => 0))) continue;
    if (await grp.locator('[aria-pressed="true"], [aria-checked="true"], input:checked').count().catch(() => 0)) continue;
    const btn = grp.getByRole("button", { name: preferRe }).first();
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); out.actions.push(`group: ${rule.label.slice(0, 45)}`); continue; }
    const radio = grp.getByRole("radio", { name: preferRe }).first();
    if (await radio.isVisible().catch(() => false)) { await radio.click().catch(() => {}); out.actions.push(`radio: ${rule.label.slice(0, 45)}`); }
  }

  // Type-to-search dropdowns we know the honest answer to.
  const DROPS = [{ label: /current immigration status/i, type: "F-1", option: /f-?1/i, note: "immigration status: F-1" }];
  for (const d of DROPS) {
    const grp = page.locator("div,fieldset").filter({ hasText: d.label }).last();
    if (!(await grp.count().catch(() => 0))) continue;
    const input = grp.locator("input").first();
    if (!(await input.isVisible().catch(() => false))) continue;
    if (await input.inputValue().catch(() => "")) continue;
    await input.click().catch(() => {});
    await input.pressSequentially(d.type, { delay: 80 }).catch(() => {});
    await page.waitForTimeout(1200);
    const optEl = page.getByRole("option", { name: d.option }).first();
    if (await optEl.isVisible().catch(() => false)) { await optEl.click().catch(() => {}); out.actions.push(d.note); }
    else await page.keyboard.press("Escape").catch(() => {});
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
    let text = await page.evaluate(() => document.body?.innerText ?? "");
    // Ashby's spam-flag page itself says "please submit your application again" — one retry.
    if (/flagged as possible spam/i.test(text)) {
      await page.waitForTimeout(20000);
      const again = page.getByRole("button", { name: /submit application/i }).first();
      if (await again.isVisible().catch(() => false)) {
        await again.click().catch(() => {});
        await page.waitForTimeout(8000);
        text = await page.evaluate(() => document.body?.innerText ?? "");
        out.retriedAfterSpamFlag = true;
      }
    }
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
