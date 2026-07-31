#!/usr/bin/env node
/**
 * Browser worker for AI Hiring Radar.
 *
 * Pulls queued applications from the app, opens each posting in Chromium, fills
 * the form with your profile, attaches the right resume, and reports back.
 *
 *   npm run worker                 fill only, screenshot, never submit
 *   npm run worker -- --submit     actually press Submit
 *   npm run worker -- --once       drain the queue once and exit
 *   npm run worker -- --headed     watch it work
 *
 * Env:
 *   RADAR_URL    default http://localhost:3000
 *   RADAR_TOKEN  must match the server's RADAR_TOKEN when one is set
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const args = new Set(process.argv.slice(2));
const SUBMIT = args.has("--submit");
const ONCE = args.has("--once");
const HEADED = args.has("--headed");

const BASE = (process.env.RADAR_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.RADAR_TOKEN ?? "";
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 20_000);
const SHOTS = process.env.WORKER_SCREENSHOT_DIR ?? path.join(process.cwd(), ".worker-screenshots");

const AUTOFILL_SRC = fs.readFileSync(
  path.join(process.cwd(), "public", "autofill.js"),
  "utf8",
);

function log(...a) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
}

async function apiGet(pathname) {
  const res = await fetch(`${BASE}${pathname}`, {
    headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
  });
  if (!res.ok) throw new Error(`GET ${pathname} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function report(body) {
  const res = await fetch(`${BASE}/api/apply/queue`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) log("  ! could not report result:", res.status, await res.text());
}

/** Write the resume to a temp file so Playwright can hand it to the file input. */
function resumeToDisk(resume) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-resume-"));
  const file = path.join(dir, resume.fileName.replace(/[^\w.\-]/g, "_"));
  fs.writeFileSync(file, Buffer.from(resume.base64, "base64"));
  return file;
}

async function processItem(context, profile, item) {
  log(`→ ${item.company} — ${item.title}`);

  if (!item.resume) {
    await report({
      applicationId: item.applicationId,
      status: "needs_manual",
      error: "No resume available for this track",
    });
    return;
  }

  const page = await context.newPage();
  let resumePath = null;

  try {
    resumePath = resumeToDisk(item.resume);

    await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Application forms are usually below the description and lazily mounted.
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);

    // Some boards hide the form behind an "Apply" button.
    for (const label of ["Apply for this job", "Apply now", "Apply", "Submit application"]) {
      const btn = page.getByRole("button", { name: label, exact: false }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(1500);
        break;
      }
    }

    // Playwright drives real file inputs far more reliably than DataTransfer.
    const fileInputs = page.locator('input[type="file"]');
    const fileCount = await fileInputs.count();
    let attached = 0;
    for (let i = 0; i < fileCount; i++) {
      const input = fileInputs.nth(i);
      const name = ((await input.getAttribute("name")) ?? "") + ((await input.getAttribute("id")) ?? "");
      if (/cover|transcript|photo/i.test(name)) continue;
      await input.setInputFiles(resumePath).catch(() => {});
      attached++;
    }

    // Then the shared runtime fills every text / select / radio field. It is
    // injected through evaluate() rather than a <script> tag because Greenhouse
    // and Ashby both send script-src 'self'; evaluate() is not subject to CSP.
    await page.evaluate(`(() => { ${AUTOFILL_SRC} })()`);
    const result = await page.evaluate(
      ([p, opts]) => window.__radarAutofill({ profile: p, resume: null }, opts),
      [profile, { submit: SUBMIT, overwrite: false }],
    );

    fs.mkdirSync(SHOTS, { recursive: true });
    const shot = path.join(SHOTS, `${item.applicationId}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

    if (SUBMIT) await page.waitForTimeout(4000);

    const detail = JSON.stringify(
      {
        filled: result.filled.length,
        fields: result.filled.map((f) => f.label).slice(0, 25),
        skipped: result.skipped.slice(0, 10),
        resumeInputs: fileCount,
        resumeAttached: attached,
        submitted: result.submitted,
        screenshot: shot,
      },
      null,
      0,
    );

    // Filling nothing means the page was not the application form.
    const usable = result.filled.length >= 3 && attached > 0;

    if (SUBMIT && result.submitted && usable) {
      log(`  ✓ submitted (${result.filled.length} fields, resume attached)`);
      await report({ applicationId: item.applicationId, status: "submitted", detail });
    } else if (usable) {
      log(`  • filled ${result.filled.length} fields${SUBMIT ? " but found no submit button" : " (dry run — not submitted)"}`);
      await report({
        applicationId: item.applicationId,
        status: "needs_manual",
        detail,
        error: SUBMIT
          ? "Form filled but no submit button was found"
          : `Dry run: ${result.filled.length} fields filled, screenshot at ${shot}. Re-run with --submit to send it.`,
      });
    } else {
      log(`  ! only ${result.filled.length} fields filled, ${attached}/${fileCount} file inputs`);
      await report({
        applicationId: item.applicationId,
        status: "needs_manual",
        error: `Could not fill this form automatically (${result.filled.length} fields, ${attached} of ${fileCount} uploads)`,
        detail,
      });
    }
  } catch (e) {
    log(`  ✗ ${e.message}`);
    await report({
      applicationId: item.applicationId,
      status: "failed",
      error: String(e.message).slice(0, 500),
    });
  } finally {
    await page.close().catch(() => {});
    if (resumePath) fs.rmSync(path.dirname(resumePath), { recursive: true, force: true });
  }
}

async function main() {
  log(`Radar worker → ${BASE}`);
  log(SUBMIT ? "MODE: submitting applications for real" : "MODE: dry run — fills forms, never submits");
  if (!SUBMIT) log("      add --submit once you have checked a few screenshots");

  const browser = await chromium.launch({
    headless: !HEADED,
    // Point at an existing Chromium instead of the bundled one when the
    // machine already has a build (CI images, sandboxes, corporate installs).
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
    // Honour the usual proxy env vars so this works behind a corporate proxy.
    ...(process.env.HTTPS_PROXY || process.env.https_proxy
      ? { proxy: { server: process.env.HTTPS_PROXY ?? process.env.https_proxy } }
      : {}),
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });

  try {
    for (;;) {
      let batch;
      try {
        batch = await apiGet("/api/apply/queue?limit=5");
      } catch (e) {
        log("! queue unreachable:", e.message);
        if (ONCE) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }

      if (!batch.items.length) {
        if (ONCE) {
          log("Queue empty — done.");
          break;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }

      log(`Picked up ${batch.items.length} application(s)`);
      for (const item of batch.items) {
        await processItem(context, batch.profile, item);
        await new Promise((r) => setTimeout(r, 2500)); // be polite to the ATS
      }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
