import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";

export type JobRow = {
  id: string;
  title: string;
  company: string;
  companyStarred: boolean;
  companyTags: string | null;
  location: string | null;
  remote: boolean;
  team: string | null;
  url: string;
  applyUrl: string | null;
  postedAt: string | null;
  seniority: string | null;
  matchedTypes: string[];
  score: number;
  source: string;
  applyMethod: string;
  usa: boolean;
  snippet: string | null;
  application: {
    status: string;
    method: string;
    error: string | null;
    submittedAt: string | null;
  } | null;
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;

  const track = sp.get("track") === "fde" ? "fde" : "ai";
  const q = (sp.get("q") ?? "").trim();
  const days = Number(sp.get("days") ?? "0");
  const remoteOnly = sp.get("remote") === "1";
  const usaOnly = sp.get("usa") !== "0";
  const starredOnly = sp.get("starred") === "1";
  const hideApplied = sp.get("hideApplied") === "1";
  const seniority = sp.getAll("seniority").filter(Boolean);
  const types = sp.getAll("type").filter(Boolean);
  const sort = sp.get("sort") ?? "fresh";
  const take = Math.min(Math.max(Number(sp.get("limit") ?? 300), 1), 1000);
  const skip = Math.max(Number(sp.get("offset") ?? 0), 0);

  // Free-text search and role-type filters are both unions, so they go into
  // separate AND clauses instead of a single OR that would clobber the other.
  const and: Prisma.JobWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { team: { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
        { company: { name: { contains: q, mode: "insensitive" } } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (types.length) {
    and.push({ OR: types.map((t) => ({ matchedTypes: { contains: t } })) });
  }

  const where: Prisma.JobWhereInput = {
    track,
    active: true,
    ...(usaOnly ? { usa: true } : {}),
    ...(remoteOnly ? { remote: true } : {}),
    ...(seniority.length ? { seniority: { in: seniority } } : {}),
    ...(starredOnly ? { company: { starred: true } } : {}),
    ...(hideApplied ? { applications: { none: {} } } : {}),
    ...(days > 0
      ? { postedAt: { gte: new Date(Date.now() - days * 86_400_000) } }
      : {}),
    ...(and.length ? { AND: and } : {}),
  };

  const orderBy: Prisma.JobOrderByWithRelationInput[] =
    sort === "score"
      ? [{ score: "desc" }, { postedAt: "desc" }]
      : sort === "company"
        ? [{ company: { name: "asc" } }, { postedAt: "desc" }]
        : [{ postedAt: { sort: "desc", nulls: "last" } }, { score: "desc" }];

  // The total is what tells the UI whether there is another page to load.
  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy,
      take,
      skip,
      include: {
        company: { select: { name: true, starred: true, tags: true } },
        applications: {
          select: {
            status: true,
            method: true,
            error: true,
            submittedAt: true,
          },
        },
      },
    }),
  ]);

  const rows: JobRow[] = jobs.map((j) => {
    const app = j.applications[0];
    return {
      id: j.id,
      title: j.title,
      company: j.company.name,
      companyStarred: j.company.starred,
      companyTags: j.company.tags,
      location: j.location,
      remote: j.remote,
      team: j.team,
      url: j.url,
      applyUrl: j.applyUrl,
      postedAt: j.postedAt?.toISOString() ?? null,
      seniority: j.seniority,
      matchedTypes: (j.matchedTypes ?? "").split(",").filter(Boolean),
      score: j.score,
      source: j.source,
      applyMethod: j.applyMethod,
      usa: j.usa,
      snippet: j.description?.slice(0, 240) ?? null,
      application: app
        ? {
            status: app.status,
            method: app.method,
            error: app.error,
            submittedAt: app.submittedAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({
    jobs: rows,
    count: rows.length,
    total,
    offset: skip,
    hasMore: skip + rows.length < total,
  });
}
