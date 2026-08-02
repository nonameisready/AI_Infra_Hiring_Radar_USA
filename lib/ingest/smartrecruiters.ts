import { RawJob, fetchJson, htmlToText, joinTeam, looksRemote } from "./types";

type SrPosting = {
  id: string;
  name: string;
  ref?: string;
  releasedDate?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    remote?: boolean;
    fullLocation?: string;
  };
  department?: { label?: string };
  function?: { label?: string };
  company?: { identifier?: string };
};

const PAGE = 100;

/** SmartRecruiters' public postings API. No key required. */
export async function fetchSmartRecruiters(companyId: string): Promise<RawJob[]> {
  const all: SrPosting[] = [];

  for (let offset = 0; offset <= 2000; offset += PAGE) {
    const data = await fetchJson(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?limit=${PAGE}&offset=${offset}`,
    );
    const batch: SrPosting[] = data?.content ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }

  return all.map((p) => {
    const loc = p.location;
    const location =
      loc?.fullLocation?.trim() ||
      [loc?.city, loc?.region, loc?.country?.toUpperCase()].filter(Boolean).join(", ") ||
      null;
    return {
      source: "smartrecruiters" as const,
      sourceJobId: `${companyId}:${p.id}`,
      title: (p.name ?? "").trim(),
      location,
      remote: Boolean(loc?.remote) || looksRemote(p.name ?? "", location),
      team: joinTeam(p.department?.label, p.function?.label),
      url: `https://jobs.smartrecruiters.com/${companyId}/${p.id}`,
      applyUrl: `https://jobs.smartrecruiters.com/${companyId}/${p.id}`,
      postedAt: p.releasedDate ? new Date(p.releasedDate) : null,
      description: null,
      atsBoardKey: companyId,
    };
  });
}
