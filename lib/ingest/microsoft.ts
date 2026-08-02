import { RawJob, htmlToText, looksRemote } from "./types";

/**
 * Microsoft Careers — the search API behind jobs.careers.microsoft.com.
 *
 * Fair warning recorded at build time: this endpoint returned 503 from the
 * sandbox this adapter was written in, consistently, while working from
 * ordinary networks — it appears to filter by egress IP. The adapter is
 * defensive and a failure surfaces as one failed board in the scan summary,
 * never as bad data. Board key is the location filter, e.g. "United States".
 */
const SEARCHES = ["machine learning", "AI engineer", "solutions architect", "software engineer"];

const PER_PAGE = 20; // the API caps pgSz at 20

/** Paging depth per term. Actions raises this; the default fits Vercel's 60s. */
const MAX_PAGES = Math.max(1, Number(process.env.BIGTECH_MAX_PAGES ?? 3));

type MsJob = {
  jobId?: string;
  title?: string;
  postingDate?: string;
  properties?: {
    locations?: string[];
    primaryLocation?: string;
    description?: string;
    profession?: string;
    discipline?: string;
    workSiteFlexibility?: string;
  };
};

async function page(location: string, query: string, pageNo: number) {
  const url =
    `https://gcsservices.careers.microsoft.com/search/api/v1/search` +
    `?q=${encodeURIComponent(query)}&lc=${encodeURIComponent(location)}&l=en_us&pg=${pageNo}&pgSz=${PER_PAGE}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (ai-hiring-radar)",
      referer: "https://jobs.careers.microsoft.com/",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  const result = data?.operationResult?.result;
  if (!result || !Array.isArray(result.jobs)) {
    throw new Error("unexpected response shape from Microsoft careers");
  }
  return result as { totalJobs?: number; jobs: MsJob[] };
}

export async function fetchMicrosoft(location: string): Promise<RawJob[]> {
  const byId = new Map<string, MsJob>();
  let anySucceeded = false;
  let lastError: unknown = null;

  await Promise.all(
    SEARCHES.map(async (query) => {
      try {
        for (let p = 1; p <= MAX_PAGES; p++) {
          const result = await page(location, query, p);
          anySucceeded = true;
          for (const j of result.jobs) if (j.jobId) byId.set(j.jobId, j);
          if (result.jobs.length < PER_PAGE) break;
        }
      } catch (e) {
        lastError = e;
      }
    }),
  );

  if (!anySucceeded) throw lastError ?? new Error("Microsoft careers returned nothing");

  return [...byId.values()].map((j) => {
    const props = j.properties ?? {};
    const location_ =
      props.primaryLocation?.trim() || props.locations?.filter(Boolean).join("; ") || null;
    return {
      source: "microsoft" as const,
      sourceJobId: `${location}:${j.jobId}`,
      title: (j.title ?? "").trim(),
      location: location_,
      remote:
        /remote/i.test(props.workSiteFlexibility ?? "") || looksRemote(j.title ?? "", location_),
      team: props.profession || props.discipline || null,
      url: `https://jobs.careers.microsoft.com/global/en/job/${j.jobId}`,
      applyUrl: `https://jobs.careers.microsoft.com/global/en/job/${j.jobId}`,
      postedAt: j.postingDate ? new Date(j.postingDate) : null,
      description: htmlToText(props.description),
      atsBoardKey: location,
    };
  });
}
