"use client";

import { useCallback, useMemo, useState } from "react";
import { AgentPendingItem, AgentState, api, relativeDate } from "../lib/client";

/**
 * The Jobright Agent tab. All state shown here is written by the daily agent
 * run (agent/RUNBOOK.md) into data/agent/*.json + APPLIED.md and committed —
 * this tab renders it, lets you answer the agent's questions, and organizes
 * everything the agent could not submit into action groups so a big backlog
 * collapses into a few batched moves instead of one-by-one work.
 *
 * On a read-only deployment (Vercel) the answer/done buttons cannot write the
 * files back, so they fall back to copying a message you paste to Claude —
 * the next run picks it up either way.
 */

type GroupDef = {
  id: string;
  title: string;
  hint: string;
  match: (item: AgentPendingItem) => boolean;
};

// Ordered: automation-eligible groups first, then quick manual wins, then the
// rest. An item lands in the first group that matches.
const GROUPS: GroupDef[] = [
  {
    id: "auto-next",
    title: "🤖 Queued for the agent — no action needed",
    hint: "Workday roles (automated flow ships in the next run window) and jobs already scheduled for the agent's next pass.",
    match: (i) =>
      i.status === "needs_info" ||
      /next (run )?window|ships in the next/i.test(i.reason),
  },
  {
    id: "local-replay",
    title: "💻 One command on your laptop clears these",
    hint: "Anti-bot / rate limits block the cloud IP, but the forms auto-fill. Run `node agent/local-replay.mjs --resume <your.pdf>` from your home network.",
    match: (i) => /local replay/i.test(i.reason),
  },
  {
    id: "linkedin",
    title: "🔵 LinkedIn Easy Apply — ~2 clicks each",
    hint: "Fastest in your own logged-in browser. Open all, then apply down the row of tabs.",
    match: (i) => /linkedin/i.test(i.reason),
  },
  {
    id: "policy",
    title: "✍️ Questions only you should answer",
    hint: "Skill self-ratings and AI-disclosure questions — the agent never inflates claims or impersonates a human.",
    match: (i) => /self-rate|impersonates a human|answer this one yourself|apply personally/i.test(i.reason),
  },
  {
    id: "manual",
    title: "🖐 Truly manual (account-gated portals)",
    hint: "Oracle / SuccessFactors / company-hosted portals that need a personal account. Sorted by match — start from the top, skip the tail.",
    match: () => true,
  },
];

export function AgentTab({
  state,
  onReload,
  notify,
}: {
  state: AgentState | null;
  onReload: () => void;
  notify: (tone: "ok" | "warn" | "err", text: string) => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["auto-next"]));
  // Marks that could not be persisted server-side live in this browser only,
  // so the list stays usable until the next agent run commits the real state.
  const [localDone, setLocalDone] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("agent-local-done") ?? "[]"));
    } catch {
      return new Set();
    }
  });

  const rememberLocally = useCallback((id: string) => {
    setLocalDone((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem("agent-local-done", JSON.stringify([...next]));
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  const copyForClaude = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        notify("ok", "Copied — paste it to Claude and the next run picks it up.");
      } catch {
        notify("warn", text);
      }
    },
    [notify],
  );

  const markDone = useCallback(
    async (item: AgentPendingItem) => {
      try {
        const res = await api<{ persisted?: boolean }>("/api/agent", {
          method: "POST",
          body: JSON.stringify({ action: "resolvePending", id: item.id }),
        });
        if (res.persisted) {
          notify("ok", `${item.company} marked as applied manually.`);
          onReload();
          return;
        }
      } catch {
        /* fall through to the local path */
      }
      rememberLocally(item.id);
      copyForClaude(
        `Jobright agent: I applied manually to "${item.title}" at ${item.company} (pending id: ${item.id}). Mark it manual_done and append it to APPLIED.md.`,
      );
    },
    [notify, onReload, rememberLocally, copyForClaude],
  );

  const answer = useCallback(
    async (id: string, question: string, text: string) => {
      if (!text.trim()) return;
      try {
        const res = await api<{ persisted?: boolean }>("/api/agent", {
          method: "POST",
          body: JSON.stringify({ action: "answerQuestion", id, answer: text.trim() }),
        });
        if (res.persisted) {
          notify("ok", "Answer saved — the agent remembers it from the next run on.");
          onReload();
          return;
        }
      } catch {
        /* fall through */
      }
      copyForClaude(`Jobright agent question ${id} ("${question.slice(0, 60)}…") — my answer: ${text.trim()}`);
    },
    [notify, onReload, copyForClaude],
  );

  const pendingItems = useMemo(
    () =>
      (state?.pending ?? []).filter(
        (i) => i.status !== "manual_done" && !localDone.has(i.id),
      ),
    [state, localDone],
  );

  const grouped = useMemo(() => {
    const buckets = GROUPS.map((g) => ({ def: g, items: [] as AgentPendingItem[] }));
    for (const item of pendingItems) {
      const bucket = buckets.find((b) => b.def.match(item))!;
      bucket.items.push(item);
    }
    for (const b of buckets) b.items.sort((a, z) => (z.matchPercent ?? 0) - (a.matchPercent ?? 0));
    return buckets.filter((b) => b.items.length > 0);
  }, [pendingItems]);

  const openAll = useCallback(
    (items: AgentPendingItem[]) => {
      const urls = items.map((i) => i.originalUrl ?? i.jobrightUrl).filter(Boolean) as string[];
      // Browsers block bulk window.open beyond a handful; warn honestly.
      urls.forEach((u) => window.open(u, "_blank"));
      if (urls.length > 5)
        notify("warn", "If only a few tabs opened, allow pop-ups for this site and click again.");
    },
    [notify],
  );

  if (!state) {
    return (
      <div className="panel p-6 text-sm text-[color:var(--muted)]">Loading the agent state…</div>
    );
  }

  const { stats, config } = state;
  const blockingOpen = state.questions.open.filter((q) => q.blocking);

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">🤖 Jobright auto-apply agent</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[color:var(--muted)]">
              Runs {config.runWindowsUtc?.length ?? 3}× daily as {config.jobrightEmail ?? "—"}:
              harvests every Jobright recommendation from the past week, applies to matches ≥
              {config.minMatchPercent ?? 80}% (up to {config.dailyCap ?? 50}/day) through the
              company&apos;s own ATS, never applies twice, and never guesses blocking answers.
              Confirmed submissions land in APPLIED.md below; everything it can&apos;t submit is
              grouped here by the fastest way to clear it.
            </p>
          </div>
          <div className="text-right text-xs text-[color:var(--muted)]">
            {stats.lastRunAt ? (
              <>Last run {relativeDate(stats.lastRunAt)}</>
            ) : (
              <>No runs yet</>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Handled total" value={stats.total} />
          <Stat label="Auto-submitted" value={(stats.byStatus["applied_direct"] ?? 0) + (stats.byStatus["applied_jobright"] ?? 0)} tone="ok" />
          <Stat label="You applied" value={stats.byStatus["manual_done"] ?? 0} tone="ok" />
          <Stat label="Waiting on you" value={pendingItems.length} tone={pendingItems.length ? "warn" : undefined} />
          <Stat label="Open questions" value={stats.openQuestions} tone={stats.openQuestions ? "warn" : undefined} />
        </div>
      </section>

      {blockingOpen.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-100">
          ⚠ The agent is blocked by {blockingOpen.length} required question
          {blockingOpen.length > 1 ? "s" : ""} — it won&apos;t guess on your behalf. Answer below.
        </div>
      )}

      {state.questions.open.length > 0 && (
        <section className="panel p-4">
          <h3 className="text-sm font-semibold">
            The agent needs your answer ({state.questions.open.length})
          </h3>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            Answer once — it goes into long-term memory (memory.json / profile.json) and every
            future form gets it automatically.
          </p>
          <ul className="mt-3 space-y-3">
            {state.questions.open.map((q) => (
              <QuestionRow key={q.id} q={q} onAnswer={answer} />
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-4">
        <h3 className="text-sm font-semibold">Needs you ({pendingItems.length})</h3>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Grouped by the fastest way to clear them — two of the groups need no action from you at
          all. Tick ✓ after applying and the agent never touches that job again.
        </p>
        {pendingItems.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            🎉 Backlog clear — everything the agent could apply to is applied.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {grouped.map(({ def, items }) => {
              const isCollapsed = collapsed.has(def.id);
              return (
                <div key={def.id} className="rounded-lg border border-[color:var(--line)]">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <button
                      className="flex-1 text-left text-sm font-medium"
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(def.id)) next.delete(def.id);
                          else next.add(def.id);
                          return next;
                        })
                      }
                    >
                      {isCollapsed ? "▸" : "▾"} {def.title}
                      <span className="ml-2 rounded-full bg-white/5 px-1.5 py-0.5 text-[11px] tabular-nums">
                        {items.length}
                      </span>
                    </button>
                    {def.id !== "auto-next" && items.length > 1 && (
                      <button className="btn btn-xs" onClick={() => openAll(items)}>
                        Open all ↗
                      </button>
                    )}
                  </div>
                  <p className="border-t border-[color:var(--line)] px-3 py-1.5 text-[11px] text-[color:var(--muted)]">
                    {def.hint}
                  </p>
                  {!isCollapsed && (
                    <ul className="space-y-2 p-2">
                      {items.map((item) => (
                        <PendingRow key={item.id} item={item} onDone={markDone} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Application log (APPLIED.md)</h3>
          <button className="btn btn-xs btn-ghost" onClick={() => setShowLog((s) => !s)}>
            {showLog ? "Collapse" : "Expand"}
          </button>
        </div>
        {showLog && (
          <pre className="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-relaxed">
            {state.appliedMd.trim() || "(no confirmed submissions yet)"}
          </pre>
        )}
      </section>
    </div>
  );
}

function PendingRow({
  item,
  onDone,
}: {
  item: AgentPendingItem;
  onDone: (item: AgentPendingItem) => void;
}) {
  return (
    <li className="panel-soft p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {item.title}
            {item.matchPercent != null && (
              <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300 tabular-nums">
                {item.matchPercent}%
              </span>
            )}
          </p>
          <p className="text-xs text-[color:var(--muted)]">
            {item.company} · added {relativeDate(item.addedAt)}
          </p>
          <p className="mt-1 text-xs text-amber-200/90">{item.reason}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.jobrightUrl && (
            <a className="btn btn-xs" href={item.jobrightUrl} target="_blank" rel="noreferrer">
              Jobright ↗
            </a>
          )}
          {item.originalUrl && (
            <a className="btn btn-xs" href={item.originalUrl} target="_blank" rel="noreferrer">
              Apply ↗
            </a>
          )}
          <button className="btn btn-xs btn-primary" onClick={() => onDone(item)}>
            ✓ Done
          </button>
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="panel-soft p-2.5">
      <p
        className={`text-lg font-semibold tabular-nums ${
          tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : ""
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] text-[color:var(--muted)]">{label}</p>
    </div>
  );
}

function QuestionRow({
  q,
  onAnswer,
}: {
  q: { id: string; question: string; blocking?: boolean };
  onAnswer: (id: string, question: string, text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <li className="panel-soft p-3">
      <p className="text-sm">
        {q.blocking && <span className="mr-1.5 text-amber-300">●</span>}
        {q.question}
      </p>
      <div className="mt-2 flex gap-2">
        <input
          className="input flex-1 rounded-md border border-[color:var(--line)] bg-black/20 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400/60"
          value={text}
          placeholder="Type your answer — the agent will remember it…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAnswer(q.id, q.question, text)}
        />
        <button className="btn btn-xs" onClick={() => onAnswer(q.id, q.question, text)}>
          Save
        </button>
      </div>
    </li>
  );
}
