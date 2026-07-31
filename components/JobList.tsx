"use client";

import { Badge, Tone } from "./Badge";
import { JobRow, Track, relativeDate } from "../lib/client";

const STATUS_TONE: Record<string, Tone> = {
  submitted: "ai",
  queued: "info",
  opened: "info",
  needs_manual: "warn",
  failed: "danger",
  skipped: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  queued: "Queued",
  opened: "Opened",
  needs_manual: "Apply manually",
  failed: "Failed",
  skipped: "Skipped",
};

const METHOD_HINT: Record<string, string> = {
  greenhouse_api: "Submits directly through the Greenhouse API",
  lever_api: "Submits directly through the Lever API",
  assisted: "Filled by the browser worker or the extension",
};

function ScoreDot({ score }: { score: number }) {
  const tone = score >= 55 ? "bg-emerald-400" : score >= 35 ? "bg-emerald-500/60" : "bg-zinc-600";
  return (
    <span
      title={`Match score ${score}`}
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${tone}`}
    />
  );
}

export function JobList({
  jobs,
  track,
  selected,
  onToggle,
  onApply,
  onMarkApplied,
  busyIds,
  loading,
}: {
  jobs: JobRow[];
  track: Track;
  selected: Set<string>;
  onToggle: (id: string, shiftKey: boolean) => void;
  onApply: (job: JobRow) => void;
  onMarkApplied: (job: JobRow) => void;
  busyIds: Set<string>;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="panel h-[76px] animate-pulse opacity-40" />
        ))}
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <div className="panel p-10 text-center">
        <p className="text-sm text-[color:var(--muted)]">
          No roles match these filters.
        </p>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Try widening the date range, turning off “Hide applied”, or running a refresh.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {jobs.map((job) => {
        const isSelected = selected.has(job.id);
        const busy = busyIds.has(job.id);
        const app = job.application;

        return (
          <li
            key={job.id}
            className={`panel fade-up group p-3 transition-colors ${
              isSelected ? "border-emerald-500/40 bg-emerald-500/[0.04]" : "hover:border-[#2f3545]"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                // onClick carries the shift key for range-select; onChange is a
                // no-op so React still treats the box as controlled.
                onChange={() => {}}
                onClick={(e) => onToggle(job.id, e.shiftKey)}
                aria-label={`Select ${job.title}`}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <ScoreDot score={job.score} />
                  <a
                    href={job.applyUrl ?? job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-medium text-[color:var(--text)] hover:text-emerald-300 hover:underline"
                  >
                    {job.title}
                  </a>
                  {job.companyStarred && (
                    <span title="Priority company" className="text-xs text-amber-400">
                      ★
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--muted)]">
                  <span className="font-medium text-[color:var(--text)]/80">{job.company}</span>
                  <span aria-hidden>·</span>
                  <span>{job.location ?? "Location not listed"}</span>
                  {job.remote && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-emerald-400/80">Remote</span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span title={job.postedAt ?? undefined}>{relativeDate(job.postedAt)}</span>
                  {job.team && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{job.team}</span>
                    </>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {job.seniority && <span className="tag">{job.seniority}</span>}
                  {job.matchedTypes.slice(0, 4).map((t) => (
                    <Badge key={t} tone={track === "fde" ? "fde" : "ai"}>
                      {t}
                    </Badge>
                  ))}
                  <span className="tag" title={METHOD_HINT[job.applyMethod] ?? job.applyMethod}>
                    {job.source}
                  </span>
                  {app && (
                    <Badge tone={STATUS_TONE[app.status] ?? "neutral"} title={app.error ?? undefined}>
                      {STATUS_LABEL[app.status] ?? app.status}
                    </Badge>
                  )}
                </div>

                {app?.error && (
                  <p className="mt-2 line-clamp-2 text-xs text-rose-300/80">{app.error}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button
                  className={`btn btn-xs ${track === "fde" ? "btn-fde" : "btn-primary"}`}
                  disabled={busy}
                  onClick={() => onApply(job)}
                  title={METHOD_HINT[job.applyMethod] ?? "Apply"}
                >
                  {busy ? "…" : app?.status === "submitted" ? "Re-apply" : "Apply"}
                </button>
                <a
                  className="btn btn-xs btn-ghost"
                  href={job.applyUrl ?? job.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => onMarkApplied(job)}
                >
                  Open ↗
                </a>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
