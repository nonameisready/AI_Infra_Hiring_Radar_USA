import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [byTrack, freshAi, freshFde, companies, apps, lastSeen] = await Promise.all([
    prisma.job.groupBy({ by: ["track"], where: { active: true }, _count: { _all: true } }),
    prisma.job.count({ where: { active: true, track: "ai", postedAt: { gte: weekAgo } } }),
    prisma.job.count({ where: { active: true, track: "fde", postedAt: { gte: weekAgo } } }),
    prisma.company.count({ where: { disabled: false, atsKey: { not: null } } }),
    prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.job.aggregate({ _max: { lastSeenAt: true } }),
  ]);

  const trackCount = (t: string) => byTrack.find((r) => r.track === t)?._count._all ?? 0;

  return NextResponse.json({
    ai: { total: trackCount("ai"), fresh7d: freshAi },
    fde: { total: trackCount("fde"), fresh7d: freshFde },
    companies,
    applications: Object.fromEntries(apps.map((a) => [a.status, a._count._all])),
    lastRefreshedAt: lastSeen._max.lastSeenAt?.toISOString() ?? null,
  });
}
