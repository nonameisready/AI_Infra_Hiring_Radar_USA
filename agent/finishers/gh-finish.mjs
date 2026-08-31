// Greenhouse finisher: fill basics + resume + comboboxes + text answers, then
// optionally submit. Usage: node gh-finish.mjs <atsUrl> <answersJsonFile> [--submit]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const WORK = process.env.AGENT_WORK_DIR;
const REPO = process.env.REPO_DIR ?? "/home/user/AI_Infra_Hiring_Radar_USA";
const url = process.argv[2];
const ANSWERS = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const SUBMIT = process.argv.includes("--submit");
const AUTOFILL = fs.readFileSync(path.join(REPO, "public/autofill.js"), "utf8");
const PROFILE = JSON.parse(fs.readFileSync(path.join(WORK, "autofill-profile.json"), "utf8"));
const RESUME = path.join(WORK, "Hui_Mao_Backend_Software_Engineer.pdf");
const tag = Date.now();
const out = { url, combos: [], texts: [], submit: SUBMIT };

const browser = await chromium.launch({
  headless: !process.env.HEADED, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled",
         ...(process.env.HTTPS_PROXY ? ["--ssl-version-max=tls1.2"] : [])],
});
const page = await (await browser.newContext({ viewport: process.env.HEADED ? null : { width: 1440, height: 1400 } })).newPage();

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);

  // Text fields from the shared runtime; file inputs handled below by hand.
  await page.evaluate(`(() => { ${AUTOFILL} })()`);
  const rep = await page.evaluate(
    ([p, opts]) => window.__radarAutofill({ profile: p, resume: null }, opts),
    [PROFILE, { submit: false, overwrite: false }],
  );
  out.autofilled = rep.filled.map((f) => f.label.split("|")[0].trim() + "=" + String(f.value).slice(0, 30));

  // Resume goes only to the input whose context says resume/cv — never the
  // cover-letter upload.
  const fileInputs = page.locator('input[type="file"]');
  const nf = await fileInputs.count();
  let attached = false;
  for (let i = 0; i < nf; i++) {
    const input = fileInputs.nth(i);
    const ctx = await input.evaluate((e) => {
      let n = e, texts = [];
      for (let d = 0; d < 4 && n; d++) { texts.push(n.previousElementSibling?.innerText, n.parentElement?.innerText?.slice(0, 120)); n = n.parentElement; }
      return texts.filter(Boolean).join(" | ").toLowerCase();
    });
    if (/resume|cv/.test(ctx) && !/cover/.test(ctx.split("resume")[0] || "")) {
      if (!attached && !/cover letter/.test(ctx.slice(0, 60))) {
        await input.setInputFiles(RESUME).catch(() => {});
        attached = true;
        out.resumeInput = ctx.slice(0, 100);
      }
    }
  }
  if (!attached && nf > 0) { await fileInputs.first().setInputFiles(RESUME); attached = true; out.resumeInput = "first input (fallback)"; }
  out.resumeAttached = attached;
  await page.waitForTimeout(2000);

  // Comboboxes: click, read the freshly opened listbox, pick by preference.
  for (const c of ANSWERS.combos ?? []) {
    const combo = page.locator('[role="combobox"], select, button[aria-haspopup="listbox"], div[aria-haspopup="listbox"]').filter({ has: page.locator(":scope") });
    // ALL matching controls: the same rule can cover several questions, and
    // Greenhouse renders duplicate desktop/mobile copies of the whole form.
    const targets = await (async () => {
      const found = [];
      const all = page.locator('[role="combobox"], select, button[aria-haspopup="listbox"], div[aria-haspopup="listbox"]');
      const n = await all.count();
      for (let i = 0; i < n; i++) {
        const el = all.nth(i);
        if (!(await el.isVisible().catch(() => false))) continue;
        const label = await el.evaluate((e) => {
          const direct =
            e.labels?.[0]?.innerText || e.getAttribute("aria-label") ||
            e.closest("div,fieldset")?.querySelector("label")?.innerText || "";
          if (direct.trim()) return direct.trim();
          // Greenhouse's remix UI: no label association — the question text is
          // the first meaningful line of an enclosing container.
          let node = e.parentElement;
          for (let d = 0; d < 6 && node; d++) {
            const line = (node.innerText ?? "").split("\n").map((t) => t.trim())
              .find((t) => t && !/^select\.{0,3}$/i.test(t));
            if (line) return line;
            node = node.parentElement;
          }
          return "";
        });
        if (new RegExp(c.label, "i").test(label)) found.push({ el, label });
      }
      return found;
    })();
    if (!targets.length) { out.combos.push({ label: c.label, result: "not_found" }); continue; }
    for (const target of targets) {

    const tagName = await target.el.evaluate((e) => e.tagName);
    if (tagName === "SELECT") {
      const picked = await target.el.evaluate((e, prefer) => {
        const opt = Array.from(e.options).find((o) => new RegExp(prefer, "i").test(o.text));
        if (!opt) return null;
        e.value = opt.value; e.dispatchEvent(new Event("change", { bubbles: true }));
        return opt.text;
      }, c.prefer);
      out.combos.push({ label: target.label, picked });
      continue;
    }
    await target.el.click();
    await page.waitForTimeout(1000);
    let options = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="option"]')).filter((o) => o.offsetParent !== null).map((o) => o.innerText.trim()));
    // Type-to-search when the list is empty OR when the preloaded options
    // don't contain the preferred value (huge lists like School paginate).
    const preferRe = new RegExp(c.prefer, "i");
    if (c.type && (!options.length || !options.some((o) => preferRe.test(o)))) {
      await target.el.type(c.type, { delay: 60 });
      await page.waitForTimeout(3500);
      options = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="option"]')).filter((o) => o.offsetParent !== null).map((o) => o.innerText.trim()));
    }
    if (!options.length) {
      // custom widgets render plain <li> inside a listbox instead of role=option
      options = await page.evaluate(() =>
        Array.from(document.querySelectorAll('ul[role="listbox"] li, [class*="select__option"], [class*="menu"] li'))
          .filter((o) => o.offsetParent !== null && o.innerText.trim())
          .map((o) => o.innerText.trim()));
    }
    let pick = options.find((o) => new RegExp(c.prefer, "i").test(o));
    if (!pick && options.length === 1) pick = options[0];
    if (pick) {
      // Hidden phone-country <li role=option> entries also match by text —
      // getByRole only sees elements exposed to the accessibility tree.
      await page.getByRole("option", { name: pick, exact: true }).first()
        .click({ timeout: 10000 })
        .catch(async () => {
          await page.getByRole("option", { name: pick }).first().click({ timeout: 10000 });
        });
      out.combos.push({ label: target.label, picked: pick, options: options.slice(0, 8) });
    } else if (!options.length && c.type) {
      // async typeahead (places-style): the value only commits when a
      // suggestion is chosen — wait for the list and click the first entry
      await page.waitForTimeout(2500);
      const sug = page.locator('[role="option"], ul[role="listbox"] li, .pac-item, [class*="suggestion"] li, li[class*="option"]').first();
      if (await sug.isVisible().catch(() => false)) {
        await sug.click().catch(() => {});
        out.combos.push({ label: target.label, picked: `typed+picked: ${c.type}` });
      } else {
        await target.el.press("ArrowDown").catch(() => {});
        await page.waitForTimeout(400);
        await target.el.press("Enter").catch(() => {});
        out.combos.push({ label: target.label, picked: `typed: ${c.type}` });
      }
    } else if (pick) {
      // plain-li menus aren't in the a11y tree — click by text within the open list
      await page.locator('ul[role="listbox"] li, [class*="select__option"]').filter({ hasText: pick }).first()
        .click({ timeout: 8000 }).catch(() => {});
      out.combos.push({ label: target.label, picked: pick, via: "li" });
    } else {
      out.combos.push({ label: target.label, result: "no_option_matched", options: options.slice(0, 10) });
      await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    }
    await page.waitForTimeout(600);
    }
  }

  // Free-text answers by label.
  for (const t of ANSWERS.texts ?? []) {
    const ta = page.locator("textarea, input[type=text]").filter({ has: page.locator(":scope") });
    const all = page.locator("textarea, input[type='text'], input[type='number']");
    const n = await all.count();
    let done = false;
    for (let i = 0; i < n; i++) {
      const el = all.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const label = await el.evaluate((e) => {
        const direct = (e.labels?.[0]?.innerText || e.getAttribute("aria-label") || e.closest("div,fieldset")?.querySelector("label")?.innerText || "").trim();
        if (direct) return direct;
        let node = e.parentElement;
        for (let d = 0; d < 6 && node; d++) {
          const line = (node.innerText ?? "").split("\n").map((t2) => t2.trim()).find((t2) => t2);
          if (line) return line;
          node = node.parentElement;
        }
        return "";
      });
      // fill every match — duplicate form copies and multiple questions per rule
      if (new RegExp(t.label, "i").test(label)) {
        try { await el.fill(t.text); } catch {}
        // custom editors ignore Playwright's fill — verify, then set through the
        // native value setter with React-visible events
        const ok = await el.evaluate((e, v) => {
          if (e.value === v) return true;
          const proto = e.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value").set.call(e, v);
          e.dispatchEvent(new Event("input", { bubbles: true }));
          e.dispatchEvent(new Event("change", { bubbles: true }));
          e.dispatchEvent(new Event("blur", { bubbles: true }));
          return e.value === v;
        }, t.text).catch(() => false);
        if (ok) { out.texts.push({ label, len: t.text.length }); done = true; }
      }
    }
    if (!done) out.texts.push({ label: t.label, result: "not_found" });
  }

  // Radio groups: match the group's question against combos rules.
  const radioResults = await page.evaluate((rules) => {
    const results = [];
    const groups = new Map();
    for (const r of document.querySelectorAll('input[type="radio"]')) {
      if (r.offsetParent === null) continue;
      const key = r.name || r.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (const [, members] of groups) {
      if (members.some((m) => m.checked)) continue;
      let q = "";
      let node = members[0].parentElement;
      for (let d = 0; d < 8 && node; d++) {
        if (members.every((m) => node.contains(m))) {
          q = (node.innerText ?? "").split("\n").map((t) => t.trim()).find((t) => t.length > 8) ?? "";
          break;
        }
        node = node.parentElement;
      }
      for (const rule of rules) {
        if (!new RegExp(rule.label, "i").test(q)) continue;
        const preferRe = new RegExp(rule.prefer, "i");
        const hit = members.find((m) => preferRe.test((m.labels?.[0]?.innerText || m.value || m.parentElement?.innerText || "").trim()));
        if (hit) {
          (hit.labels?.[0] ?? hit).click();
          results.push({ group: q.slice(0, 60), picked: (hit.labels?.[0]?.innerText || hit.value || "").slice(0, 50) });
          break;
        }
      }
    }
    return results;
  }, ANSWERS.combos ?? []);
  for (const g of radioResults) out.combos.push({ label: g.group, picked: `radio: ${g.picked}` });
  await page.waitForTimeout(400);

  // Checkbox GROUPS (mark-all-that-apply / pick-a-location): match the group's
  // question against combos rules and check the member whose label matches prefer.
  const groupResults = await page.evaluate((rules) => {
    const results = [];
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter((e) => e.offsetParent !== null);
    const groups = new Map();
    for (const b of boxes) {
      let container = b.closest("fieldset");
      if (!container) {
        container = b.parentElement;
        for (let d = 0; d < 6 && container; d++) {
          if (container.querySelectorAll('input[type="checkbox"]').length >= 2) break;
          container = container.parentElement;
        }
      }
      if (!container || container.querySelectorAll('input[type="checkbox"]').length < 2) continue;
      if (!groups.has(container)) groups.set(container, []);
      groups.get(container).push(b);
    }
    for (const [container, members] of groups) {
      const question = (container.innerText ?? "").split("\n").map((t) => t.trim()).find((t) => t.length > 8) ?? "";
      if (members.some((m) => m.checked)) continue;
      let picked = false;
      for (const r of rules) {
        if (!new RegExp(r.label, "i").test(question)) continue;
        const preferRe = new RegExp(r.prefer, "i");
        const hit = members.find((m) => preferRe.test((m.labels?.[0]?.innerText || m.value || m.parentElement?.innerText || "").trim()));
        if (hit) {
          hit.click();
          results.push({ group: question.slice(0, 60), picked: (hit.labels?.[0]?.innerText || hit.value || "").slice(0, 50) });
          picked = true;
          break;
        }
      }
      if (!picked) {
        // office-choice fallback: all members look like "City, ST" / Remote —
        // standing preference is Remote first, then New York
        const lbls = members.map((m) => (m.labels?.[0]?.innerText || m.parentElement?.innerText || "").trim());
        if (lbls.length && lbls.every((l) => /remote|,\s*[A-Z]{2}\b/i.test(l))) {
          let j = lbls.findIndex((l) => /remote/i.test(l));
          if (j < 0) j = lbls.findIndex((l) => /new york/i.test(l));
          if (j >= 0) { members[j].click(); results.push({ group: question.slice(0, 60), picked: lbls[j].slice(0, 50) }); }
        }
      }
    }
    return results;
  }, ANSWERS.combos ?? []);
  for (const g of groupResults) out.combos.push({ label: g.group, picked: `group: ${g.picked}` });
  await page.waitForTimeout(400);

  // Auto-consent: any unchecked consent/acknowledgment checkbox gets checked.
  const consented = await page.evaluate(() => {
    const re = /i agree|acknowledge|consent|certify|privacy (notice|policy)|terms|arbitration|i have read/i;
    const done = [];
    for (const e of document.querySelectorAll('input[type="checkbox"]')) {
      if (e.offsetParent === null || e.checked) continue;
      let lbl = e.labels?.[0]?.innerText || "";
      let node = e.parentElement;
      for (let d = 0; d < 5 && node && !lbl.trim(); d++) { lbl = node.innerText ?? ""; node = node.parentElement; }
      // never auto-check own-words/original-work pledges — those are the user's
      if (/own words|only my own|without (the use of )?ai/i.test(lbl)) continue;
      if (re.test(lbl)) { e.click(); done.push(lbl.trim().slice(0, 50)); }
    }
    return done;
  });
  for (const c2 of consented) out.combos.push({ label: "auto-consent", picked: c2 });
  await page.waitForTimeout(300);

  // Consent-style checkboxes, matched by walked label text.
  for (const cb of ANSWERS.checkboxes ?? []) {
    const done = await page.evaluate((labelSrc) => {
      const re = new RegExp(labelSrc, "i");
      for (const e of document.querySelectorAll('input[type="checkbox"]')) {
        if (e.offsetParent === null || e.checked) continue;
        let lbl = e.labels?.[0]?.innerText || "";
        let node = e.parentElement;
        for (let d = 0; d < 5 && node && !lbl.trim(); d++) { lbl = node.innerText ?? ""; node = node.parentElement; }
        if (re.test(lbl)) { e.click(); return lbl.trim().slice(0, 60); }
      }
      return null;
    }, cb.label);
    out.combos.push({ label: cb.label, picked: done ? `checked: ${done}` : null, result: done ? undefined : "checkbox not found" });
    await page.waitForTimeout(300);
  }

  await page.waitForTimeout(1000);
  out.missingRequired = await page.evaluate(() => {
    const walkLabel = (e) => {
      const direct = e.labels?.[0]?.innerText || e.getAttribute("aria-label") || e.placeholder || "";
      if (direct.trim()) return direct.trim().slice(0, 70);
      let node = e.parentElement;
      for (let d = 0; d < 6 && node; d++) {
        const line = (node.innerText ?? "").split("\n").map((t) => t.trim())
          .find((t) => t && !/^select\.{0,3}$/i.test(t));
        if (line) return line.slice(0, 70);
        node = node.parentElement;
      }
      return e.name || e.id || "?";
    };
    const seen = new Set(); const res = [];
    for (const e of document.querySelectorAll("input,select,textarea")) {
      if (e.type === "file" || e.type === "hidden" || e.offsetParent === null) continue;
      const isSentinel = /requiredinput/i.test(e.className ?? "");
      const isCombo = e.getAttribute("role") === "combobox" || e.closest('[role="combobox"]');
      if (isCombo && !isSentinel) continue; // the sentinel carries the required state
      const req = isSentinel || e.required || e.getAttribute("aria-required") === "true";
      if (!req) continue;
      const filled = e.type === "radio" || e.type === "checkbox"
        ? Array.from(document.getElementsByName(e.name)).some((r) => r.checked) : Boolean(e.value);
      if (filled) continue;
      const label = walkLabel(e);
      if (!seen.has(label)) { seen.add(label); res.push(label); }
    }
    return res;
  });
  out.filledScreenshot = path.join(WORK, `ghfill-${tag}.png`);
  await page.screenshot({ path: out.filledScreenshot, fullPage: true });

  if (SUBMIT && out.missingRequired.length === 0) {
    await page.getByRole("button", { name: /submit application|submit/i }).first().click();
    await page.waitForTimeout(7000);
    let text = await page.evaluate(() => document.body?.innerText ?? "");

    // Greenhouse can demand an emailed security code before accepting.
    if (/verification code was sent|security code/i.test(text)) {
      const codeFile = path.join(WORK, "gh-code.txt");
      fs.rmSync(codeFile, { force: true });
      console.error("WAITING_FOR_CODE " + codeFile);
      const deadline = Date.now() + 300000;
      let code = null;
      while (Date.now() < deadline && !code) {
        if (fs.existsSync(codeFile)) {
          const raw = fs.readFileSync(codeFile, "utf8").replace(/[^a-z0-9]/gi, "");
          if (raw.length >= 6) code = raw;
        }
        if (!code) await new Promise((r) => setTimeout(r, 3000));
      }
      if (code) {
        const cell = page.locator('input[maxlength="1"]').first();
        if (await cell.isVisible().catch(() => false)) {
          await cell.click();
          await page.keyboard.type(code, { delay: 120 });
        } else {
          await page.locator('input[name*="security" i], input[autocomplete="one-time-code"]').first().fill(code).catch(() => {});
        }
        out.codeEntered = true;
        await page.waitForTimeout(1500);
        const btn = page.getByRole("button", { name: /submit application|submit/i }).first();
        if (await btn.isEnabled().catch(() => false)) await btn.click().catch(() => {});
        await page.waitForTimeout(8000);
        text = await page.evaluate(() => document.body?.innerText ?? "");
      } else {
        out.codeTimeout = true;
      }
    }

    out.confirmation = /thanks? (you|for)|application (was )?(received|submitted|sent)|successfully/i.test(text);
    out.confirmationSnippet = text.slice(0, 400);
    if (!out.confirmation) {
      out.finalUrl = page.url();
      out.errors = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="alert"], [class*="error" i], [class*="Error"]'))
          .map((e) => e.innerText?.trim())
          .filter((t) => t && t.length > 2 && t.length < 200)
          .slice(0, 10));
    }
    out.submitScreenshot = path.join(WORK, `ghsubmit-${tag}.png`);
    await page.screenshot({ path: out.submitScreenshot, fullPage: true });
  } else if (SUBMIT) {
    out.confirmation = false;
    out.note = "not submitted — required fields still empty";
  }
} catch (e) {
  out.error = String(e?.message ?? e);
} finally {
  await browser.close().catch(() => {});
  console.log(JSON.stringify(out, null, 2));
}
