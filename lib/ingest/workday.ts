import { RawJob, looksRemote } from "./types";

/**
 * Workday.
 *
 * The board key encodes the three parts of a Workday careers site:
 *   tenant/host/site   e.g. "nvidia/wd5/NVIDIAExternalCareerSite"
 * which maps to https://{tenant}.{host}.myworkdayjobs.com/{site}
 *
 * Workday tenants are big — NVIDIA alone lists ~2,000 roles — so rather than
 * paging the whole board we push the filtering server-side with searchText and
 * only keep what could plausibly land in one of the two tabs.
 */
const SEARCHES = ["engineer", "forward deployed", "solutions architect", "machine learning"];

const PER_PAGE = 20;

/**
 * How deep to page each search term. The default keeps a full scan inside
 * Vercel's 60s function limit; the GitHub Actions scan has no such limit and
 * raises it via WORKDAY_MAX_PAGES to pull in the long tail.
 */
const MAX_PAGES_PER_SEARCH = Math.max(1, Number(process.env.WORKDAY_MAX_PAGES ?? 10));

type WdPosting = {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
};

export function parseWorkdayKey(key: string) {
  const [tenant, host, ...site] = key.split("/");
  return { tenant, host, site: site.join("/") };
}

/** Workday reports "Posted 19 Days Ago" rather than a date. */
function parsePostedOn(text?: string): Date | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const now = Date.now();
  if (t.includes("today")) return new Date(now);
  if (t.includes("yesterday")) return new Date(now - 86_400_000);
  const days = t.match(/(\d+)\+?\s*day/);
  if (days) return new Date(now - Number(days[1]) * 86_400_000);
  const months = t.match(/(\d+)\+?\s*month/);
  if (months) return new Date(now - Number(months[1]) * 30 * 86_400_000);
  return null;
}

/**
 * "4 Locations" is useless, but the job path carries one:
 * /job/US-CA-Santa-Clara/Manager--First-Time-Deployment_JR2021239
 */
function locationFrom(posting: WdPosting): string | null {
  const text = posting.locationsText?.trim();
  if (text && !/^\d+\s+locations?$/i.test(text)) return text;

  const seg = posting.externalPath?.split("/")[2];
  if (!seg) return null;
  const guess = seg.replace(/-/g, " ").trim();
  return guess && !/^\d/.test(guess) ? guess : null;
}

async function postJobs(base: string, searchText: string, offset: number) {
  const res = await fetch(`${base}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ appliedFacets: {}, limit: PER_PAGE, offset, searchText }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<{ total?: number; jobPostings?: WdPosting[] }>;
}

export async function fetchWorkday(boardKey: string): Promise<RawJob[]> {
  const { tenant, host, site } = parseWorkdayKey(boardKey);
  if (!tenant || !host || !site) throw new Error(`Malformed Workday key "${boardKey}"`);

  const base = `https://${tenant}.${host}.myworkdayjobs.com/wday/cxs/${tenant}/${site}`;
  const siteUrl = `https://${tenant}.${host}.myworkdayjobs.com/en-US/${site}`;
  const byPath = new Map<string, WdPosting>();
  let anySucceeded = false;
  let lastError: unknown = null;

  // The search terms are independent, so run them together — paging them one
  // after another is what pushed a full scan past the serverless time limit.
  await Promise.all(
    SEARCHES.map(async (searchText) => {
      try {
        for (let page = 0; page < MAX_PAGES_PER_SEARCH; page++) {
          const data = await postJobs(base, searchText, page * PER_PAGE);
          anySucceeded = true;
          const batch = data.jobPostings ?? [];
          for (const p of batch) if (p.externalPath) byPath.set(p.externalPath, p);
          if (batch.length < PER_PAGE) break;
        }
      } catch (e) {
        // One search term failing should not lose the others.
        lastError = e;
      }
    }),
  );

  if (!anySucceeded) throw lastError ?? new Error("Workday returned nothing");

  return [...byPath.values()].map((p) => {
    const location = locationFrom(p);
    const id = p.bulletFields?.[0] ?? p.externalPath;
    return {
      source: "workday" as const,
      sourceJobId: `${boardKey}:${id}`,
      title: (p.title ?? "").trim(),
      location,
      remote: looksRemote(p.title ?? "", location),
      team: null,
      url: `${siteUrl}${p.externalPath}`,
      applyUrl: `${siteUrl}${p.externalPath}/apply`,
      postedAt: parsePostedOn(p.postedOn),
      // Descriptions need one request per posting, which is thousands per scan.
      // Titles carry the signal the classifier weights most, so this trades a
      // little recall for a scan that finishes.
      description: null,
      atsBoardKey: boardKey,
    };
  });
}
