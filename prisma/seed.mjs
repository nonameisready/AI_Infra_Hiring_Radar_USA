import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";

const prisma = new PrismaClient();
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Every entry in data/companies.json was checked against the live ATS API — the
 * board token returns real postings. Add more from the Settings → Job boards
 * panel in the app, which verifies before saving.
 */
const companies = JSON.parse(readFileSync(path.join(here, "..", "data", "companies.json"), "utf8"));

async function main() {
  let created = 0;
  let updated = 0;

  for (const c of companies) {
    const existing = await prisma.company.findUnique({ where: { name: c.name } });
    const data = {
      name: c.name,
      website: c.website ?? null,
      hq: c.hq ?? "USA",
      stage: c.stage ?? null,
      tags: c.tags ?? null,
      atsType: c.atsType ?? null,
      atsKey: c.atsKey ?? null,
      starred: Boolean(c.starred),
    };

    if (existing) {
      await prisma.company.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.company.create({ data });
      created++;
    }
  }

  // The profile is a single row the whole app reads from.
  await prisma.profile.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });

  const byAts = companies.reduce((acc, c) => {
    acc[c.atsType] = (acc[c.atsType] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Seeded ${companies.length} company boards (${created} new, ${updated} updated)`);
  console.log(
    "  " +
      Object.entries(byAts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · "),
  );
  console.log("Next: npm run refresh");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
