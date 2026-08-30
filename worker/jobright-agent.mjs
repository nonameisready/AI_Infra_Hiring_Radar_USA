#!/usr/bin/env node
/**
 * Jobright Agent — browser driver for the daily auto-apply run.
 *
 * This is the fast path the agent (a daily Claude session following
 * agent/RUNBOOK.md) calls step by step. Every command prints one JSON object
 * to stdout so the caller can branch on it, and drops a screenshot + text
 * snapshot on any failure so the caller can take over the browser work itself
 * when Jobright's DOM has drifted from these selectors.
 *
 *   node worker/jobright-agent.mjs login            # password login (JOBRIGHT_EMAIL/JOBRIGHT_PASSWORD)
 *   node worker/jobright-agent.mjs login --google   # Google OAuth attempt (often bot-blocked; fallback only)
 *   node worker/jobright-agent.mjs matches          # scrape the recommended list → jobs JSON
 *   node worker/jobright-agent.mjs apply --url <jobright job url> [--submit]
 *   node worker/jobright-agent.mjs snapshot --url <any url>       # screenshot + text for inspection
 *
 * Shared flags:
 *   --state <file>     storage-state path (default $AGENT_WORK_DIR/jobright-state.json)
 *   --out <dir>        artifacts dir for screenshots/snapshots (default $AGENT_WORK_DIR)
 *   --code-file <file> where a login verification code will appear; the script
 *                      polls it for up to 3 minutes. The Claude session reads
 *                      the code from Gmail and writes it there.
 *   --headed           watch it work
 *
 * Secrets come from the environment only (JOBRIGHT_EMAIL, JOBRIGHT_PASSWORD)
 * and are never written to the repo. The storage state file holds session
 * cookies — keep it in the scratch dir, never commit it.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "help";
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};

const WORK = process.env.AGENT_WORK_DIR ?? path.join(process.cwd(), ".agent-work");
const OUT = opt("out", WORK);
const STATE = opt("state", path.join(WORK, "jobright-state.json"));
const BASE = process.env.JOBRIGHT_BASE_URL ?? "https://jobright.ai";
const EMAIL = process.env.JOBRIGHT_EMAIL ?? "huiluckylucky@gmail.com";

fs.mkdirSync(OUT, { recursive: true });

function emit(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

async function saveEvidence(page, tag) {
  const shot = path.join(OUT, `${tag}-${Date.now()}.png`);
  const txt = shot.replace(/\.png$/, ".txt");
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  fs.writeFileSync(txt, `URL: ${page.url()}\n\n${text.slice(0, 40_000)}`);
  return { screenshot: shot, textDump: txt, url: page.url() };
}

async function launch() {
  const browser = await chromium.launch({
    headless: !flag("headed"),
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
    ...(process.env.HTTPS_PROXY || process.env.https_proxy
      ? { proxy: { server: process.env.HTTPS_PROXY ?? process.env.https_proxy } }
      : {}),
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      // The remote container's egress gateway resets Chromium's TLS 1.3
      // ClientHello inside CONNECT tunnels but accepts TLS 1.2, and Chromium
      // reads trust from ~/.pki/nssdb, which agent/setup-browser-trust.sh
      // must have populated with the proxy CA first.
      ...(process.env.CCR_AGENT_PROXY_ENABLED ? ["--ssl-version-max=tls1.2"] : []),
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    ...(fs.existsSync(STATE) ? { storageState: STATE } : {}),
  });
  return { browser, context };
}

async function persistState(context) {
  await context.storageState({ path: STATE });
}

/** Poll --code-file for a 4-8 digit verification code for up to 3 minutes. */
async function waitForCode() {
  const file = opt("code-file", path.join(WORK, "login-code.txt"));
  const deadline = Date.now() + 180_000;
  process.stderr.write(`waiting for verification code in ${file}\n`);
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const code = fs.readFileSync(file, "utf8").replace(/\D/g, "");
      if (code.length >= 4) {
        fs.rmSync(file, { force: true });
        return code;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function isLoggedIn(page) {
  await page.goto(`${BASE}/jobs/recommend`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3500);
  const url = page.url();
  // Landing back on marketing/login pages means the session is gone.
  if (/onboarding|login|signin|sign-in/i.test(url)) return false;
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  if (/sign in|log ?in to continue|continue with google/i.test(text.slice(0, 3000)) && !/match/i.test(text)) return false;
  return /\/jobs/.test(url);
}

async function fillFirstVisible(page, selectors, value) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      await el.fill(value);
      return true;
    }
  }
  return false;
}

async function clickFirstVisible(page, locators) {
  for (const make of locators) {
    const el = make().first();
    if (await el.isVisible().catch(() => false)) {
      await el.click().catch(() => {});
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- login ----
async function login() {
  const { browser, context } = await launch();
  const page = await context.newPage();
  try {
    if (await isLoggedIn(page)) {
      await persistState(context);
      return emit({ ok: true, alreadyLoggedIn: true, state: STATE });
    }

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    await clickFirstVisible(page, [
      () => page.getByRole("button", { name: /sign in|log ?in/i }),
      () => page.getByRole("link", { name: /sign in|log ?in/i }),
    ]);
    await page.waitForTimeout(2000);

    if (flag("google")) {
      // Best effort only: Google routinely refuses automated browsers.
      const popupP = page.waitForEvent("popup", { timeout: 10_000 }).catch(() => null);
      await clickFirstVisible(page, [
        () => page.getByRole("button", { name: /google/i }),
        () => page.locator('[class*="google" i], [data-provider="google"]'),
      ]);
      const popup = (await popupP) ?? page;
      await popup.waitForTimeout(3000);
      const evidence = await saveEvidence(popup, "login-google");
      const blocked = /couldn.t sign you in|not secure|automation/i.test(
        await popup.evaluate(() => document.body?.innerText ?? "").catch(() => ""),
      );
      if (blocked) {
        return emit({
          ok: false,
          reason: "google_blocked",
          hint: "Google refused the automated browser. Use password login instead: set JOBRIGHT_PASSWORD and run without --google.",
          ...evidence,
        });
      }
      await fillFirstVisible(popup, ['input[type="email"]'], EMAIL);
      await popup.keyboard.press("Enter").catch(() => {});
      await popup.waitForTimeout(4000);
      return emit({
        ok: false,
        reason: "google_needs_password",
        hint: "Google asks for the account password interactively. The runbook's rule: do not automate the Google password — use Jobright password login.",
        ...(await saveEvidence(popup, "login-google")),
      });
    }

    // Email + password path.
    const password = process.env.JOBRIGHT_PASSWORD ?? "";
    if (!password) {
      return emit({
        ok: false,
        reason: "no_password",
        hint: "Set JOBRIGHT_PASSWORD in the environment (see questions.json q-login-method).",
        ...(await saveEvidence(page, "login")),
      });
    }

    await clickFirstVisible(page, [
      () => page.getByRole("button", { name: /email/i }),
      () => page.getByText(/continue with email|use email/i),
    ]);
    await page.waitForTimeout(1200);
    const emailOk = await fillFirstVisible(
      page,
      ['input[type="email"]', 'input[name*="email" i]', 'input[placeholder*="email" i]'],
      EMAIL,
    );
    const passOk = await fillFirstVisible(
      page,
      ['input[type="password"]', 'input[name*="password" i]'],
      password,
    );
    if (!emailOk || !passOk) {
      return emit({
        ok: false,
        reason: "login_form_not_found",
        hint: "Login form selectors drifted — inspect the snapshot and drive the login manually.",
        ...(await saveEvidence(page, "login")),
      });
    }
    // The modal's submit shares its "SIGN IN" label with the navbar button, so
    // target a submit-type button first — the role query alone hits the navbar.
    await clickFirstVisible(page, [
      () => page.locator('button[type="submit"]', { hasText: /sign in|log ?in|continue/i }),
      () => page.locator('button[type="submit"]'),
      () => page.getByRole("button", { name: /sign in|log ?in|continue/i }),
    ]);
    await page.waitForTimeout(5000);

    // Some logins challenge with an emailed code; the caller feeds it to us.
    const challenged = await page
      .locator('input[autocomplete="one-time-code"], input[name*="code" i], input[placeholder*="code" i]')
      .first()
      .isVisible()
      .catch(() => false);
    if (challenged) {
      emit({ ok: false, reason: "verification_code_needed", hint: "Read the code from Gmail and write it to the --code-file; this process keeps polling for 3 minutes." });
      const code = await waitForCode();
      if (!code) return emit({ ok: false, reason: "code_timeout", ...(await saveEvidence(page, "login")) });
      await fillFirstVisible(page, ['input[autocomplete="one-time-code"]', 'input[name*="code" i]', 'input[placeholder*="code" i]'], code);
      await page.keyboard.press("Enter").catch(() => {});
      await page.waitForTimeout(5000);
    }

    if (await isLoggedIn(page)) {
      await persistState(context);
      return emit({ ok: true, state: STATE });
    }
    return emit({ ok: false, reason: "login_failed", ...(await saveEvidence(page, "login")) });
  } finally {
    await browser.close().catch(() => {});
  }
}

// -------------------------------------------------------------- matches ----

/** Harvest every visible job card: percent, title/company via the "/" line. */
async function collectCards(page) {
  return page.evaluate(() => {
    const MATCH_RE = /(\d{2,3})\s*%\s*(?:(?:good|strong|fair|great)\s+)?match/i;
    const seen = new Map();
    const nodes = Array.from(document.querySelectorAll("div,li,article,section")).filter((el) => {
      const t = el.innerText ?? "";
      return MATCH_RE.test(t.replace(/\n/g, " ")) && t.length < 2500;
    });
    for (const el of nodes) {
      const a =
        el.querySelector('a[href*="/jobs/info"], a[href*="/job/"], a[href*="jobId"]') ??
        (el.closest('a[href*="/jobs/info"], a[href*="/job/"]') || null);
      const href = a?.getAttribute("href") ?? "";
      const text = (el.innerText ?? "").trim();
      const pm = text.replace(/\n/g, " ").match(MATCH_RE);
      if (!pm) continue;
      const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
      const slashIdx = lines.findIndex((l) => l === "/");
      let title = "";
      let company = "";
      if (slashIdx >= 2) {
        company = lines[slashIdx - 1];
        title = lines[slashIdx - 2];
      } else {
        const around = lines.filter((l) => l.length > 1 && l.length < 120 && !MATCH_RE.test(l));
        title = around[0] ?? "";
        company = around[1] ?? "";
      }
      const key = href || `${company}::${title}`;
      const entry = {
        jobrightUrl: href ? new URL(href, location.origin).toString() : "",
        matchPercent: Number(pm[1]),
        title,
        company,
        _len: text.length,
        _full: slashIdx >= 2,
      };
      // Prefer the smallest element that still holds the whole card — the
      // innermost hit is just the score badge, which knows no title.
      const prev = seen.get(key);
      const better =
        !prev ||
        (entry._full && !prev._full) ||
        (entry._full === prev._full && entry._len < prev._len);
      if (better) seen.set(key, entry);
    }
    return Array.from(seen.values()).map(({ _len, _full, ...e }) => e);
  });
}

async function matches() {
  const { browser, context } = await launch();
  const page = await context.newPage();
  try {
    if (!(await isLoggedIn(page))) {
      return emit({ ok: false, reason: "not_logged_in", hint: "Run the login command first.", ...(await saveEvidence(page, "matches")) });
    }

    // Widen the pool: the user wants the whole past week, not the first
    // screen of today. Best-effort — the scrape still works if this drifts.
    const dateFilter = page.getByText(/^Date Posted$/i).first();
    if (await dateFilter.isVisible().catch(() => false)) {
      await dateFilter.click().catch(() => {});
      await page.waitForTimeout(1200);
      const pastWeek = page.getByText(/^Past week$/i).first();
      if (await pastWeek.isVisible().catch(() => false)) {
        await pastWeek.click().catch(() => {});
        await page.waitForTimeout(2500);
      } else {
        await page.keyboard.press("Escape").catch(() => {});
      }
    }

    // The list lives in an inner scrollable container — scrolling the window
    // does nothing, which silently caps the pool at the first screen. It is
    // also virtualised, so harvest every round and merge rather than
    // collecting once at the end.
    const harvested = new Map();
    let dry = 0;
    for (let i = 0; i < 120 && dry < 4; i++) {
      const before = harvested.size;
      for (const j of await collectCards(page)) if (j.jobrightUrl) harvested.set(j.jobrightUrl, j);
      await page.evaluate(() => {
        let best = null;
        for (const el of document.querySelectorAll("*")) {
          const s = getComputedStyle(el);
          if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 100) {
            if (!best || el.scrollHeight > best.scrollHeight) best = el;
          }
        }
        if (best) best.scrollTop = best.scrollHeight;
        else window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1500);
      for (const j of await collectCards(page)) if (j.jobrightUrl) harvested.set(j.jobrightUrl, j);
      if (harvested.size <= before) dry++;
      else dry = 0;
    }

    const jobs = Array.from(harvested.values());
    const evidence = await saveEvidence(page, "matches");
    if (!jobs.length) {
      return emit({ ok: false, reason: "no_cards_parsed", hint: "The card selectors drifted — read the text dump and extract jobs yourself.", ...evidence });
    }
    jobs.sort((a, b) => b.matchPercent - a.matchPercent);
    return emit({ ok: true, count: jobs.length, jobs, ...evidence });
  } finally {
    await persistState(context).catch(() => {});
    await browser.close().catch(() => {});
  }
}

// ---------------------------------------------------------------- apply ----
async function apply() {
  const url = opt("url");
  if (!url) return emit({ ok: false, reason: "missing --url" });
  const SUBMIT = flag("submit");

  const { browser, context } = await launch();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3500);

    // Grab the original posting link before touching anything, so the caller
    // can fall back to the company site if Jobright's own flow dead-ends.
    const originalUrl = await page
      .evaluate(() => {
        const a = Array.from(document.querySelectorAll("a[href]")).find(
          (x) =>
            /apply|original|company site/i.test(x.innerText ?? "") &&
            !(x.getAttribute("href") ?? "").includes(location.hostname),
        );
        return a ? a.href : "";
      })
      .catch(() => "");

    // Jobright's own apply button ("Apply Now" / "1-Click Apply" / "Autofill").
    const popupP = page.waitForEvent("popup", { timeout: 15_000 }).catch(() => null);
    const clicked = await clickFirstVisible(page, [
      () => page.getByRole("button", { name: /1-?click|auto.?apply|apply now|apply with/i }),
      () => page.getByRole("link", { name: /apply now/i }),
      () => page.getByRole("button", { name: /^apply$/i }),
    ]);
    if (!clicked) {
      return emit({ ok: false, reason: "no_apply_button", originalUrl, ...(await saveEvidence(page, "apply")) });
    }
    await page.waitForTimeout(4000);
    const target = (await popupP) ?? page;
    await target.waitForTimeout(2000);

    const text = await target.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    const evidence = await saveEvidence(target, "apply");

    // Jobright confirms its own submissions in-page.
    if (/applied|application (sent|submitted)|success/i.test(text.slice(0, 4000)) && target === page) {
      return emit({ ok: true, via: "jobright", submitted: true, originalUrl, ...evidence });
    }

    // A popup means Jobright handed us to the company's ATS — report it so the
    // caller can run the direct-apply path (radar autofill runtime) there.
    if (target !== page) {
      return emit({
        ok: false,
        reason: "handed_off_to_ats",
        atsUrl: target.url(),
        originalUrl,
        submit: SUBMIT,
        hint: "Run the direct-apply path against atsUrl (worker/auto-apply.mjs logic / autofill runtime).",
        ...evidence,
      });
    }

    // Still on Jobright with a form/questions open — needs the caller's judgment.
    return emit({
      ok: false,
      reason: "jobright_flow_needs_review",
      originalUrl,
      hint: "Jobright opened an in-page flow (questions or confirmation). Read the text dump, answer from memory.json, or park the job as needs_info.",
      ...evidence,
    });
  } finally {
    await persistState(context).catch(() => {});
    await browser.close().catch(() => {});
  }
}

// -------------------------------------------------------------- snapshot ---
async function snapshot() {
  const url = opt("url");
  if (!url) return emit({ ok: false, reason: "missing --url" });
  const { browser, context } = await launch();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3500);
    emit({ ok: true, ...(await saveEvidence(page, "snapshot")) });
  } finally {
    await browser.close().catch(() => {});
  }
}

// --------------------------------------------------------- manual-login ---
// Open a real browser window; the human logs in themselves; we save the
// session state as soon as the app recognizes them. One-time bootstrap for
// machines where the automated modal flow misbehaves.
async function manualLogin() {
  process.argv.push("--headed"); // force a visible window
  const { browser, context } = await launch();
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  process.stderr.write("A browser window is open — sign in to Jobright yourself. I'll detect it (up to 5 min)…\n");
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(5000);
    try {
      const text = await page.evaluate(() => document.body?.innerText ?? "");
      const url = page.url();
      if (/\/jobs/.test(url) && !/sign in to continue/i.test(text.slice(0, 2000))) break;
      if (/match|recommend/i.test(text.slice(0, 4000)) && !/JOIN NOW/.test(text.slice(0, 2000))) break;
    } catch {}
  }
  await persistState(context);
  await browser.close().catch(() => {});
  return emit({ ok: true, state: STATE, note: "Session saved — copy it somewhere durable if WORK is a temp dir." });
}

const commands = { login, matches, apply, snapshot, "manual-login": manualLogin };
if (!commands[cmd]) {
  emit({
    ok: false,
    reason: "unknown_command",
    usage: "login [--google] | matches | apply --url <url> [--submit] | snapshot --url <url>",
  });
  process.exit(2);
}
commands[cmd]().catch(async (e) => {
  emit({ ok: false, reason: "crashed", error: String(e?.message ?? e) });
  process.exit(1);
});
