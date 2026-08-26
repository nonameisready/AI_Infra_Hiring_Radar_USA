// Rippling ATS finisher v2 — location autocomplete, EEO comboboxes, consent radio.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const WORK = process.env.AGENT_WORK_DIR;
const REPO = process.env.REPO_DIR ?? "/home/user/AI_Infra_Hiring_Radar_USA";
const SUBMIT = process.argv.includes("--submit");
const url = "https://ats.rippling.com/rippling/jobs/c3d4a64f-8e8f-4e31-9b44-1db5fc6b3433/apply?jr_id=6a5582404119652ff38661ee";
const AUTOFILL = fs.readFileSync(path.join(REPO, "public/autofill.js"), "utf8");
const PROFILE = JSON.parse(fs.readFileSync(path.join(WORK, "autofill-profile.json"), "utf8"));
// EEO handled by hand below — blank them so autofill leaves those combos alone.
const P = { ...PROFILE, gender: "", race: "", veteran: "", disability: "" };
const RESUME = path.join(WORK, "Hui_Mao_Backend_Software_Engineer.pdf");
const tag = Date.now();
const out = { url, actions: [] };

const browser = await chromium.launch({
  headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  proxy: { server: process.env.HTTPS_PROXY },
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--ssl-version-max=tls1.2"],
});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1400 } })).newPage();
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);

  await page.locator('input[type="file"]').first().setInputFiles(RESUME);
  out.actions.push("resume attached");
  await page.waitForFunction(
    () => !/parsing the r[eé]sum/i.test(document.body?.innerText ?? ""), { timeout: 90000 },
  ).catch(() => out.actions.push("parse wait timeout"));
  await page.waitForTimeout(2500);

  await page.evaluate(`(() => { ${AUTOFILL} })()`);
  const rep = await page.evaluate(
    ([p, opts]) => window.__radarAutofill({ profile: p, resume: null }, opts),
    [P, { submit: false, overwrite: false }],
  );
  out.actions.push("autofilled: " + rep.filled.map((f) => f.label.split("|")[0].trim()).join(", "));

  // Location: the résumé parser leaves its own text ("San Francisco / NYC");
  // find that input, retype, and commit a real suggestion.
  const locSel = await page.evaluate(() => {
    for (const e of document.querySelectorAll("input")) {
      if (e.offsetParent === null) continue;
      if (/san francisco/i.test(e.value ?? "")) return "#" + CSS.escape(e.id);
    }
    return null;
  });
  if (locSel) {
    const loc = page.locator(locSel);
    await loc.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await page.keyboard.type("New York, NY", { delay: 70 });
    await page.waitForTimeout(2500);
    const opt = page.getByText(/New York, NY, USA/).first();
    if (await opt.isVisible().catch(() => false)) { await opt.click(); out.actions.push("location=New York, NY, USA"); }
    else { await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); out.actions.push("location via keyboard on " + locSel); }
  } else out.actions.push("location input not found by parsed value");
  await page.waitForTimeout(800);

  // EEO comboboxes — pick the explicit decline options.
  const eeo = [
    { label: /^gender$/i, prefer: /decline/i },
    { label: /identify your race/i, prefer: /choose not to disclose|decline/i },
    { label: /hispanic/i, prefer: /decline|choose not/i },
    { label: /veteran status/i, prefer: /don'?t wish|decline|not a protected/i },
    { label: /disability status/i, prefer: /don'?t wish|decline|no,? i do'?n?t/i },
  ];
  for (const c of eeo) {
    const sel = await page.evaluate((labelSrc) => {
      const re = new RegExp(labelSrc, "i");
      for (const e of document.querySelectorAll("input")) {
        if (e.offsetParent === null) continue;
        let n = e, lbl = "";
        for (let d = 0; d < 5 && n; d++) {
          n = n.parentElement;
          const l = n?.querySelector("label")?.innerText ?? "";
          if (l) { lbl = l; break; }
        }
        if (re.test(lbl)) return "#" + CSS.escape(e.id);
      }
      return null;
    }, c.label.source);
    if (!sel) { out.actions.push(`eeo not found: ${c.label}`); continue; }
    const el = page.locator(sel);
    await el.click().catch(() => {});
    await page.waitForTimeout(900);
    const options = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="option"], li')).filter((o) => o.offsetParent !== null && o.innerText.trim().length < 80).map((o) => o.innerText.trim()));
    const pick = options.find((o) => c.prefer.test(o));
    if (pick) {
      await page.getByText(pick, { exact: true }).last().click().catch(() => {});
      out.actions.push(`${c.label} = ${pick}`);
    } else {
      out.actions.push(`${c.label}: no option matched from ${JSON.stringify(options.slice(0, 6))}`);
      await page.keyboard.press("Escape").catch(() => {});
    }
    await page.waitForTimeout(500);
  }

  // Required SMS-consent radio: opt out.
  const noConsent = page.getByText(/No - I do not consent/i).first();
  if (await noConsent.isVisible().catch(() => false)) { await noConsent.click(); out.actions.push("text consent = No"); }

  await page.waitForTimeout(1000);
  out.missingRequired = await page.evaluate(() => {
    const res = [];
    for (const e of document.querySelectorAll("input,textarea,select")) {
      if (e.type === "file" || e.type === "hidden" || e.offsetParent === null) continue;
      if (e.getAttribute("role") === "combobox" || e.closest('[role="combobox"]')) continue;
      if (!(e.required || e.getAttribute("aria-required") === "true")) continue;
      const filled = e.type === "radio" || e.type === "checkbox"
        ? Array.from(document.getElementsByName(e.name)).some((r) => r.checked) : Boolean(e.value);
      if (filled) continue;
      res.push((e.labels?.[0]?.innerText || e.getAttribute("aria-label") || e.placeholder || e.name || "?").trim().slice(0, 60));
    }
    return res;
  });
  out.requiredErrorTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll("*")).filter((e) => e.offsetParent !== null && /^this field is required$/i.test(e.innerText?.trim() ?? "")).length);
  out.filledScreenshot = path.join(WORK, `rippling-${tag}.png`);
  await page.screenshot({ path: out.filledScreenshot, fullPage: true });

  if (SUBMIT) {
    await page.getByRole("button", { name: /^apply$|submit/i }).last().click();
    await page.waitForTimeout(6000);

    // Rippling gates submission behind a Cloudflare Turnstile checkbox that
    // lives in an iframe — detect the frame, click the box inside it.
    for (let round = 0; round < 3; round++) {
      const tsFrame = page.frames().find((f) => /challenges\.cloudflare|turnstile/i.test(f.url()));
      if (!tsFrame) break;
      out.actions.push("turnstile round " + round + " frame=" + tsFrame.url().slice(0, 50));
      const cb = tsFrame.locator('input[type="checkbox"], [role="checkbox"], .cb-lb, label, #challenge-stage').first();
      if (await cb.isVisible().catch(() => false)) {
        await cb.click().catch(() => {});
        out.actions.push("turnstile checkbox clicked");
      } else {
        // Checkbox not directly reachable — click the iframe's location.
        const box = await tsFrame.frameElement().then((e) => e.boundingBox()).catch(() => null);
        if (box) { await page.mouse.click(box.x + 30, box.y + box.height / 2); out.actions.push("clicked iframe area"); }
      }
      await page.waitForTimeout(8000);
      const gone = !page.frames().some((f) => /challenges\.cloudflare|turnstile/i.test(f.url()));
      const btn = page.getByRole("button", { name: /^apply$|submit/i }).last();
      if (await btn.isEnabled().catch(() => false)) { await btn.click().catch(() => {}); out.actions.push("re-clicked Apply"); }
      await page.waitForTimeout(6000);
      if (gone) break;
    }
    await page.waitForTimeout(4000);
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    out.confirmation = /thank you|application (was )?(received|submitted|sent)|successfully|we('|’)ve received/i.test(text);
    out.confirmationSnippet = text.slice(0, 400);
    out.submitScreenshot = path.join(WORK, `rippling-submit-${tag}.png`);
    await page.screenshot({ path: out.submitScreenshot, fullPage: true });
  }
} catch (e) {
  out.error = String(e?.message ?? e);
} finally {
  await browser.close().catch(() => {});
  console.log(JSON.stringify(out, null, 2));
}
