#!/usr/bin/env node
/**
 * Run an ingest pass from the command line, without the web server.
 * Useful for the first load and for cron on a box you control.
 *
 *   npm run refresh
 */
import "dotenv/config";

// The ingest pipeline is TypeScript that runs inside Next, so this script just
// calls the app's own /api/refresh rather than duplicating it.
const BASE = (process.env.RADAR_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.RADAR_TOKEN ?? process.env.CRON_SECRET ?? "";

const res = await fetch(`${BASE}/api/refresh`, {
  method: "POST",
  headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
}).catch((e) => {
  console.error(`Could not reach ${BASE}: ${e.message}`);
  console.error("Start the app first (npm run dev), or set RADAR_URL to your deployment.");
  process.exit(1);
});

const body = await res.json();
if (!res.ok || !body.ok) {
  console.error("Refresh failed:", body.error ?? res.status);
  process.exit(1);
}

console.log(
  `Scanned ${body.companies} boards in ${(body.durationMs / 1000).toFixed(1)}s\n` +
    `  ${body.fetched} postings fetched\n` +
    `  ${body.matched} matched a track\n` +
    `  ${body.created} new · ${body.updated} updated · ${body.deactivated} closed`,
);

if (body.failures) {
  console.log(`\n${body.failures} board(s) failed:`);
  for (const r of body.results.filter((r) => !r.ok)) {
    console.log(`  ${r.company} (${r.atsType}:${r.atsKey}) — ${r.error}`);
  }
}
