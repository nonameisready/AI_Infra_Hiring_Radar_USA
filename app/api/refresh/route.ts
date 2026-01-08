import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { fetchGreenhouseJobsAll } from "../../../lib/ingest/greenhouse";
import { fetchLeverJobsAll } from "../../../lib/ingest/lever";


const prisma = new PrismaClient();

function authOK(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // if not set, allow local/dev
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

async function runRefresh() {
  // Only ingest companies that have atsType+atsKey
  const companies = await prisma.company.findMany({
    where: {
      atsType: { in: ["greenhouse", "lever"] },
      atsKey: { not: null },
      // Optional: allow you to disable a company in DB
      // disabled: { not: true },
    },
  });

  let totalUpserts = 0;
  const results: Array<{
    company: string;
    atsType: string | null;
    atsKey: string | null;
    fetched: number;
    upserts: number;
    ok: boolean;
    error?: string;
  }> = [];

  for (const c of companies) {
    // ✅ Optional hard-skip Crusoe without deleting row
    if ((c.name || "").toLowerCase().includes("crusoe")) {
      results.push({
        company: c.name,
        atsType: c.atsType,
        atsKey: c.atsKey,
        fetched: 0,
        upserts: 0,
        ok: true,
      });
      continue;
    }

    try {
      const jobs =
        c.atsType === "greenhouse"
          ? await fetchGreenhouseJobsAll(c.atsKey!)
          : await fetchLeverJobsAll(c.atsKey!);

      let companyUpserts = 0;

      // for (const j of jobs) {
      //   await prisma.job.upsert({
      //     where: {
      //       source_sourceJobId: { source: j.source, sourceJobId: j.sourceJobId },
      //     },
      //     create: { ...j, companyId: c.id },
      //     update: { ...j, companyId: c.id },
      //   });
      //   companyUpserts++;
      // }
      for (const j of jobs as any[]) {
        // Normalize ATS → your Job model
        const source = c.atsType ?? "unknown";

        // greenhouse: job.id, lever: job.id (usually string)
        const sourceJobId =
          j?.sourceJobId ??
          (j?.id != null ? String(j.id) : (j?.internal_job_id != null ? String(j.internal_job_id) : ""));

        if (!sourceJobId) {
          console.warn("Skipping job with no sourceJobId for", c.name, j);
          continue;
        }

        const title = String(j?.title ?? "").trim();
        if (!title) continue;

        const url =
          j?.url ??
          j?.absolute_url ??
          (source === "greenhouse" && c.atsKey
            ? `https://job-boards.greenhouse.io/${c.atsKey}/jobs/${sourceJobId}`
            : null);

        const location =
          (j?.location && typeof j.location === "object" ? j.location.name : j?.location) ??
          (j?.categories?.location ?? null) ??
          null;

        // greenhouse: first_published; lever: createdAt / created_at / created
        const postedAtRaw = j?.postedAt ?? j?.first_published ?? j?.createdAt ?? j?.created_at ?? j?.created;
        const postedAt = postedAtRaw ? new Date(postedAtRaw) : null;

        // try infer remote
        const remote =
          Boolean(j?.remote) ||
          /remote|anywhere|distributed/i.test(title) ||
          /remote/i.test(String(location ?? ""));

        // Optional: rough seniority flag
        const seniority =
          /(staff|principal|senior|lead|director|head|manager)\b/i.test(title) ? "senior" : null;

        const data = {
          // REQUIRED by your schema
          id: `${source}:${sourceJobId}`,
          updatedAt: new Date(),

          // REQUIRED-ish / model fields
          companyId: c.id,
          source,
          sourceJobId,
          title,
          location,
          remote,
          team: null as string | null,
          url: url ?? "",
          postedAt,
          matchedTypes: null as string | null,
          seniority,
        };

        await prisma.job.upsert({
          where: {
            source_sourceJobId: { source, sourceJobId },
          },
          create: data,
          update: data,
        });

        companyUpserts++;
      }


      totalUpserts += companyUpserts;

      results.push({
        company: c.name,
        atsType: c.atsType,
        atsKey: c.atsKey,
        fetched: jobs.length,
        upserts: companyUpserts,
        ok: true,
      });
    } catch (e: any) {
      console.error("Refresh failed for", c.name, e);
      results.push({
        company: c.name,
        atsType: c.atsType,
        atsKey: c.atsKey,
        fetched: 0,
        upserts: 0,
        ok: false,
        error: String(e?.message ?? e),
      });
      // ✅ keep going
      continue;
    }
  }

  return { companies: companies.length, totalUpserts, results };
}

export async function POST(req: Request) {
  if (!authOK(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const data = await runRefresh();
  return NextResponse.json({ ok: true, ...data });
}

// ✅ Vercel cron calls GET by default, so support it too
export async function GET(req: Request) {
  if (!authOK(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const data = await runRefresh();
  return NextResponse.json({ ok: true, ...data });
}


// import { NextResponse } from "next/server";
// import { PrismaClient } from "@prisma/client";
// import { fetchGreenhouseJobs } from "../../../lib/ingest/greenhouse";
// import { fetchLeverJobs } from "../../../lib/ingest/lever";

// const prisma = new PrismaClient();

// export async function POST(req: Request) {
//   const secret = process.env.CRON_SECRET;
//   const auth = req.headers.get("authorization") || "";
//   if (secret && auth !== `Bearer ${secret}`) {
//     return NextResponse.json({ error: "unauthorized" }, { status: 401 });
//   }

//   const companies = await prisma.company.findMany({
//     where: { atsType: { in: ["greenhouse", "lever"] }, atsKey: { not: null } },
//   });

//   let upserts = 0;
//   for (const c of companies) {
//     try {
//       const jobs =
//         c.atsType === "greenhouse"
//           ? await fetchGreenhouseJobs(c.atsKey!)
//           : await fetchLeverJobs(c.atsKey!);

//       for (const j of jobs) {
//         await prisma.job.upsert({
//           where: { source_sourceJobId: { source: j.source, sourceJobId: j.sourceJobId } },
//           create: { ...j, companyId: c.id },
//           update: { ...j, companyId: c.id },
//         });
//         upserts++;
//       }
//     } catch (e) {
//       console.error("Refresh failed for", c.name, e);
//     }
//   }

//   return NextResponse.json({ ok: true, companies: companies.length, upserts });
// }
