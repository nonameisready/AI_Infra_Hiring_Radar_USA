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
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
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
    await clickFirstVisible(page, [
      () => page.getByRole("button", { name: /sign in|log ?in|continue/i }),
      () => page.locator('button[type="submit"]'),
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
async function matches() {
  const { browser, context } = await launch();
  const page = await context.newPage();
  try {
    if (!(await isLoggedIn(page))) {
      return emit({ ok: false, reason: "not_logged_in", hint: "Run the login command first.", ...(await saveEvidence(page, "matches")) });
    }

    // Recommended list is virtualised/lazy — scroll to materialise cards.
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await page.waitForTimeout(900);
    }

    const jobs = await page.evaluate(() => {
      const seen = new Map();
      // A "card" is any element that mentions an N% match and links to a job.
      const nodes = Array.from(document.querySelectorAll("div,li,article,section")).filter((el) => {
        const t = el.innerText ?? "";
        return /\d{2,3}%\s*match/i.test(t) && t.length < 1200;
      });
      for (const el of nodes) {
        // Keep the innermost matching element per job link.
        const a =
          el.querySelector('a[href*="/jobs/info"], a[href*="/job/"], a[href*="jobId"]') ??
          (el.closest('a[href*="/jobs/info"], a[href*="/job/"]') || null);
        const href = a?.getAttribute("href") ?? "";
        const text = (el.innerText ?? "").trim();
        const pm = text.match(/(\d{2,3})%\s*match/i);
        if (!pm) continue;
        const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
        const pctIdx = lines.findIndex((l) => /%\s*match/i.test(l));
        const around = lines.filter((l, i2) => i2 !== pctIdx && l.length > 1 && l.length < 120);
        const key = href || lines.slice(0, 2).join("::");
        const entry = {
          jobrightUrl: href ? new URL(href, location.origin).toString() : "",
          matchPercent: Number(pm[1]),
          title: around[0] ?? "",
          company: around[1] ?? "",
          lines: lines.slice(0, 8),
        };
        const prev = seen.get(key);
        if (!prev || text.length < prev._len) seen.set(key, { ...entry, _len: text.length });
      }
      return Array.from(seen.values()).map(({ _len, ...e }) => e);
    });

    const evidence = await saveEvidence(page, "matches");
    if (!jobs.length) {
      return emit({ ok: false, reason: "no_cards_parsed", hint: "The card selectors drifted — read the text dump and extract jobs yourself.", ...evidence });
    }
    jobs.sort((a, b) => b.matchPercent - a.matchPercent);
    return emit({ ok: true, count: jobs.length, jobs, ...evidence });
  } finally {
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

const commands = { login, matches, apply, snapshot };
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
