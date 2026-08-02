import { RawJob, htmlToText, joinTeam, looksRemote } from "./types";

/**
 * Personio publishes an XML feed rather than JSON. It is a flat, predictable
 * document, so it is parsed with regex instead of pulling in an XML library for
 * one adapter.
 */
function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
}

export async function fetchPersonio(company: string): Promise<RawJob[]> {
  const res = await fetch(`https://${encodeURIComponent(company)}.jobs.personio.de/xml`, {
    headers: { accept: "application/xml,text/xml,*/*", "user-agent": "ai-hiring-radar/2.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  const xml = await res.text();
  const blocks = xml.match(/<position>[\s\S]*?<\/position>/gi) ?? [];

  return blocks.flatMap((b) => {
    const id = tag(b, "id");
    const title = tag(b, "name");
    if (!id || !title) return [];

    const office = tag(b, "office");
    const city = tag(b, "keywords");
    const location = office || city || null;
    const descriptions = (b.match(/<jobDescription>[\s\S]*?<\/jobDescription>/gi) ?? [])
      .map((d) => `${tag(d, "name") ?? ""} ${tag(d, "value") ?? ""}`)
      .join("\n");

    return [
      {
        source: "personio" as const,
        sourceJobId: `${company}:${id}`,
        title,
        location,
        remote: looksRemote(title, location),
        team: joinTeam(tag(b, "department"), tag(b, "subcompany")),
        url: `https://${company}.jobs.personio.de/job/${id}`,
        applyUrl: `https://${company}.jobs.personio.de/job/${id}#apply`,
        postedAt: tag(b, "createdAt") ? new Date(tag(b, "createdAt")!) : null,
        description: htmlToText(descriptions),
        atsBoardKey: company,
      },
    ];
  });
}
