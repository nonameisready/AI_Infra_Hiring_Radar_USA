import { RawJob, htmlToText, looksRemote } from "./types";

/**
 * Google Careers.
 *
 * There is no public JSON API, but the results page is fully server-rendered:
 * every job card carries its id in ssk='N:<id>', the title in an h3, the
 * hiring company (Google, DeepMind, Fitbit, …), locations, a level chip and
 * the minimum-qualifications text. That is everything the classifier needs,
 * parsed straight out of the HTML.
 *
 * Board key is the location filter, e.g. "United States".
 */
const SEARCHES = ["machine learning", "artificial intelligence", "software engineer", "solutions architect"];

const PER_PAGE = 20; // fixed by the site

/** Paging depth per term. Actions raises this; the default fits Vercel's 60s. */
const MAX_PAGES = Math.max(1, Number(process.env.BIGTECH_MAX_PAGES ?? 3));

const BASE = "https://www.google.com/about/careers/applications/jobs/results/";

async function page(location: string, query: string, pageNo: number) {
  const url =
    `${BASE}?q=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}` +
    (pageNo > 1 ? `&page=${pageNo}` : "");
  const res = await fetch(url, {
    headers: {
      accept: "text/html",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

type Card = {
  id: string;
  title: string;
  company: string | null;
  locations: string[];
  level: string | null;
  quals: string | null;
};

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  // Cards are <li class="lLd3Je" ssk='N:<jobid>'> … </li>, in document order.
  const pieces = html.split(/<li class="lLd3Je" ssk='\d+:(\d+)'>/).slice(1);
  for (let i = 0; i + 1 < pieces.length; i += 2) {
    const id = pieces[i];
    const body = pieces[i + 1];
    const title = body.match(/<h3 class="QJPWVe">([^<]+)<\/h3>/)?.[1];
    if (!title) continue;

    const company = body.match(/corporate_fare<\/i><span>([^<]+)<\/span>/)?.[1] ?? null;
    const locations = [...body.matchAll(/<span class="r0wTof[^"]*">;?\s*([^<]+)<\/span>/g)]
      .map((m) => m[1].replace(/^;\s*/, "").trim())
      .filter(Boolean);
    const level = body.match(/<span class="wVSTAb">([^<]+)<\/span>/)?.[1] ?? null;
    const quals = body.match(/<h4>Minimum qualifications<\/h4><ul>([\s\S]*?)<\/ul>/)?.[1] ?? null;

    cards.push({ id, title, company, locations: [...new Set(locations)], level, quals });
  }
  return cards;
}

export async function fetchGoogleCareers(location: string): Promise<RawJob[]> {
  const byId = new Map<string, Card>();
  let anySucceeded = false;
  let lastError: unknown = null;

  await Promise.all(
    SEARCHES.map(async (query) => {
      try {
        for (let p = 1; p <= MAX_PAGES; p++) {
          const html = await page(location, query, p);
          anySucceeded = true;
          const cards = parseCards(html);
          for (const c of cards) byId.set(c.id, c);
          if (cards.length < PER_PAGE) break;
        }
      } catch (e) {
        lastError = e;
      }
    }),
  );

  if (!anySucceeded) throw lastError ?? new Error("Google careers returned nothing");

  return [...byId.values()].map((c) => {
    const loc = c.locations.join("; ") || null;
    // The level chip maps cleanly onto the seniority the title often omits.
    const levelHint =
      c.level === "Advanced" ? "Senior" : c.level === "Director" ? "Director" : null;
    return {
      source: "googlecareers" as const,
      sourceJobId: `${location}:${c.id}`,
      title: levelHint && !/senior|staff|principal|director|lead/i.test(c.title)
        ? `${levelHint} ${c.title}`
        : c.title,
      location: loc,
      remote: looksRemote(c.title, loc),
      team: c.company && c.company !== "Google" ? c.company : null,
      url: `${BASE}${c.id}`,
      applyUrl: `${BASE}${c.id}`,
      postedAt: null, // the cards carry no dates
      description: htmlToText(c.quals),
      atsBoardKey: location,
    };
  });
}
