// Gem ATS finisher (Motion). Inputs carry no ids/labels — match each visible
// input to the question text of its enclosing block, then fill positionally.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const WORK = process.env.AGENT_WORK_DIR;
const url = process.argv[2];
const ANSWERS = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
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
  await page.waitForTimeout(5000);

  // Attach resume first (hidden input under the drop zone).
  await page.locator('input[type="file"]').first().setInputFiles(RESUME).catch(() => {});
  out.actions.push("resume attached");
  await page.waitForTimeout(2000);

  // Question text for each control = innerText of the nearest ancestor that
  // contains exactly one control, minus the control's own value.
  const describe = (locator) => locator.evaluate((e) => {
    let n = e.parentElement;
    for (let d = 0; d < 5 && n; d++) {
      const controls = n.querySelectorAll("input,textarea");
      if (controls.length === 1) { const t = n.innerText ?? ""; if (t.trim()) return t.split("\n")[0].slice(0, 80); }
      n = n.parentElement;
    }
    return "";
  });

  const fillByQuestion = async (kind, entries) => {
    const els = page.locator(kind === "input" ? 'input[type="text"]' : "textarea");
    const n = await els.count();
    for (let i = 0; i < n; i++) {
      const el = els.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const q = await describe(el);
      const match = entries.find((t) => new RegExp(t.label, "i").test(q));
      if (match) {
        await el.click();
        await el.fill(match.text);
        out.actions.push(`${q.slice(0, 45)} = ${match.text.slice(0, 40)}`);
        match._done = true;
      } else {
        out.actions.push(`no answer for ${kind} "${q.slice(0, 60)}"`);
      }
    }
    for (const t of entries) if (!t._done) out.actions.push(`UNMATCHED answer: ${t.label}`);
  };
  const texts = ANSWERS.texts ?? [];
  await fillByQuestion("input", texts.filter((t) => t.text.length < 120));
  await fillByQuestion("textarea", texts.filter((t) => t.text.length >= 120));

  // Custom dropdowns render exactly as the literal text "Select an option";
  // click each trigger in document order and read ONLY the options that
  // appear after the click (diff against the pre-click snapshot).
  const triggers = page.getByText(/^select an option$/i);
  const nTrig = await triggers.count();
  for (let i = 0; i < nTrig && i < (ANSWERS.combos ?? []).length; i++) {
    const c = ANSWERS.combos[i];
    const snap = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*")).filter((o) => o.offsetParent !== null && o.children.length === 0).map((o) => o.innerText?.trim()).filter(Boolean));
    const trig = page.getByText(/^select an option$/i).first(); // re-query: earlier picks consume triggers
    await trig.click();
    await page.waitForTimeout(1200);
    // Long lists are scrollable — page through with keyboard to render all.
    for (let k = 0; k < 6; k++) await page.keyboard.press("PageDown").catch(() => {});
    await page.waitForTimeout(600);
    const now = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*")).filter((o) => o.offsetParent !== null && o.children.length === 0).map((o) => o.innerText?.trim()).filter(Boolean));
    const fresh = [...new Set(now.filter((t) => !snap.includes(t) && t.length < 60))];
    const pick = fresh.find((o) => new RegExp(c.prefer, "i").test(o)) ?? (fresh.length === 1 ? fresh[0] : null);
    if (pick) {
      await page.getByText(pick, { exact: true }).last().click();
      out.actions.push(`${c.label} = ${pick} (options: ${JSON.stringify(fresh.slice(0, 8))})`);
    } else {
      out.actions.push(`combo ${c.label}: no match among ${JSON.stringify(fresh.slice(0, 10))}`);
      await page.keyboard.press("Escape").catch(() => {});
    }
    await page.waitForTimeout(600);
  }

  await page.waitForTimeout(1000);
  out.validationErrors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("*")).filter((e) => e.offsetParent !== null && /^please (enter|select)/i.test(e.innerText?.trim() ?? "") && e.children.length === 0).map((e) => e.innerText.trim()).slice(0, 12));
  out.filledScreenshot = path.join(WORK, `gem-${tag}.png`);
  await page.screenshot({ path: out.filledScreenshot, fullPage: true });

  if (SUBMIT) {
    await page.getByRole("button", { name: /apply without saving|^apply$/i }).first().click();
    await page.waitForTimeout(8000);
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    out.confirmation = /thank you|application (was )?(received|submitted|sent)|successfully|we('|’)ve received/i.test(text);
    out.confirmationSnippet = text.slice(0, 300);
    out.submitScreenshot = path.join(WORK, `gem-submit-${tag}.png`);
    await page.screenshot({ path: out.submitScreenshot, fullPage: true });
  }
} catch (e) {
  out.error = String(e?.message ?? e);
} finally {
  await browser.close().catch(() => {});
  console.log(JSON.stringify(out, null, 2));
}
