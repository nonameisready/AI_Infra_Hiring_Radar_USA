export type Track = "ai" | "fde";

export type JobRow = {
  id: string;
  title: string;
  company: string;
  companyStarred: boolean;
  companyTags: string | null;
  location: string | null;
  remote: boolean;
  team: string | null;
  url: string;
  applyUrl: string | null;
  postedAt: string | null;
  seniority: string | null;
  matchedTypes: string[];
  score: number;
  match: number;
  matchBreakdown: {
    skills: number;
    seniority: number;
    relevance: number;
    location: number;
    flags: string[];
  };
  source: string;
  applyMethod: string;
  usa: boolean;
  snippet: string | null;
  application: {
    status: string;
    method: string;
    error: string | null;
    submittedAt: string | null;
  } | null;
};

export type ResumeMeta = {
  id: string;
  label: string;
  track: string;
  fileName: string;
  mimeType: string;
  size: number;
  isDefault: boolean;
  applicationCount: number;
  createdAt: string;
};

export type Profile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
  workAuth: string;
  needsSponsor: boolean;
  usAuthorized: boolean;
  gender: string;
  race: string;
  veteran: string;
  disability: string;
  coverLetter: string;
  customAnswers: string;
};

export type Stats = {
  ai: { total: number; fresh7d: number };
  fde: { total: number; fresh7d: number };
  companies: number;
  applications: Record<string, number>;
  lastRefreshedAt: string | null;
};

export type ApplyOutcome = {
  jobId: string;
  title: string;
  company: string;
  url: string;
  status: "submitted" | "queued" | "needs_manual" | "failed" | "skipped";
  method: string;
  message: string;
};

export type AgentPendingItem = {
  id: string;
  title: string;
  company: string;
  matchPercent: number | null;
  jobrightUrl: string | null;
  originalUrl: string | null;
  reason: string;
  status: "needs_manual" | "needs_info" | "manual_done";
  addedAt: string;
  resolvedAt?: string;
};

export type AgentQuestion = {
  id: string;
  question: string;
  field?: string;
  blocking?: boolean;
  askedAt?: string;
  answer?: string;
  answeredAt?: string;
};

export type AgentState = {
  config: {
    minMatchPercent?: number;
    dailyCap?: number;
    jobrightEmail?: string;
    runAtUtc?: string;
    runWindowsUtc?: string[];
  };
  stats: {
    total: number;
    byStatus: Record<string, number>;
    pending: number;
    openQuestions: number;
    lastRunAt: string | null;
  };
  pending: AgentPendingItem[];
  questions: { open: AgentQuestion[]; answered: AgentQuestion[] };
  appliedMd: string;
};

export type Filters = {
  q: string;
  days: number;
  remote: boolean;
  usa: boolean;
  starred: boolean;
  hideApplied: boolean;
  seniority: string[];
  types: string[];
  sort: "fresh" | "score" | "match" | "company";
};

export const DEFAULT_FILTERS: Filters = {
  q: "",
  // No date cut-off by default. A posting only stays in the list while it is
  // still live on the company's board, so an older one is still a real opening
  // — dating it out by default hid most of the roles for no good reason.
  days: 0,
  remote: false,
  usa: true,
  starred: false,
  hideApplied: true,
  seniority: [],
  types: [],
  sort: "fresh",
};

/** Human-readable list of the filters currently narrowing the results. */
export function activeFilterLabels(f: Filters): string[] {
  const out: string[] = [];
  if (f.q) out.push(`“${f.q}”`);
  if (f.days) out.push(`last ${f.days} days`);
  if (f.remote) out.push("remote only");
  if (f.usa) out.push("USA only");
  if (f.starred) out.push("priority companies");
  if (f.hideApplied) out.push("hiding applied");
  if (f.seniority.length) out.push(f.seniority.join("/"));
  if (f.types.length) out.push(f.types.join("/"));
  return out;
}

export function isDefaultFilters(f: Filters) {
  return (
    f.q === DEFAULT_FILTERS.q &&
    f.days === DEFAULT_FILTERS.days &&
    f.remote === DEFAULT_FILTERS.remote &&
    f.usa === DEFAULT_FILTERS.usa &&
    f.starred === DEFAULT_FILTERS.starred &&
    f.hideApplied === DEFAULT_FILTERS.hideApplied &&
    f.seniority.length === 0 &&
    f.types.length === 0
  );
}

export const PAGE_SIZE = 300;

export function jobsQuery(track: Track, f: Filters, offset = 0) {
  const sp = new URLSearchParams();
  sp.set("track", track);
  sp.set("limit", String(PAGE_SIZE));
  if (offset) sp.set("offset", String(offset));
  if (f.q) sp.set("q", f.q);
  if (f.days) sp.set("days", String(f.days));
  if (f.remote) sp.set("remote", "1");
  if (!f.usa) sp.set("usa", "0");
  if (f.starred) sp.set("starred", "1");
  if (f.hideApplied) sp.set("hideApplied", "1");
  f.seniority.forEach((s) => sp.append("seniority", s));
  f.types.forEach((t) => sp.append("type", t));
  sp.set("sort", f.sort);
  return sp.toString();
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  if (!res.ok) throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
  return json as T;
}

export function relativeDate(iso: string | null) {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 0) return "today";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const TRACK_LABEL: Record<Track, string> = {
  ai: "AI / Infra / Agentic",
  fde: "Forward Deployed",
};

export const TYPE_OPTIONS: Record<Track, Array<{ value: string; label: string }>> = {
  ai: [
    { value: "ai-infra", label: "AI infra" },
    { value: "ai-engineer", label: "AI engineer" },
    { value: "agentic", label: "Agentic" },
    { value: "ml", label: "ML" },
    { value: "infra", label: "Platform / SRE" },
    { value: "backend", label: "Backend" },
    { value: "swe", label: "Software eng" },
    { value: "data", label: "Data" },
  ],
  fde: [
    { value: "fde", label: "Forward deployed" },
    { value: "solutions", label: "Solutions / SE" },
  ],
};

export const SENIORITY_OPTIONS = [
  { value: "staff+", label: "Staff+" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "mid", label: "Mid" },
  { value: "junior", label: "Junior" },
];
