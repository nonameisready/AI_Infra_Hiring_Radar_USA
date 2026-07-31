#!/usr/bin/env node
/**
 * Apply migrations safely, and clear a stuck one if it is blocking.
 *
 *   node scripts/db-deploy.mjs            apply (used by vercel-build)
 *   node scripts/db-deploy.mjs --report   diagnose only, change nothing
 *   node scripts/db-deploy.mjs --seed     also seed after applying
 *
 * Two things this handles that `prisma migrate deploy` alone does not.
 *
 * 1. Connection pooling. Migrations must run over a direct connection. Neon,
 *    Supabase and friends hand out a transaction-mode pooler URL by default,
 *    and DDL through PgBouncer is how a database ends up with migrations
 *    recorded as applied but their tables missing. Set DIRECT_URL to the
 *    non-pooled connection string; failing that, this derives it and probes it.
 *
 * 2. A failed migration. Prisma records it and then refuses every later deploy
 *    with P3009. Clearing it by hand is normally the right call, but the
 *    migrations here are idempotent, so re-applying one that half-ran cannot
 *    damage data — which makes it safe to clear automatically.
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const args = new Set(process.argv.slice(2));
const REPORT_ONLY = args.has("--report");
const SEED = args.has("--seed");

const EXPECTED_TABLES = ["Company", "Job", "Note", "Resume", "Profile", "Application"];

function redact(url) {
  return url.replace(/\/\/[^@]*@/, "//<credentials>@");
}

function client(url) {
  return new PrismaClient({ datasources: { db: { url } } });
}

async function reachable(url) {
  const db = client(url);
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

/** Pick the connection migrations should run over. */
async function resolveMigrationUrl() {
  if (process.env.DIRECT_URL) {
    return { url: process.env.DIRECT_URL, note: "using DIRECT_URL" };
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Neither DIRECT_URL nor DATABASE_URL is set.");
    process.exit(1);
  }

  if (!/-pooler\./.test(url)) return { url, note: "using DATABASE_URL" };

  // Neon's direct endpoint is the pooled host without the "-pooler" suffix.
  const direct = url.replace(/-pooler\./, ".");
  console.log("DATABASE_URL points at a connection pooler, which is not safe for migrations.");
  console.log("Probing the direct endpoint…");

  if (await reachable(direct)) {
    console.log("Direct endpoint works — migrating over that instead.");
    console.log("Set DIRECT_URL to make this explicit:\n  " + redact(direct) + "\n");
    return { url: direct, note: "derived direct endpoint" };
  }

  console.log("Could not reach the direct endpoint. Falling back to the pooled URL.");
  console.log("If this fails, set DIRECT_URL to your non-pooled connection string.\n");
  return { url, note: "pooled URL (not recommended)" };
}

function prismaCli(cliArgs, url) {
  execFileSync("npx", ["prisma", ...cliArgs], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}

const { url, note } = await resolveMigrationUrl();
console.log(`Database: ${redact(url)}  (${note})\n`);

const db = client(url);

try {
  const tables = await db.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
  `;
  const present = new Set(tables.map((t) => t.tablename));

  console.log("Tables");
  for (const name of EXPECTED_TABLES) {
    console.log(`  ${present.has(name) ? "present" : "MISSING"}  ${name}`);
  }

  let failed = [];

  if (present.has("_prisma_migrations")) {
    const history = await db.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations" ORDER BY started_at
    `;
    console.log("\nMigration history");
    for (const m of history) {
      const state = m.rolled_back_at ? "rolled back" : m.finished_at ? "applied" : "FAILED";
      console.log(`  ${state.padEnd(11)} ${m.migration_name}`);
    }
    failed = history.filter((m) => !m.finished_at && !m.rolled_back_at);

    const claimsApplied = history.some((m) => m.finished_at && !m.rolled_back_at);
    const missing = EXPECTED_TABLES.filter((t) => !present.has(t));
    if (claimsApplied && missing.length === EXPECTED_TABLES.length) {
      console.log(
        "\nHistory says migrations were applied but none of the tables exist.\n" +
          "This database is not the one that history was written against, or the\n" +
          "migrations ran through a connection pooler. The migrations are idempotent,\n" +
          "so re-applying them will rebuild the schema.",
      );
    }
  } else {
    console.log("\nMigration history: none yet");
  }

  await db.$disconnect();

  if (REPORT_ONLY) {
    console.log(`\nReport only — nothing changed. ${failed.length} failed migration(s).`);
    process.exit(0);
  }

  for (const m of failed) {
    console.log(`\nClearing failed migration ${m.migration_name}…`);
    prismaCli(["migrate", "resolve", "--rolled-back", m.migration_name], url);
  }

  console.log("\nApplying migrations…\n");
  prismaCli(["migrate", "deploy"], url);

  // The company registry is static reference data, and the app shows an empty
  // radar without it. Seeding is an upsert keyed by name, so loading it
  // whenever the table is empty is safe and saves a manual step after every
  // fresh or rebuilt database.
  let shouldSeed = SEED;
  if (!shouldSeed) {
    const after = client(url);
    try {
      const [{ count }] = await after.$queryRaw`SELECT count(*)::int AS count FROM "Company"`;
      if (count === 0) {
        console.log("\nNo job boards in the database yet — seeding the registry.");
        shouldSeed = true;
      } else {
        console.log(`\n${count} job boards already registered.`);
      }
    } catch (e) {
      console.log(`\nCould not check the company registry: ${e.message}`);
    } finally {
      await after.$disconnect().catch(() => {});
    }
  }

  if (shouldSeed) {
    console.log("\nSeeding job boards…\n");
    execFileSync("node", ["prisma/seed.mjs"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: url },
    });
    console.log("\nBoards loaded. Postings arrive on the first scan — press");
    console.log('"Refresh jobs" in the app, or wait for the daily cron.');
  }

  console.log("\nDatabase is up to date.");
} catch (e) {
  console.error("\nFailed:", e.message);
  process.exit(1);
} finally {
  await db.$disconnect().catch(() => {});
}
