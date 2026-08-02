"use client";

import { Filters, SENIORITY_OPTIONS, TYPE_OPTIONS, Track } from "../lib/client";

const DAY_OPTIONS = [
  { value: 3, label: "3d" },
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 0, label: "All" },
];

export function FiltersBar({
  track,
  filters,
  onChange,
  count,
  total,
}: {
  track: Track;
  filters: Filters;
  onChange: (next: Filters) => void;
  count: number;
  total: number;
}) {
  const onChip = track === "fde" ? "chip-on-fde" : "chip-on";
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <input
            className="input pl-8"
            placeholder="Search title, company, location, description…"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
          />
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[color:var(--muted)]">
            ⌕
          </span>
        </div>

        <select
          className="input w-auto"
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as Filters["sort"] })}
          aria-label="Sort order"
        >
          <option value="fresh">Newest first</option>
          <option value="score">Best match</option>
          <option value="company">By company</option>
        </select>

        <span className="whitespace-nowrap text-xs text-[color:var(--muted)]">
          {count >= total ? `${total} roles` : `showing ${count} of ${total}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
          Posted
        </span>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d.value}
            className={`chip ${filters.days === d.value ? onChip : ""}`}
            onClick={() => set({ days: d.value })}
          >
            {d.label}
          </button>
        ))}

        <span className="mx-2 h-4 w-px bg-[color:var(--line)]" />

        <button
          className={`chip ${filters.remote ? onChip : ""}`}
          onClick={() => set({ remote: !filters.remote })}
        >
          Remote
        </button>
        <button
          className={`chip ${filters.usa ? onChip : ""}`}
          onClick={() => set({ usa: !filters.usa })}
        >
          USA only
        </button>
        <button
          className={`chip ${filters.starred ? onChip : ""}`}
          onClick={() => set({ starred: !filters.starred })}
        >
          ★ Priority cos
        </button>
        <button
          className={`chip ${filters.hideApplied ? onChip : ""}`}
          onClick={() => set({ hideApplied: !filters.hideApplied })}
        >
          Hide applied
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
          Level
        </span>
        {SENIORITY_OPTIONS.map((s) => (
          <button
            key={s.value}
            className={`chip ${filters.seniority.includes(s.value) ? onChip : ""}`}
            onClick={() => set({ seniority: toggleIn(filters.seniority, s.value) })}
          >
            {s.label}
          </button>
        ))}

        <span className="mx-2 h-4 w-px bg-[color:var(--line)]" />
        <span className="mr-1 text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
          Focus
        </span>
        {TYPE_OPTIONS[track].map((t) => (
          <button
            key={t.value}
            className={`chip ${filters.types.includes(t.value) ? onChip : ""}`}
            onClick={() => set({ types: toggleIn(filters.types, t.value) })}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
