"use client";

import { useRef, useState } from "react";
import { ResumeMeta, Track, TRACK_LABEL, api, formatBytes } from "../lib/client";

/**
 * The resume strip that sits above each tab's job list. Each tab keeps its own
 * resume, which is the whole point of having two tabs.
 */
export function ResumeBar({
  track,
  resumes,
  selectedId,
  onSelect,
  onChanged,
}: {
  track: Track;
  resumes: ResumeMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resumes tagged for this track first, then the ones marked "any".
  const relevant = resumes.filter((r) => r.track === track || r.track === "any");
  const selected = relevant.find((r) => r.id === selectedId) ?? relevant[0] ?? null;

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("track", track);
      form.set("label", file.name.replace(/\.[^.]+$/, ""));
      const { resume } = await api<{ resume: ResumeMeta }>("/api/resumes", {
        method: "POST",
        body: form,
      });
      onSelect(resume.id);
      onChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    await api(`/api/resumes/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="panel p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              selected ? (track === "fde" ? "text-violet-400" : "text-emerald-400") : "text-amber-400"
            } radar-ping`}
            style={{ background: "currentColor" }}
          />
          <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
            {TRACK_LABEL[track]} resume
          </span>
        </div>

        {relevant.length > 0 ? (
          <select
            className="input w-auto min-w-[200px] flex-1 sm:max-w-xs"
            value={selected?.id ?? ""}
            onChange={(e) => onSelect(e.target.value)}
          >
            {relevant.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} · {r.fileName} ({formatBytes(r.size)})
                {r.track === "any" ? " · shared" : ""}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-amber-300/90">
            No resume yet — upload one to enable one-click apply.
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selected && (
            <>
              <a className="btn btn-xs btn-ghost" href={`/api/resumes/${selected.id}`} target="_blank" rel="noreferrer">
                Preview
              </a>
              <button
                className="btn btn-xs btn-ghost"
                onClick={() => remove(selected.id)}
                title="Delete this resume"
              >
                Delete
              </button>
            </>
          )}
          <button className="btn btn-xs" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Uploading…" : "Upload resume"}
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      {selected && selected.applicationCount > 0 && (
        <p className="mt-2 text-xs text-[color:var(--muted)]">
          Used for {selected.applicationCount} application{selected.applicationCount === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
