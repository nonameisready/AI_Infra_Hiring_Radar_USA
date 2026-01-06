import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { fetchGreenhouseJobs } from "../../../lib/ingest/greenhouse";
import { fetchLeverJobs } from "../../../lib/ingest/lever";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const companies = await prisma.company.findMany({
    where: { atsType: { in: ["greenhouse", "lever"] }, atsKey: { not: null } },
  });

  let upserts = 0;
  for (const c of companies) {
    try {
      const jobs =
        c.atsType === "greenhouse"
          ? await fetchGreenhouseJobs(c.atsKey!)
          : await fetchLeverJobs(c.atsKey!);

      for (const j of jobs) {
        await prisma.job.upsert({
          where: { source_sourceJobId: { source: j.source, sourceJobId: j.sourceJobId } },
          create: { ...j, companyId: c.id },
          update: { ...j, companyId: c.id },
        });
        upserts++;
      }
    } catch (e) {
      console.error("Refresh failed for", c.name, e);
    }
  }

  return NextResponse.json({ ok: true, companies: companies.length, upserts });
}
