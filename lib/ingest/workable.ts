import { RawJob, fetchJson, htmlToText, joinTeam, looksRemote } from "./types";

type WkJob = {
  id?: string;
  shortcode: string;
  title: string;
  city?: string;
  state?: string;
  country?: string;
  location?: { city?: string; region?: string; country?: string; location_str?: string };
  department?: string | string[];
  telecommuting?: boolean;
  remote?: boolean;
  published_on?: string;
  created_at?: string;
  description?: string;
  application_url?: string;
  url?: string;
};

/** Workable's public embed API. No key required. */
export async function fetchWorkable(account: string): Promise<RawJob[]> {
  const data = await fetchJson(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`,
  );
  const jobs: WkJob[] = data?.jobs ?? [];

  return jobs.map((j) => {
    const location =
      j.location?.location_str?.trim() ||
      [j.city ?? j.location?.city, j.state ?? j.location?.region, j.country ?? j.location?.country]
        .filter(Boolean)
        .join(", ") ||
      null;
    const dept = Array.isArray(j.department) ? j.department.join(" · ") : j.department;
    return {
      source: "workable" as const,
      sourceJobId: `${account}:${j.shortcode}`,
      title: (j.title ?? "").trim(),
      location,
      remote: Boolean(j.telecommuting || j.remote) || looksRemote(j.title ?? "", location),
      team: joinTeam(dept),
      url: j.url || `https://apply.workable.com/${account}/j/${j.shortcode}/`,
      applyUrl: j.application_url || `https://apply.workable.com/${account}/j/${j.shortcode}/apply/`,
      postedAt: j.published_on
        ? new Date(j.published_on)
        : j.created_at
          ? new Date(j.created_at)
          : null,
      description: htmlToText(j.description),
      atsBoardKey: account,
    };
  });
}
