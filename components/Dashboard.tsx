"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiltersBar } from "./Filters";
import { JobList } from "./JobList";
import { ResumeBar } from "./ResumeBar";
import { SettingsDrawer } from "./SettingsDrawer";
import {
  ApplyOutcome,
  DEFAULT_FILTERS,
  Filters,
  JobRow,
  ResumeMeta,
  Stats,
  Track,
  api,
  jobsQuery,
  PAGE_SIZE,
  relativeDate,
} from "../lib/client";

const TABS: Array<{ id: Track; label: string; hint: string }> = [
  { id: "ai", label: "AI · Infra · Agentic", hint: "AI infra, AI engineer, agentic, software engineering" },
  { id: "fde", label: "Forward Deployed", hint: "FDE, solutions & customer-facing engineering" },
];

export function Dashboard() {
  const [track, setTrack] = useState<Track>("ai");
  const [filters, setFilters] = useState<Record<Track, Filters>>({
    ai: { ...DEFAULT_FILTERS },
    fde: { ...DEFAULT_FILTERS },
  });

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [matchTotal, setMatchTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [resumes, setResumes] = useState<ResumeMeta[]>([]);
  const [resumeByTrack, setResumeByTrack] = useState<Record<Track, string | null>>({
    ai: null,
    fde: null,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [results, setResults] = useState<ApplyOutcome[] | null>(null);

  const lastClickedIndex = useRef<number | null>(null);
  const activeFilters = filters[track];

  const notify = useCallback((tone: "ok" | "warn" | "err", text: string) => {
    setToast({ tone, text });
    setTimeout(() => setToast(null), 6000);
  }, []);

  const loadResumes = useCallback(async () => {
    const { resumes } = await api<{ resumes: ResumeMeta[] }>("/api/resumes");
    setResumes(resumes);
    setResumeByTrack((prev) => {
      const next = { ...prev };
      (["ai", "fde"] as Track[]).forEach((t) => {
        const stillThere = resumes.some((r) => r.id === next[t]);
        if (!stillThere) {
          next[t] =
            resumes.find((r) => r.track === t && r.isDefault)?.id ??
            resumes.find((r) => r.track === t)?.id ??
            resumes.find((r) => r.track === "any")?.id ??
            null;
        }
      });
      return next;
    });
  }, []);

  const loadStats = useCallback(async () => {
    setStats(await api<Stats>("/api/stats"));
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ jobs: JobRow[]; total: number }>(
        `/api/jobs?${jobsQuery(track, activeFilters)}`,
      );
      setJobs(res.jobs);
      setMatchTotal(res.total);
    } catch (e: any) {
      notify("err", `Could not load jobs: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [track, activeFilters, notify]);

  // Rows are fetched a page at a time; without this the list silently stopped
  // at the first page and looked like the whole result set.
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await api<{ jobs: JobRow[]; total: number }>(
        `/api/jobs?${jobsQuery(track, activeFilters, jobs.length)}`,
      );
      // Guard against a refresh landing between pages and duplicating rows.
      setJobs((prev) => {
        const seen = new Set(prev.map((j) => j.id));
        return [...prev, ...res.jobs.filter((j) => !seen.has(j.id))];
      });
      setMatchTotal(res.total);
    } catch (e: any) {
      notify("err", `Could not load more: ${e.message}`);
    } finally {
      setLoadingMore(false);
    }
  }, [track, activeFilters, jobs.length, notify]);

  useEffect(() => {
    loadResumes().catch(() => {});
    loadStats().catch(() => {});
  }, [loadResumes, loadStats]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(loadJobs, 220);
    return () => clearTimeout(t);
  }, [loadJobs]);

  useEffect(() => {
    setSelected(new Set());
    lastClickedIndex.current = null;
  }, [track]);

  const toggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const index = jobs.findIndex((j) => j.id === id);

        if (shiftKey && lastClickedIndex.current !== null && index >= 0) {
          const [from, to] = [lastClickedIndex.current, index].sort((a, b) => a - b);
          const selecting = !prev.has(id);
          for (let i = from; i <= to; i++) {
            if (selecting) next.add(jobs[i].id);
            else next.delete(jobs[i].id);
          }
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        lastClickedIndex.current = index;
        return next;
      });
    },
    [jobs],
  );

  const applyJobs = useCallback(
    async (jobIds: string[]) => {
      if (!jobIds.length) return;
      const resumeId = resumeByTrack[track];
      if (!resumeId) {
        notify("warn", "Upload a resume for this tab first.");
        return;
      }

      setBusyIds(new Set(jobIds));
      try {
        const res = await api<{ outcomes: ApplyOutcome[]; summary: Record<string, number> }>(
          "/api/apply",
          { method: "POST", body: JSON.stringify({ jobIds, resumeId }) },
        );

        setResults(res.outcomes);
        const parts = Object.entries(res.summary).map(([k, v]) => `${v} ${k.replace("_", " ")}`);
        const failed = res.outcomes.filter((o) => o.status === "failed");
        notify(failed.length ? "warn" : "ok", parts.join(" · ") || "Nothing to do");

        setSelected(new Set());
        await Promise.all([loadJobs(), loadStats()]);
      } catch (e: any) {
        notify("err", e.message);
      } finally {
        setBusyIds(new Set());
      }
    },
    [resumeByTrack, track, notify, loadJobs, loadStats],
  );

  const markOpened = useCallback(async (job: JobRow) => {
    // Opening the posting in a new tab counts as "I looked at this one".
    if (job.application) return;
    await api("/api/applications", {
      method: "PATCH",
      body: JSON.stringify({ jobId: job.id, status: "opened" }),
    }).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    notify("ok", "Scanning every job board — this takes a minute…");
    try {
      const summary = await api<{ matched: number; created: number; failures: number }>(
        "/api/refresh",
        { method: "POST" },
      );
      notify(
        summary.failures ? "warn" : "ok",
        `${summary.created} new roles · ${summary.matched} matched${
          summary.failures ? ` · ${summary.failures} boards failed` : ""
        }`,
      );
      await Promise.all([loadJobs(), loadStats()]);
    } catch (e: any) {
      notify("err", `Refresh failed: ${e.message}`);
    } finally {
      setRefreshing(false);
    }
  }, [notify, loadJobs, loadStats]);

  const selectedJobs = useMemo(() => jobs.filter((j) => selected.has(j.id)), [jobs, selected]);
  const trackStats = stats?.[track];

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-32 pt-6 sm:px-6">
      <Header
        stats={stats}
        refreshing={refreshing}
        onRefresh={refresh}
        onSettings={() => setSettingsOpen(true)}
      />

      <nav className="mt-6 flex flex-wrap items-end gap-1 border-b border-[color:var(--line)]">
        {TABS.map((t) => {
          const on = track === t.id;
          const accent = t.id === "fde" ? "border-violet-400 text-violet-200" : "border-emerald-400 text-emerald-200";
          return (
            <button
              key={t.id}
              onClick={() => setTrack(t.id)}
              title={t.hint}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                on ? accent : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--text)]"
              }`}
            >
              {t.label}
              {stats && (
                <span className="ml-2 rounded-full bg-white/5 px-1.5 py-0.5 text-[11px] tabular-nums">
                  {stats[t.id].total}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 space-y-3">
        <ResumeBar
          track={track}
          resumes={resumes}
          selectedId={resumeByTrack[track]}
          onSelect={(id) => setResumeByTrack((p) => ({ ...p, [track]: id }))}
          onChanged={loadResumes}
        />

        <FiltersBar
          track={track}
          filters={activeFilters}
          onChange={(next) => setFilters((p) => ({ ...p, [track]: next }))}
          count={jobs.length}
          total={matchTotal}
          trackTotal={trackStats?.total ?? 0}
        />

        <JobList
          jobs={jobs}
          track={track}
          selected={selected}
          onToggle={toggleSelect}
          onApply={(job) => applyJobs([job.id])}
          onMarkApplied={markOpened}
          busyIds={busyIds}
          loading={loading}
          boardCount={stats?.companies ?? 0}
          trackTotal={trackStats?.total ?? 0}
        />

        {jobs.length < matchTotal && (
          <div className="flex flex-col items-center gap-2 py-2">
            <button className="btn" onClick={loadMore} disabled={loadingMore}>
              {loadingMore
                ? "Loading…"
                : `Load ${Math.min(PAGE_SIZE, matchTotal - jobs.length)} more`}
            </button>
            <span className="text-xs text-[color:var(--muted)]">
              Showing {jobs.length} of {matchTotal}
            </span>
          </div>
        )}
      </div>

      {selectedJobs.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--line)] bg-[color:var(--panel)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <span className="text-sm">
              <b className="tabular-nums">{selectedJobs.length}</b> selected
            </span>
            <button className="btn btn-xs btn-ghost" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => setSelected(new Set(jobs.map((j) => j.id)))}
            >
              Select all {jobs.length}
            </button>
            <span className="ml-auto text-xs text-[color:var(--muted)]">
              {resumes.find((r) => r.id === resumeByTrack[track])?.label ?? "No resume selected"}
            </span>
            <button
              className={`btn ${track === "fde" ? "btn-fde" : "btn-primary"}`}
              disabled={busyIds.size > 0}
              onClick={() => applyJobs(selectedJobs.map((j) => j.id))}
            >
              {busyIds.size > 0 ? "Applying…" : `⚡ Apply to ${selectedJobs.length}`}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-xl ${
            toast.tone === "err"
              ? "border-rose-500/50 bg-rose-950/90 text-rose-100"
              : toast.tone === "warn"
                ? "border-amber-500/50 bg-amber-950/90 text-amber-100"
                : "border-emerald-500/50 bg-emerald-950/90 text-emerald-100"
          }`}
        >
          {toast.text}
        </div>
      )}

      {results && <ResultsModal outcomes={results} onClose={() => setResults(null)} />}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        resumes={resumes}
        onResumesChanged={loadResumes}
      />
    </div>
  );
}

function Header({
  stats,
  refreshing,
  onRefresh,
  onSettings,
}: {
  stats: Stats | null;
  refreshing: boolean;
  onRefresh: () => void;
  onSettings: () => void;
}) {
  const queued = stats?.applications.queued ?? 0;
  const submitted = stats?.applications.submitted ?? 0;

  // The scan runs daily, so more than two days without one means the schedule
  // is broken. Say so rather than letting it look like a quiet hiring week.
  const stale = stats?.lastRefreshedAt
    ? Date.now() - new Date(stats.lastRefreshedAt).getTime() > 2 * 86_400_000
    : false;

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 text-emerald-400 radar-ping" />
          AI Hiring Radar
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {stats
            ? `${stats.ai.total + stats.fde.total} open roles across ${stats.companies} company boards · ${
                stats.ai.fresh7d + stats.fde.fresh7d
              } posted this week`
            : "Loading the radar…"}
        </p>
        {stats?.lastRefreshedAt && (
          <p className={`mt-0.5 text-xs ${stale ? "text-amber-300/90" : "text-[color:var(--muted)]"}`}>
            {stale && "⚠ "}
            Last scan {relativeDate(stats.lastRefreshedAt)}
            {stale && " — the daily scan may have stopped"}
            {queued > 0 && ` · ${queued} queued for the worker`}
            {submitted > 0 && ` · ${submitted} submitted`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button className="btn" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Scanning…" : "↻ Refresh jobs"}
        </button>
        <button className="btn" onClick={onSettings}>
          ⚙ Settings
        </button>
      </div>
    </header>
  );
}

function ResultsModal({ outcomes, onClose }: { outcomes: ApplyOutcome[]; onClose: () => void }) {
  const tone: Record<string, string> = {
    submitted: "text-emerald-300",
    queued: "text-sky-300",
    needs_manual: "text-amber-300",
    failed: "text-rose-300",
    skipped: "text-[color:var(--muted)]",
  };

  const manual = outcomes.filter((o) => o.status === "needs_manual" || o.status === "failed");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="panel relative max-h-[80vh] w-full max-w-2xl overflow-hidden">
        <header className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
          <h2 className="text-sm font-semibold">Apply results</h2>
          <button className="btn btn-xs btn-ghost" onClick={onClose}>
            Close ✕
          </button>
        </header>

        <div className="max-h-[55vh] overflow-y-auto p-4">
          <ul className="space-y-2">
            {outcomes.map((o) => (
              <li key={o.jobId} className="panel-soft p-2.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.title}</p>
                    <p className="text-xs text-[color:var(--muted)]">{o.company}</p>
                  </div>
                  <span className={`shrink-0 text-xs ${tone[o.status] ?? ""}`}>
                    {o.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--muted)]">{o.message}</p>
                {(o.status === "needs_manual" || o.status === "failed") && o.url && (
                  <a
                    className="btn btn-xs mt-2"
                    href={o.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open application ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        {manual.length > 0 && (
          <footer className="border-t border-[color:var(--line)] px-4 py-3">
            <button
              className="btn btn-xs"
              onClick={() => manual.forEach((o) => o.url && window.open(o.url, "_blank"))}
            >
              Open all {manual.length} that need you ↗
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
