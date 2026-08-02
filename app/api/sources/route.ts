import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { FETCHERS } from "../../../lib/ingest";
import { AtsType } from "../../../lib/ingest/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const companies = await prisma.company.findMany({
    orderBy: [{ starred: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      website: true,
      stage: true,
      tags: true,
      atsType: true,
      atsKey: true,
      starred: true,
      disabled: true,
      _count: { select: { jobs: true } },
    },
  });

  const perTrack = await prisma.job.groupBy({
    by: ["companyId", "track"],
    where: { active: true },
    _count: { _all: true },
  });

  const byCompany = new Map<string, { ai: number; fde: number }>();
  for (const row of perTrack) {
    const entry = byCompany.get(row.companyId) ?? { ai: 0, fde: 0 };
    if (row.track === "ai") entry.ai = row._count._all;
    if (row.track === "fde") entry.fde = row._count._all;
    byCompany.set(row.companyId, entry);
  }

  return NextResponse.json({
    companies: companies.map((c) => ({
      ...c,
      jobCount: c._count.jobs,
      _count: undefined,
      tracks: byCompany.get(c.id) ?? { ai: 0, fde: 0 },
    })),
  });
}

/** Add a board after checking it actually returns postings. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const atsType = String(body.atsType ?? "") as AtsType;
  const atsKey = String(body.atsKey ?? "").trim();
  const name = String(body.name ?? "").trim();

  if (!FETCHERS[atsType]) {
    return NextResponse.json(
      { error: `atsType must be one of ${Object.keys(FETCHERS).join(", ")}` },
      { status: 400 },
    );
  }
  if (!atsKey) return NextResponse.json({ error: "atsKey is required" }, { status: 400 });

  let probe: Awaited<ReturnType<(typeof FETCHERS)[AtsType]>>;
  try {
    probe = await FETCHERS[atsType](atsKey);
  } catch (e: any) {
    return NextResponse.json(
      { error: `That board did not respond: ${String(e?.message ?? e).slice(0, 200)}` },
      { status: 400 },
    );
  }
  if (!probe.length) {
    return NextResponse.json({ error: "That board returned no postings" }, { status: 400 });
  }

  const company = await prisma.company.upsert({
    where: { name: name || atsKey },
    create: {
      name: name || atsKey,
      website: String(body.website ?? "") || null,
      stage: String(body.stage ?? "") || null,
      tags: String(body.tags ?? "") || null,
      hq: "USA",
      atsType,
      atsKey,
      starred: Boolean(body.starred),
    },
    update: { atsType, atsKey, disabled: false },
    select: { id: true, name: true, atsType: true, atsKey: true },
  });

  return NextResponse.json({ ok: true, company, postings: probe.length }, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.starred === "boolean") data.starred = body.starred;
  if (typeof body.disabled === "boolean") data.disabled = body.disabled;

  const company = await prisma.company.update({
    where: { id: body.id },
    data,
    select: { id: true, starred: true, disabled: true },
  });
  return NextResponse.json({ ok: true, company });
}
