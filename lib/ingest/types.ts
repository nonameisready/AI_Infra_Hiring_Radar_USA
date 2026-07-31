export type AtsType = "greenhouse" | "lever" | "ashby";

/** Shape every ATS adapter normalizes to before classification + persistence. */
export type RawJob = {
  source: AtsType;
  sourceJobId: string;
  title: string;
  location: string | null;
  remote: boolean;
  team: string | null;
  url: string;
  applyUrl: string | null;
  postedAt: Date | null;
  description: string | null;
  atsBoardKey: string;
};

/** Strip HTML and decode the entities ATS APIs return, then truncate. */
export function htmlToText(html?: string | null, max = 6000) {
  if (!html) return null;
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, max) || null;
}

/** Join department + team without repeating a value ("Engineering · Engineering"). */
export function joinTeam(...parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of parts) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(value);
  }
  return kept.join(" · ") || null;
}

export function looksRemote(title: string, location?: string | null) {
  return /\bremote\b|\banywhere\b|\bdistributed\b/i.test(`${title} ${location ?? ""}`);
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * fetch with a timeout so one hung board cannot stall a whole refresh, plus
 * backoff for the 503s Greenhouse hands out when several boards are pulled at
 * once.
 */
export async function fetchJson(url: string, timeoutMs = 20_000, attempts = 4): Promise<any> {
  let lastError = "";

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      // 1s, 3s, 9s plus jitter. Ashby in particular throttles a burst of
      // boards hard, and retrying in lockstep just reproduces the burst.
      const backoff = 1000 * 3 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, backoff + Math.random() * 500));
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "ai-hiring-radar/2.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e: any) {
      lastError = String(e?.message ?? e);
      continue; // network error / timeout — worth another try
    }

    if (res.ok) return res.json();

    lastError = `${res.status} ${res.statusText}`;
    if (!RETRYABLE.has(res.status)) break;
  }

  throw new Error(lastError);
}
