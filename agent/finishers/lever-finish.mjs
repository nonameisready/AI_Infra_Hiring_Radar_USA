// Lever application finisher. No account needed — jobs.lever.co forms are a
// single page: resume, identity fields, urls, and "cards" (custom questions).
// Lever runs a passive hCaptcha on submit; from datacenter IPs it escalates to
// a visible challenge (we then STOP and report captcha_challenge — never solve
// it). From a residential IP it normally passes silently, so this finisher is
// meant for the Mac local batch first.
//
//   node agent/finishers/lever-finish.mjs <applyUrl> <answers.json> [--submit]
// Env: AGENT_WORK_DIR (resume Hui_Mao_Backend_Software_Engineer.pdf +
//      autofill-profile.json live there), HEADED=1 optional.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const WORK = process.env.AGENT_WORK_DIR;
const [url, answersPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SUBMIT = process.argv.includes("--submit");
const answers = JSON.parse(fs.readFileSync(answersPath, "utf8"));
const profile = JSON.parse(fs.readFileSync(path.join(WORK, "autofill-profile.json"), "utf8"));
const emit = (o) => { console.log(JSON.stringify(o, null, 1)); };

const applyUrl = /\/apply(\?|$)/.test(url) ? url : url.replace(/\/?(\?|$)/, "/apply$1");
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

try {
  await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(4000);

  // resume first — Lever parses it and may prefill fields
  const resume = path.join(WORK, "Hui_Mao_Backend_Software_Engineer.pdf");
  await page.locator('input[name="resume"]').setInputFiles(resume).catch(() => {});
  await page.waitForTimeout(5000);

  const fill = async (sel, v) => {
    const el = page.locator(sel).first();
    if (!(await el.count())) return;
    try { await el.fill(v, { timeout: 5000 }); } catch {
      // styled/covered inputs: set through the DOM with React-safe events
      await page.evaluate(({ sel, v }) => {
        const e = document.querySelector(sel);
        if (!e) return;
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        set.call(e, v);
        e.dispatchEvent(new Event("input", { bubbles: true }));
        e.dispatchEvent(new Event("change", { bubbles: true }));
      }, { sel, v });
    }
  };
  await fill('input[name="name"]', `${profile.firstName} ${profile.lastName}`);
  await fill('input[name="email"]', profile.email);
  await fill('input[name="phone"]', profile.phone.replace(/\D/g, ""));
  await fill('input[name="org"]', "Bank of America (via Innova Solutions)");
  await fill('input[name="urls[LinkedIn]"]', profile.linkedin);
  await fill('input[name="urls[GitHub]"]', profile.github);
  // location is optional and often a places-autocomplete; best-effort only
  await fill('input[name="location"]', profile.location);

  // custom cards: textareas + selects + radio/checkbox groups, answered by rules
  const findText = (q) => {
    for (const t of answers.texts ?? []) if (new RegExp(t.label, "i").test(q)) return t.text;
    return null;
  };
  const findCombo = (q) => {
    for (const c of answers.combos ?? []) if (new RegExp(c.label, "i").test(q)) return c;
    return null;
  };
  const missing = [];
  const cards = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("textarea, select, input[type=radio], input[type=checkbox]")) {
      if (!el.name || !el.name.startsWith("cards[")) continue;
      // question = nearest .application-label / preceding text block
      let q = "";
      let n = el.closest("li, .application-question, div");
      for (let i = 0; i < 6 && n; i++) {
        const lbl = n.querySelector?.(".application-label, .text");
        if (lbl && lbl.innerText.trim().length > 3) { q = lbl.innerText.replace(/\s+/g, " ").trim(); break; }
        n = n.parentElement;
      }
      const req = /✱|\*/.test(q) || el.required === true;
      out.push({ name: el.name, tag: el.tagName, type: el.type ?? "", q, req,
        value: el.tagName === "SELECT" ? "" : el.value ?? "" });
    }
    return out;
  });
  const seen = new Set();
  for (const c of cards) {
    const key = c.name + "|" + c.q;
    if (c.tag === "TEXTAREA") {
      const a = findText(c.q) ?? (findCombo(c.q) && /(\^| )yes/.test(findCombo(c.q).prefer) ? "Yes." : null);
      if (a) {
        await page.evaluate(({ name, a }) => {
          const e = document.querySelector(`textarea[name="${name}"]`);
          const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
          set.call(e, a);
          e.dispatchEvent(new Event("input", { bubbles: true }));
          e.dispatchEvent(new Event("change", { bubbles: true }));
        }, { name: c.name, a });
      } else if (c.req) missing.push(c.q.slice(0, 90));
    } else if (c.tag === "SELECT") {
      const rule = findCombo(c.q);
      const done = await page.evaluate(({ name, prefer }) => {
        const e = document.querySelector(`select[name="${name}"]`);
        if (!e) return false;
        const rx = prefer ? new RegExp(prefer, "i") : null;
        const opt = Array.from(e.options).find((o) => rx && rx.test(o.text)) ??
          Array.from(e.options).find((o) => /^yes$/i.test(o.text.trim()));
        if (!opt) return false;
        e.value = opt.value;
        e.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }, { name: c.name, prefer: rule?.prefer ?? null });
      if (!done && c.req) missing.push(c.q.slice(0, 90));
    } else if ((c.type === "radio" || c.type === "checkbox") && !seen.has(key)) {
      seen.add(key);
      const rule = findCombo(c.q);
      const prefer = rule?.prefer ?? "^yes";
      const done = await page.evaluate(({ name, prefer }) => {
        const rx = new RegExp(prefer, "i");
        const els = Array.from(document.querySelectorAll(`input[name="${name}"]`));
        const hit = els.find((r) => rx.test(r.value) || (r.labels?.[0] && rx.test(r.labels[0].innerText)));
        if (!hit) return false;
        (hit.labels?.[0] ?? hit).click();
        return true;
      }, { name: c.name, prefer });
      if (!done && c.req) missing.push(c.q.slice(0, 90));
    }
  }

  const shot = path.join(WORK, `lever-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

  const isSuccess = async () => {
    const s = await page.evaluate(() => ({
      url: location.href, text: document.body.innerText.replace(/\s+/g, " ").slice(0, 500),
    })).catch(() => ({ url: "", text: "" }));
    return /thanks|thank you|application.{0,20}(submitted|received)/i.test(s.text) || /\/thanks/.test(s.url) ? s : null;
  };
  // headed human-in-the-loop: keep the window open and let the person finish
  // (solve the captcha themselves, fill a missing field, hit submit); we only
  // watch for the thank-you state — we never touch the captcha ourselves.
  const waitForHuman = async (why) => {
    if (!HEADED) return null;
    const mins = Number(process.env.LEVER_MANUAL_MIN || 6);
    console.error(`\n⚠️  ${why}`);
    console.error(`👉 窗口保持打开 ${mins} 分钟 — 请手动完成(勾验证码/补答案/点 Submit application),提交成功后我会自动记账。`);
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
    if (s) { emit({ confirmation: true, finalUrl: s.url, manual: true, confirmationSnippet: s.text.slice(0, 200) }); process.exit(0); }
    emit({ confirmation: false, missingRequired: missing, filledScreenshot: shot });
    process.exit(0);
  }

  const submitBtn = page.locator("button.template-btn-submit, #btn-submit").first();
  await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await submitBtn.click({ timeout: 15_000 });
  } catch {
    // covered by the hCaptcha widget or custom styling — dispatch the click in-page
    await page.evaluate(() => {
      const b = document.querySelector("button.template-btn-submit, #btn-submit");
      if (b) b.click();
    });
  }
  await page.waitForTimeout(9000);

  const state = await page.evaluate(() => ({
    url: location.href,
    text: document.body.innerText.replace(/\s+/g, " ").slice(0, 600),
    challenge: Array.from(document.querySelectorAll('iframe[src*="hcaptcha"]'))
      .some((f) => { const r = f.getBoundingClientRect(); return r.width > 50 && r.height > 50; }),
  }));
  if (state.challenge) {
    const s = await waitForHuman("hCaptcha 弹出了人工验证 — 我不会去解它");
    if (s) { emit({ confirmation: true, finalUrl: s.url, manual: true, confirmationSnippet: s.text.slice(0, 200) }); process.exit(0); }
    emit({ confirmation: false, error: "captcha_challenge", note: "hCaptcha escalated to a visible challenge — never solved by the agent; solve it by hand in a headed run.", confirmationSnippet: state.text.slice(0, 150) });
  } else if (/thanks|thank you|application.{0,20}(submitted|received)/i.test(state.text) || /\/thanks/.test(state.url)) {
    emit({ confirmation: true, finalUrl: state.url, confirmationSnippet: state.text.slice(0, 200) });
  } else {
    // give slow redirects one more beat
    await page.waitForTimeout(6000);
    const t2 = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 400));
    const u2 = page.url();
    if (/thanks|thank you|application.{0,20}(submitted|received)/i.test(t2) || /\/thanks/.test(u2)) {
      emit({ confirmation: true, finalUrl: u2, confirmationSnippet: t2.slice(0, 200) });
    } else {
      const s = await waitForHuman("提交后没看到确认页 — 可能有验证或校验没过");
      if (s) { emit({ confirmation: true, finalUrl: s.url, manual: true, confirmationSnippet: s.text.slice(0, 200) }); process.exit(0); }
      emit({ confirmation: false, confirmationSnippet: t2.slice(0, 200), finalUrl: u2, missingRequired: [] });
    }
  }
} catch (e) {
  emit({ confirmation: false, error: String(e.message).slice(0, 200) });
} finally {
  await browser.close().catch(() => {});
}
