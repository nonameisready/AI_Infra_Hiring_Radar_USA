import { RawJob, fetchJson, htmlToText, joinTeam, looksRemote } from "./types";

type RtOffer = {
  id: number;
  title: string;
  slug: string;
  city?: string;
  state_code?: string;
  country_code?: string;
  location?: string;
  remote?: boolean;
  department?: string;
  careers_url?: string;
  careers_apply_url?: string;
  published_at?: string;
  created_at?: string;
  description?: string;
  requirements?: string;
};

/** Recruitee's per-tenant public offers feed. No key required. */
export async function fetchRecruitee(company: string): Promise<RawJob[]> {
  const data = await fetchJson(`https://${encodeURIComponent(company)}.recruitee.com/api/offers/`);
  const offers: RtOffer[] = data?.offers ?? [];

  return offers.map((o) => {
    const location =
      o.location?.trim() ||
      [o.city, o.state_code, o.country_code?.toUpperCase()].filter(Boolean).join(", ") ||
      null;
    return {
      source: "recruitee" as const,
      sourceJobId: `${company}:${o.id}`,
      title: (o.title ?? "").trim(),
      location,
      remote: Boolean(o.remote) || looksRemote(o.title ?? "", location),
      team: joinTeam(o.department),
      url: o.careers_url || `https://${company}.recruitee.com/o/${o.slug}`,
      applyUrl: o.careers_apply_url || `https://${company}.recruitee.com/o/${o.slug}/c/new`,
      postedAt: o.published_at
        ? new Date(o.published_at)
        : o.created_at
          ? new Date(o.created_at)
          : null,
      description: htmlToText(`${o.description ?? ""} ${o.requirements ?? ""}`),
      atsBoardKey: company,
    };
  });
}
