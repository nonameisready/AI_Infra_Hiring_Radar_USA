import { RawJob, fetchJson, htmlToText, joinTeam, looksRemote } from "./types";

type GhJob = {
  id: number;
  internal_job_id?: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string }>;
  content?: string;
  updated_at?: string;
  first_published?: string;
};

/**
 * Greenhouse job board API. `content=true` returns the full description in one
 * call, which is what the classifier needs, so there is no per-job fetch.
 */
export async function fetchGreenhouse(boardToken: string): Promise<RawJob[]> {
  const data = await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
  );
  const jobs: GhJob[] = data?.jobs ?? [];

  return jobs.map((j) => {
    const location =
      j.location?.name?.trim() || j.offices?.map((o) => o.name).filter(Boolean).join(", ") || null;
    const team = joinTeam(...(j.departments ?? []).map((d) => d.name));
    const id = String(j.id);
    return {
      source: "greenhouse" as const,
      sourceJobId: `${boardToken}:${id}`,
      title: (j.title ?? "").trim(),
      location,
      remote: looksRemote(j.title ?? "", location),
      team,
      url: j.absolute_url || `https://job-boards.greenhouse.io/${boardToken}/jobs/${id}`,
      applyUrl: `https://job-boards.greenhouse.io/${boardToken}/jobs/${id}#app`,
      postedAt: j.first_published
        ? new Date(j.first_published)
        : j.updated_at
          ? new Date(j.updated_at)
          : null,
      description: htmlToText(j.content),
      atsBoardKey: boardToken,
    };
  });
}

/** The numeric Greenhouse job id, recovered from our namespaced sourceJobId. */
export function greenhouseJobId(sourceJobId: string) {
  return sourceJobId.includes(":") ? sourceJobId.split(":").pop()! : sourceJobId;
}
