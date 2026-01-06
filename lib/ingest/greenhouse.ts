import { classifyRole, inferSeniority, isSeniorStaff } from "../classify";

type GhJob = {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  departments?: { name?: string }[];
  created_at?: string;
};

export async function fetchGreenhouseJobs(boardToken: string) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Greenhouse fetch failed: ${res.status}`);
  const data = (await res.json()) as { jobs: GhJob[] };

  return data.jobs
    .map((j) => {
      const team = j.departments?.map((d) => d.name).filter(Boolean).join(", ") ?? undefined;
      const types = classifyRole(j.title, team);
      const postedAt = j.created_at ? new Date(j.created_at) : null;
      const loc = j.location?.name ?? "";
      const remote = /remote/i.test(loc) || /remote/i.test(j.title);

      return {
        source: "greenhouse",
        sourceJobId: String(j.id),
        title: j.title,
        location: loc || null,
        remote,
        team: team || null,
        url: j.absolute_url,
        postedAt,
        matchedTypes: types.join(","),
        seniority: inferSeniority(j.title),
      };
    })
    // Keep Senior/Staff/Lead only, but do NOT persist the flag in DB (schema doesn't include it)
    .filter((j) => isSeniorStaff(j.title));
}
