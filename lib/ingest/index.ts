import { prisma } from "../db";
import { classify, isUsaLocation } from "../classify";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import { fetchAshby } from "./ashby";
import { AtsType, RawJob } from "./types";
import { resolveApplyMethod } from "../apply/keys";

export type SourceResult = {
  company: string;
  atsType: string | null;
  atsKey: string | null;
  fetched: number;
  matched: number;
  created: number;
  updated: number;
  ok: boolean;
  error?: string;
};

export type RefreshSummary = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  companies: number;
  fetched: number;
  matched: number;
  created: number;
  updated: number;
  deactivated: number;
  failures: number;
  results: SourceResult[];
};

const FETCHERS: Record<AtsType, (key: string) => Promise<RawJob[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
};

/** Run `worker` over `items` with a bounded number in flight at once. */
async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await worker(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Pull every configured board, keep only postings that classify into a track,
 * and upsert them. Postings that vanish from a board are marked inactive rather
 * than deleted so the application history stays intact.
 */
export async function runRefresh(options: { companyIds?: string[] } = {}): Promise<RefreshSummary> {
  const startedAt = new Date();

  const companies = await prisma.company.findMany({
    where: {
      ...(options.companyIds?.length ? { id: { in: options.companyIds } } : {}),
      disabled: false,
      atsType: { in: ["greenhouse", "lever", "ashby"] },
      atsKey: { not: null },
    },
    orderBy: [{ starred: "desc" }, { name: "asc" }],
  });

  const seenJobIds = new Set<string>();

  const results = await mapPool(companies, 6, async (c): Promise<SourceResult> => {
    const base: SourceResult = {
      company: c.name,
      atsType: c.atsType,
      atsKey: c.atsKey,
      fetched: 0,
      matched: 0,
      created: 0,
      updated: 0,
      ok: true,
    };

    try {
      const fetcher = FETCHERS[c.atsType as AtsType];
      const raw = await fetcher(c.atsKey!);
      base.fetched = raw.length;

      for (const j of raw) {
        if (!j.title || !j.sourceJobId) continue;

        const cls = classify({
          title: j.title,
          team: j.team,
          description: j.description,
          location: j.location,
          remote: j.remote,
        });
        if (!cls.track) continue;

        base.matched++;

        const data = {
          companyId: c.id,
          source: j.source,
          sourceJobId: j.sourceJobId,
          title: j.title,
          location: j.location,
          remote: j.remote,
          team: j.team,
          url: j.url,
          applyUrl: j.applyUrl,
          postedAt: j.postedAt && !Number.isNaN(j.postedAt.getTime()) ? j.postedAt : null,
          description: j.description,
          track: cls.track,
          matchedTypes: cls.types.join(","),
          seniority: cls.seniority,
          score: cls.score,
          usa: isUsaLocation(j.location, j.remote),
          applyMethod: resolveApplyMethod(j.source, j.atsBoardKey),
          atsBoardKey: j.atsBoardKey,
          active: true,
          lastSeenAt: new Date(),
        };

        const existing = await prisma.job.findUnique({
          where: { source_sourceJobId: { source: j.source, sourceJobId: j.sourceJobId } },
          select: { id: true },
        });

        const saved = existing
          ? await prisma.job.update({ where: { id: existing.id }, data })
          : await prisma.job.create({ data: { ...data, firstSeenAt: new Date() } });

        seenJobIds.add(saved.id);
        if (existing) base.updated++;
        else base.created++;
      }

      return base;
    } catch (e: any) {
      return { ...base, ok: false, error: String(e?.message ?? e).slice(0, 300) };
    }
  });

  // Postings that disappeared from a successfully-fetched board are closed.
  const okCompanyIds = companies
    .filter((c, i) => results[i]?.ok)
    .map((c) => c.id);

  let deactivated = 0;
  if (okCompanyIds.length) {
    const res = await prisma.job.updateMany({
      where: {
        companyId: { in: okCompanyIds },
        active: true,
        id: { notIn: Array.from(seenJobIds) },
      },
      data: { active: false },
    });
    deactivated = res.count;
  }

  const finishedAt = new Date();
  const sum = (k: keyof SourceResult) =>
    results.reduce((acc, r) => acc + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    companies: companies.length,
    fetched: sum("fetched"),
    matched: sum("matched"),
    created: sum("created"),
    updated: sum("updated"),
    deactivated,
    failures: results.filter((r) => !r.ok).length,
    results: results.sort((a, b) => Number(a.ok) - Number(b.ok) || b.matched - a.matched),
  };
}
