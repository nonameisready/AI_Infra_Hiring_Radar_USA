// Rippling ATS finisher (ats.rippling.com). Single-page public form: resume
// (parsed for prefill), contact fields, custom questions as radiogroups and
// listbox comboboxes, EEO section. Rippling gates the final Apply click behind
// a Cloudflare challenge; from datacenter IPs the submit stalls forever, so
// this finisher is for the Mac local batch (residential IP). We never solve a
// visible challenge — headed runs hand it to the human and watch for success.
//
//   node agent/finishers/rippling-finish.mjs <jobUrl> <answers.json> [--submit]
// Env: AGENT_WORK_DIR (resume + autofill-profile.json), HEADED=1,
//      RIPPLING_MANUAL_MIN (default 6).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const WORK = process.env.AGENT_WORK_DIR;
const [url, answersPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SUBMIT = process.argv.includes("--submit");
const answers = JSON.parse(fs.readFileSync(answersPath, "utf8"));
const profile = JSON.parse(fs.readFileSync(path.join(WORK, "autofill-profile.json"), "utf8"));
const emit = (o) => { console.log(JSON.stringify(o, null, 1)); };

const HEADED = process.env.HEADED === "1";
const browser = await chromium.launch({
  headless: !HEADED,
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  args: ["--disable-blink-features=AutomationControlled", "--no-sandbox",
    ...(process.env.CCR_AGENT_PROXY_ENABLED ? ["--ssl-version-max=tls1.2"] : [])],
});
const ctx = await browser.newContext({
  ...(HEADED ? { viewport: null } : { viewport: { width: 1440, height: 1600 } }),
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
});
const page = await ctx.newPage();
const missing = [];

// question text for a control = first meaningful ancestor innerText line
const questionOf = (el) => el.evaluate((c) => {
  let n = c.parentElement;
  for (let i = 0; i < 8 && n; i++) {
    const t = (n.innerText || "").trim();
    if (t.length > 10 && t.length < 500) return t.split("\n")[0];
    n = n.parentElement;
  }
  return "";
});
const ruleFor = (q) => {
  for (const c of answers.combos ?? []) if (new RegExp(c.label, "i").test(q)) return c.prefer;
  return null;
};
const textFor = (q) => {
  for (const t of answers.texts ?? []) if (new RegExp(t.label, "i").test(q)) return t.text;
  return null;
};

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(5000);
  const applyNow = page.getByRole("button", { name: /^Apply now/i }).first();
  if (await applyNow.count()) { await applyNow.click(); await page.waitForTimeout(6000); }

  // resume first — Rippling parses it and prefills name/email/company/phone
  const resume = path.join(WORK, "Hui_Mao_Backend_Software_Engineer.pdf");
  await page.locator('input[type="file"]').first().setInputFiles(resume);
  await page.waitForTimeout(10_000);

  // location: the parser routinely mangles it ("San Francisco, NY") — retype
  // with trusted keys and take the first suggestion
  for (const inp of await page.locator("input[type=text]:visible").all()) {
    const q = await questionOf(inp);
    if (!/^location/i.test(q)) continue;
    await inp.fill("");
    await inp.pressSequentially(profile.location, { delay: 60 });
    await page.waitForTimeout(2500);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    break;
  }
  // linkedin + any empty required text (salary etc.) via rules
  for (const inp of await page.locator("input[type=text]:visible").all()) {
    if (await inp.inputValue()) continue;
    const label = await inp.evaluate((e) => e.labels?.[0]?.innerText ?? e.getAttribute("aria-label") ?? "");
    if (/linkedin/i.test(label)) { await inp.fill(profile.linkedin); continue; }
    const req = await inp.evaluate((e) => e.required);
    if (!req) continue;
    const q = await questionOf(inp);
    const a = textFor(q);
    if (a) await inp.fill(a);
    else missing.push(q.slice(0, 90));
  }

  // radiogroups: match question against combo rules, click by option text
  await page.evaluate(async ({ combos }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const g of document.querySelectorAll("[role=radiogroup]")) {
      if (!g.offsetParent) continue;
      const radios = Array.from(g.querySelectorAll("[role=radio]"));
      if (radios.some((r) => r.getAttribute("aria-checked") === "true")) continue;
      let n = g.parentElement, q = "";
      for (let i = 0; i < 8 && n; i++) {
        const t = (n.innerText || "").trim();
        if (t.length > 10 && t.length < 600) { q = t; break; }
        n = n.parentElement;
      }
      const rule = combos.find((c) => new RegExp(c.label, "i").test(q));
      if (!rule) continue;
      const rx = new RegExp(rule.prefer, "i");
      const texts = radios.map((r) => r.getAttribute("aria-label") || r.innerText.replace(/\s+/g, " ").trim());
      const i = texts.findIndex((t) => rx.test(t));
      if (i >= 0) { radios[i].click(); await sleep(400); }
    }
  }, { combos: answers.combos ?? [] });

  // comboboxes: open, pick from the freshest listbox (old ones linger in DOM)
  const comboMissing = await page.evaluate(async ({ combos }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const miss = [];
    for (const c of document.querySelectorAll("[role=combobox]")) {
      if (!c.offsetParent) continue;
      const v = ((c.tagName === "INPUT" ? c.value : c.innerText) || "").trim();
      if (v && !/^select/i.test(v) && !/^search$/i.test(v)) continue;
      let n = c.parentElement, q = "";
      for (let i = 0; i < 8 && n; i++) {
        const t = (n.innerText || "").trim();
        if (t.length > 10 && t.length < 600) { q = t.split("\n")[0]; break; }
        n = n.parentElement;
      }
      if (/pronoun/i.test(q)) continue; // optional
      const rule = combos.find((r) => new RegExp(r.label, "i").test(q));
      if (!rule) { if (/\*/.test(q)) miss.push(q.slice(0, 90)); continue; }
      c.click(); await sleep(1000);
      const boxes = Array.from(document.querySelectorAll("[role=listbox]")).filter((b) => b.offsetParent);
      const box = boxes[boxes.length - 1];
      const rx = new RegExp(rule.prefer, "i");
      const hit = box && Array.from(box.querySelectorAll("[role=option]")).find((o) => rx.test(o.innerText.trim()));
      if (hit) { hit.click(); await sleep(500); }
      else { document.body.click(); await sleep(300); miss.push(q.slice(0, 90)); }
    }
    return miss;
  }, { combos: answers.combos ?? [] });
  missing.push(...comboMissing);

  const shot = path.join(WORK, `rippling-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

  const isSuccess = async () => {
    const s = await page.evaluate(() => ({
      url: location.href,
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 500),
      formGone: !Array.from(document.querySelectorAll("input[type=text]")).some((i) => i.offsetParent),
    })).catch(() => ({ url: "", text: "", formGone: false }));
    return /thank|application.{0,30}(submitted|received)|successfully applied/i.test(s.text) || s.formGone ? s : null;
  };
  const waitForHuman = async (why) => {
    if (!HEADED) return null;
    const mins = Number(process.env.RIPPLING_MANUAL_MIN || 6);
    console.error(`\n⚠️  ${why}`);
    console.error(`👉 窗口保持打开 ${mins} 分钟 — 请手动完成(过验证/补答案/点 Apply),提交成功后我会自动记账。`);
    const until = Date.now() + mins * 60_000;
    while (Date.now() < until) {
      const s = await isSuccess();
      if (s) return s;
      await page.waitForTimeout(5000);
    }
    return null;
  };

  if (!SUBMIT) { emit({ confirmation: false, dryRun: true, missingRequired: missing, filledScreenshot: shot }); process.exit(0); }
  if (missing.length) {
    const s = await waitForHuman(`还有必填题没答上: ${missing.join(" | ")}`);
    if (s) { emit({ confirmation: true, finalUrl: s.url, manual: true }); process.exit(0); }
    emit({ confirmation: false, missingRequired: missing, filledScreenshot: shot });
    process.exit(0);
  }

  // the real submit button's text is "Apply - <job title>", at the page bottom
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button,[role=button]"))
      .filter((x) => x.offsetParent && /^Apply/i.test(x.innerText.trim())).pop();
    if (b) b.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(600);
  const btn = page.getByRole("button", { name: /^Apply/i }).last();
  await btn.click({ timeout: 15_000 }).catch(async () => {
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button,[role=button]"))
        .filter((x) => x.offsetParent && /^Apply/i.test(x.innerText.trim())).pop();
      if (b) b.click();
    });
  });

  // Rippling greys the form out while submitting; a Cloudflare challenge can
  // appear here. Poll for success up to 2 minutes headless, then hand off.
  const until = Date.now() + 120_000;
  let done = null;
  while (Date.now() < until && !done) {
    done = await isSuccess();
    if (!done) await page.waitForTimeout(5000);
  }
  if (done) { emit({ confirmation: true, finalUrl: done.url, confirmationSnippet: done.text.slice(0, 200) }); process.exit(0); }
  const s = await waitForHuman("提交卡住(可能是 Cloudflare 验证)— 我不会去解它");
  if (s) { emit({ confirmation: true, finalUrl: s.url, manual: true }); process.exit(0); }
  emit({ confirmation: false, error: "submit_stalled", note: "Apply click did not reach a confirmation state — Cloudflare challenge-platform likely blocked it. Retry headed on a residential IP.", filledScreenshot: shot });
} catch (e) {
  emit({ confirmation: false, error: String(e.message).slice(0, 200) });
} finally {
  await browser.close().catch(() => {});
}
