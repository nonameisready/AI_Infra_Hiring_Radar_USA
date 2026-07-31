import { RawJob, fetchJson, htmlToText, joinTeam, looksRemote } from "./types";

type LeverJob = {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  categories?: { team?: string; location?: string; department?: string; commitment?: string };
  descriptionPlain?: string;
  description?: string;
  lists?: Array<{ text?: string; content?: string }>;
  createdAt?: number;
  workplaceType?: string;
};

/** Lever postings API, paged 100 at a time. */
export async function fetchLever(siteKey: string): Promise<RawJob[]> {
  const all: LeverJob[] = [];
  const limit = 100;
  let offset = 0;

  while (offset <= 5000) {
    const batch = await fetchJson(
      `https://api.lever.co/v0/postings/${encodeURIComponent(siteKey)}?mode=json&limit=${limit}&skip=${offset}`,
    );
    if (!Array.isArray(batch)) throw new Error("Lever returned a non-array payload");
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return all.map((j) => {
    const location = j.categories?.location?.trim() || null;
    const team = joinTeam(j.categories?.team, j.categories?.department);
    const listText = (j.lists ?? [])
      .map((l) => `${l.text ?? ""} ${htmlToText(l.content, 2000) ?? ""}`)
      .join("\n");
    return {
      source: "lever" as const,
      sourceJobId: `${siteKey}:${j.id}`,
      title: (j.text ?? "").trim(),
      location,
      remote:
        /remote/i.test(j.workplaceType ?? "") || looksRemote(j.text ?? "", location),
      team,
      url: j.hostedUrl,
      applyUrl: j.applyUrl || `${j.hostedUrl}/apply`,
      postedAt: j.createdAt ? new Date(j.createdAt) : null,
      description: (j.descriptionPlain ?? htmlToText(j.description) ?? "") + "\n" + listText || null,
      atsBoardKey: siteKey,
    };
  });
}

/** The Lever posting id, recovered from our namespaced sourceJobId. */
export function leverPostingId(sourceJobId: string) {
  return sourceJobId.includes(":") ? sourceJobId.split(":").pop()! : sourceJobId;
}
