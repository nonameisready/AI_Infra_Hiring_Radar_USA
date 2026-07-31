#!/usr/bin/env tsx
/**
 * Scan every job board and update the database.
 *
 *   npm run scan
 *
 * This talks to Postgres directly rather than calling the deployed
 * /api/refresh, so the scheduled scan does not depend on the deployment URL,
 * on a shared token, or on a serverless function finishing inside its timeout.
 * The web endpoint stays for the Refresh button.
 */
import { runRefresh } from "../lib/ingest";
import { prisma } from "../lib/db";
import "dotenv/config";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    return 1;
  }

  const started = Date.now();

  const boards = await prisma.company.count({
    where: { disabled: false, atsKey: { not: null } },
  });

  if (boards === 0) {
    console.error(
      "No job boards registered — nothing to scan.\n" +
        "Run the Database Repair workflow with repair-and-seed, or `npm run prisma:seed`.",
    );
    return 1;
  }

  const summary = await runRefresh();

  console.log(
    `Scanned ${summary.companies} boards in ${(summary.durationMs / 1000).toFixed(1)}s\n` +
      `  ${summary.fetched} postings fetched\n` +
      `  ${summary.matched} matched a track\n` +
      `  ${summary.created} new · ${summary.updated} updated · ${summary.deactivated} closed`,
  );

  const [ai, fde] = await Promise.all([
    prisma.job.count({ where: { active: true, track: "ai" } }),
    prisma.job.count({ where: { active: true, track: "fde" } }),
  ]);
  console.log(`\nLive roles: ${ai} AI · Infra · Agentic, ${fde} Forward Deployed`);

  if (summary.failures) {
    console.log(`\n${summary.failures} board(s) failed:`);
    for (const r of summary.results.filter((r) => !r.ok)) {
      console.log(`  ${r.company} (${r.atsType}:${r.atsKey}) — ${r.error}`);
    }
  }

  // A few boards rate-limiting is normal and self-corrects on the next run.
  // Most of them failing means something is actually wrong, so fail the job.
  if (summary.failures > summary.companies / 2) {
    console.error("\nMore than half the boards failed — treating this run as a failure.");
    return 1;
  }

  if (summary.matched === 0) {
    console.error("\nNo postings matched any track. That is not expected.");
    return 1;
  }

  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return 0;
}

main()
  .catch((e) => {
    console.error("Scan failed:", e?.message ?? e);
    return 1;
  })
  .then(async (code) => {
    await prisma.$disconnect().catch(() => {});
    process.exit(code);
  });
