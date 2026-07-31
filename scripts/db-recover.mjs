#!/usr/bin/env node
/**
 * Diagnose and clear a stuck Prisma migration.
 *
 *   DATABASE_URL="<your production url>" npm run db:recover
 *
 * When a migration fails part-way, Prisma records it as failed and refuses to
 * apply anything else until the failure is resolved — every later deploy dies
 * with P3018. This prints what the database actually contains, marks failed
 * migrations as rolled back, and re-runs `migrate deploy`.
 *
 * That is only safe because the migrations in this repo are idempotent
 * (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / guarded constraints),
 * so re-applying one that partially ran cannot damage existing data.
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const EXPECTED_TABLES = ["Company", "Job", "Note", "Resume", "Profile", "Application"];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  console.error('Run: DATABASE_URL="<your production url>" npm run db:recover');
  process.exit(1);
}

const prisma = new PrismaClient();

function prismaCli(args) {
  execFileSync("npx", ["prisma", ...args], { stdio: "inherit" });
}

try {
  const host = process.env.DATABASE_URL.replace(/\/\/[^@]*@/, "//<credentials>@");
  console.log(`Database: ${host}\n`);

  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
  `;
  const present = new Set(tables.map((t) => t.tablename));

  console.log("Tables");
  for (const name of EXPECTED_TABLES) {
    console.log(`  ${present.has(name) ? "present" : "MISSING"}  ${name}`);
  }

  if (!present.has("_prisma_migrations")) {
    console.log("\nNo migration history at all — nothing stuck. Just deploy:");
    console.log("  npx prisma migrate deploy");
    process.exit(0);
  }

  const history = await prisma.$queryRaw`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations" ORDER BY started_at
  `;

  console.log("\nMigration history");
  for (const m of history) {
    const state = m.rolled_back_at ? "rolled back" : m.finished_at ? "applied" : "FAILED";
    console.log(`  ${state.padEnd(11)} ${m.migration_name}`);
  }

  const failed = history.filter((m) => !m.finished_at && !m.rolled_back_at);

  if (!failed.length) {
    console.log("\nNothing is stuck. Applying any pending migrations…\n");
    await prisma.$disconnect();
    prismaCli(["migrate", "deploy"]);
    process.exit(0);
  }

  console.log(`\nClearing ${failed.length} failed migration(s):`);
  await prisma.$disconnect();

  for (const m of failed) {
    console.log(`  → ${m.migration_name}`);
    prismaCli(["migrate", "resolve", "--rolled-back", m.migration_name]);
  }

  console.log("\nRe-applying…\n");
  prismaCli(["migrate", "deploy"]);
  console.log("\nDone. Redeploy the app now.");
} catch (e) {
  console.error("\nRecovery failed:", e.message);
  process.exit(1);
} finally {
  await prisma.$disconnect().catch(() => {});
}
