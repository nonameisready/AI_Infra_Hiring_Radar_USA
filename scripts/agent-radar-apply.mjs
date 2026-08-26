#!/usr/bin/env node
/**
 * Radar fill for the daily agent run: after the Jobright pool is cleared, top
 * up the daily quota from the user's own AI Hiring Radar — both tracks, best
 * score first, using the resume uploaded for each tab.
 *
 *   node scripts/agent-radar-apply.mjs --quota 90            # queue + apply
 *   node scripts/agent-radar-apply.mjs --quota 90 --plan     # select only, no queueing
 *   node scripts/agent-radar-apply.mjs --quota 90 --no-worker # queue but skip the browser pass
 *
 * Requires DATABASE_URL in the environment (the script boots the app locally
 * against it). The browser pass is worker/auto-apply.mjs --submit --once,
 * which fills with public/autofill.js overlaid with the agent's learned
 * answers (data/agent/memory.json) and only reports "submitted" when the ATS
 * actually shows a confirmation.
 *
 * Output: one JSON object on stdout — selection, per-status outcome counts,
 * and the failure list the agent mirrors into data/agent/pending.json.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};

const QUOTA = Number(opt("quota", "90"));
const TRACKS = String(opt("tracks", "ai,fde")).split(",");
const PORT = Number(opt("port", "3390"));
const BASE = `http://localhost:${PORT}`;
const PLAN_ONLY = flag("plan");
const RUN_WORKER = !flag("no-worker");

if (!process.env.DATABASE_URL) {
  console.log(JSON.stringify({ ok: false, reason: "DATABASE_URL is not set — add it to the Claude environment" }));
  process.exit(2);
}

const agentState = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "agent", f), "utf8"));
  } catch {
    return fallback;
  }
};

async function api(pathname, init) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${pathname} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function waitForServer(deadlineMs = 120_000) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    try {
      await api("/api/stats");
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return false;
}

const out = { ok: true, quota: QUOTA, tracks: TRACKS };
let server = null;
try {
  // Boot the app locally against the production database.
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: { ...process.env, APPLY_WORKER_ENABLED: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (!(await waitForServer())) throw new Error("local app did not come up in 120s");

  // ---- Select: best-scored unapplied USA jobs from both tracks ------------
  const appliedKeys = new Set(Object.values(agentState("applied.json", { jobs: {} }).jobs).map((j) => j.key));
  // Sources the browser pass can actually fill; the rest would only burn quota.
  const FILLABLE = new Set(["greenhouse", "lever", "ashby"]);

  const perTrack = Math.ceil(QUOTA / TRACKS.length);
  const picked = [];
  for (const track of TRACKS) {
    const res = await api(`/api/jobs?track=${track}&hideApplied=1&usa=1&sort=match&limit=300`);
    let took = 0;
    for (const j of res.jobs) {
      if (took >= perTrack || picked.length >= QUOTA) break;
      const key = `${j.company.toLowerCase().trim()}::${j.title.toLowerCase().trim()}`;
      if (appliedKeys.has(key)) continue;
      if (j.application) continue;
      if (!FILLABLE.has(j.source)) continue;
      // Skip jobs the match scorer flags as sponsorship-blocked — applying
      // would waste quota on honest rejections. Other flags (off-track,
      // seniority) just rank lower; they are not auto-rejections.
      const flags = j.matchBreakdown?.flags ?? [];
      if (flags.some((f) => /citizenship|clearance|sponsorship/.test(f))) continue;
      picked.push({ id: j.id, track, title: j.title, company: j.company, match: j.match ?? j.score, source: j.source, url: j.applyUrl || j.url });
      took++;
    }
  }
  out.selected = picked.length;
  out.byTrack = Object.fromEntries(TRACKS.map((t) => [t, picked.filter((p) => p.track === t).length]));
  out.jobs = picked.map((p) => `${p.match}% ${p.track} ${p.source} | ${p.company} — ${p.title}`);
  if (PLAN_ONLY) {
    console.log(JSON.stringify(out, null, 1));
    process.exit(0);
  }

  // ---- Queue --------------------------------------------------------------
  const queuedIds = [];
  for (let i = 0; i < picked.length; i += 25) {
    const batch = picked.slice(i, i + 25).map((p) => p.id);
    const res = await api("/api/apply", { method: "POST", body: JSON.stringify({ jobIds: batch }) });
    for (const o of res.outcomes) if (o.status === "queued" || o.status === "submitted") queuedIds.push(o.jobId);
  }
  out.queued = queuedIds.length;

  // ---- Browser pass -------------------------------------------------------
  if (RUN_WORKER && queuedIds.length) {
    await new Promise((resolve) => {
      const w = spawn("node", ["worker/auto-apply.mjs", "--submit", "--once"], {
        env: { ...process.env, RADAR_URL: BASE },
        stdio: ["ignore", "inherit", "inherit"],
      });
      w.on("exit", resolve);
    });
  }

  // ---- Summarize ----------------------------------------------------------
  const apps = await api("/api/applications");
  const todays = apps.applications.filter((a) => picked.some((p) => p.id === a.job.id));
  out.outcomes = {};
  for (const a of todays) out.outcomes[a.status] = (out.outcomes[a.status] ?? 0) + 1;
  out.submitted = todays.filter((a) => a.status === "submitted").map((a) => ({
    id: a.job.id, title: a.job.title, company: a.job.company, track: a.job.track, url: a.job.url,
  }));
  out.failures = todays
    .filter((a) => a.status === "needs_manual" || a.status === "failed")
    .map((a) => ({
      id: a.job.id, title: a.job.title, company: a.job.company, track: a.job.track,
      url: a.job.url, reason: a.error ?? a.status,
    }));
} catch (e) {
  out.ok = false;
  out.error = String(e?.message ?? e);
} finally {
  server?.kill("SIGTERM");
  console.log(JSON.stringify(out, null, 1));
}
