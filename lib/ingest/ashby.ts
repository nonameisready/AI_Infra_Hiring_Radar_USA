import { RawJob, fetchJson, htmlToText, joinTeam, looksRemote } from "./types";

type AshbyJob = {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  department?: string;
  team?: string;
  employmentType?: string;
  isRemote?: boolean;
  publishedAt?: string;
  updatedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
};

/**
 * Ashby's public posting API. `includeCompensation` is requested because several
 * boards only return the full description alongside it.
 */
export async function fetchAshby(boardName: string): Promise<RawJob[]> {
  const data = await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}?includeCompensation=true`,
  );
  const jobs: AshbyJob[] = data?.jobs ?? [];

  return jobs.map((j) => {
    const location =
      j.location?.trim() ||
      j.secondaryLocations?.map((s) => s.location).filter(Boolean).join(", ") ||
      null;
    const team = joinTeam(j.department, j.team);
    return {
      source: "ashby" as const,
      sourceJobId: `${boardName}:${j.id}`,
      title: (j.title ?? "").trim(),
      location,
      remote: Boolean(j.isRemote) || looksRemote(j.title ?? "", location),
      team,
      url: j.jobUrl || `https://jobs.ashbyhq.com/${boardName}/${j.id}`,
      applyUrl: j.applyUrl || `https://jobs.ashbyhq.com/${boardName}/${j.id}/application`,
      postedAt: j.publishedAt ? new Date(j.publishedAt) : j.updatedAt ? new Date(j.updatedAt) : null,
      description: j.descriptionPlain?.slice(0, 6000) ?? htmlToText(j.descriptionHtml),
      atsBoardKey: boardName,
    };
  });
}
