import { RawJob, htmlToText, looksRemote } from "./types";

/**
 * Amazon Jobs — the public search JSON that amazon.jobs itself calls.
 * No credentials; the board key is the country filter, e.g. "USA".
 *
 * The board is enormous, so like Workday this pushes filtering server-side
 * with search terms aimed at the two tabs rather than paging everything.
 */
const SEARCHES = [
  "machine learning",
  "AI engineer",
  "solutions architect",
  "software development engineer AI",
  "generative AI",
];

const PER_PAGE = 100;

/** Paging depth per term. Actions raises this; the default fits Vercel's 60s. */
const MAX_PAGES = Math.max(1, Number(process.env.BIGTECH_MAX_PAGES ?? 3));

type AmzJob = {
  id_icims?: string;
  id?: string;
  title?: string;
  normalized_location?: string;
  location?: string;
  city?: string;
  state?: string;
  country_code?: string;
  job_path?: string;
  posted_date?: string;
  updated_time?: string;
  business_category?: string;
  job_category?: string;
  team?: { label?: string } | string;
  description?: string;
  description_short?: string;
  basic_qualifications?: string;
};

async function page(country: string, query: string, offset: number) {
  const url =
    `https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(query)}` +
    `&country=${encodeURIComponent(country)}&result_limit=${PER_PAGE}&offset=${offset}&sort=recent`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (ai-hiring-radar)" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<{ hits?: number; jobs?: AmzJob[] }>;
}

export async function fetchAmazon(country: string): Promise<RawJob[]> {
  const byId = new Map<string, AmzJob>();
  let anySucceeded = false;
  let lastError: unknown = null;

  await Promise.all(
    SEARCHES.map(async (query) => {
      try {
        for (let p = 0; p < MAX_PAGES; p++) {
          const data = await page(country, query, p * PER_PAGE);
          anySucceeded = true;
          const batch = data.jobs ?? [];
          for (const j of batch) {
            const id = j.id_icims ?? j.id;
            if (id) byId.set(String(id), j);
          }
          if (batch.length < PER_PAGE) break;
        }
      } catch (e) {
        lastError = e;
      }
    }),
  );

  if (!anySucceeded) throw lastError ?? new Error("amazon.jobs returned nothing");

  return [...byId.entries()].map(([id, j]) => {
    const location =
      j.normalized_location?.trim() ||
      [j.city, j.state, j.country_code].filter(Boolean).join(", ") ||
      j.location ||
      null;
    const team = typeof j.team === "object" ? j.team?.label : j.team;
    return {
      source: "amazon" as const,
      sourceJobId: `${country}:${id}`,
      title: (j.title ?? "").trim(),
      location,
      remote: looksRemote(j.title ?? "", location),
      team: j.business_category || j.job_category || team || null,
      url: `https://www.amazon.jobs${j.job_path ?? `/en/jobs/${id}`}`,
      applyUrl: `https://www.amazon.jobs${j.job_path ?? `/en/jobs/${id}`}`,
      // "March 12, 2026" parses directly.
      postedAt: j.posted_date ? new Date(j.posted_date) : null,
      description: htmlToText(
        `${j.description_short ?? j.description ?? ""}\n${j.basic_qualifications ?? ""}`,
      ),
      atsBoardKey: country,
    };
  });
}
