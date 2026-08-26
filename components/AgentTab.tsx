"use client";

import { useCallback, useMemo, useState } from "react";
import { AgentPendingItem, AgentState, api, relativeDate } from "../lib/client";

/**
 * The Jobright Agent tab. All state shown here is written by the daily agent
 * run (agent/RUNBOOK.md) into data/agent/*.json + APPLIED.md and committed —
 * this tab renders it, lets you answer the agent's questions, and tracks the
 * jobs it could not submit so you can finish them by hand.
 *
 * On a read-only deployment (Vercel) the answer/done buttons cannot write the
 * files back, so they fall back to copying a message you paste to Claude —
 * the next run picks it up either way.
 */
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
        notify("ok", "Copied — paste it to Claude and the next run will pick it up.");
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
        `Jobright agent: 我已手动投递 "${item.title}" @ ${item.company} (pending id: ${item.id})，请标记 manual_done 并写入 APPLIED.md。`,
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
          notify("ok", "Answer saved — the agent will remember it from the next run.");
          onReload();
          return;
        }
      } catch {
        /* fall through */
      }
      copyForClaude(`Jobright agent question ${id}（${question.slice(0, 60)}…）我的回答：${text.trim()}`);
    },
    [notify, onReload, copyForClaude],
  );

  if (!state) {
    return (
      <div className="panel p-6 text-sm text-[color:var(--muted)]">
        Loading the agent state…
      </div>
    );
  }

  const { stats, config } = state;
  const pendingItems = state.pending.filter(
    (i) => i.status !== "manual_done" && !localDone.has(i.id),
  );
  const blockingOpen = state.questions.open.filter((q) => q.blocking);

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">🤖 Jobright auto-apply agent</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[color:var(--muted)]">
              每天自动登录 Jobright（{config.jobrightEmail ?? "—"}），取匹配度 ≥
              {config.minMatchPercent ?? 80}% 的推荐（每天最多 {config.dailyCap ?? 50} 个），先走
              Jobright 自己的投递，投不了的去原公司官网投；已投过的永不重复。成功的写进
              APPLIED.md，失败的留在下面等你手动投。运行记录由每天的 Claude 会话提交到仓库，
              部署后这里自动更新。
            </p>
          </div>
          <div className="text-right text-xs text-[color:var(--muted)]">
            {stats.lastRunAt ? (
              <>Last run {relativeDate(stats.lastRunAt)}</>
            ) : (
              <>No runs yet — 第一次运行前先回答下面的 blocking 问题</>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Handled total" value={stats.total} />
          <Stat label="Via Jobright" value={stats.byStatus["applied_jobright"] ?? 0} tone="ok" />
          <Stat label="Via company site" value={stats.byStatus["applied_direct"] ?? 0} tone="ok" />
          <Stat label="Waiting on you" value={stats.pending} tone={stats.pending ? "warn" : undefined} />
          <Stat label="Open questions" value={stats.openQuestions} tone={stats.openQuestions ? "warn" : undefined} />
        </div>
      </section>

      {blockingOpen.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-100">
          ⚠ Agent 被 {blockingOpen.length} 个必答问题挡住了 — 没有这些信息它不会替你乱猜着提交。先在下面回答。
        </div>
      )}

      {state.questions.open.length > 0 && (
        <section className="panel p-4">
          <h3 className="text-sm font-semibold">Agent 需要你回答 ({state.questions.open.length})</h3>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            回答一次，agent 记进长期记忆（memory.json / profile.json），以后同类表单问题自动填，不再问第二次。
          </p>
          <ul className="mt-3 space-y-3">
            {state.questions.open.map((q) => (
              <QuestionRow key={q.id} q={q} onAnswer={answer} />
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-4">
        <h3 className="text-sm font-semibold">
          需要手动投递 ({pendingItems.length})
        </h3>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Agent 投不出去的会留在这里（原因写在每行）。投完点 ✓，下次运行就不会再碰这个职位。
        </p>
        {pendingItems.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            🎉 没有积压 — agent 能投的都投了。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pendingItems.map((item) => (
              <li key={item.id} className="panel-soft p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {item.title}
                      {item.matchPercent != null && (
                        <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300 tabular-nums">
                          {item.matchPercent}% match
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
                        官网 ↗
                      </a>
                    )}
                    <button className="btn btn-xs btn-primary" onClick={() => markDone(item)}>
                      ✓ 已投
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">已投递日志 (APPLIED.md)</h3>
          <button className="btn btn-xs btn-ghost" onClick={() => setShowLog((s) => !s)}>
            {showLog ? "收起" : "展开"}
          </button>
        </div>
        {showLog && (
          <pre className="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-relaxed">
            {state.appliedMd.trim() || "（还没有成功投递的记录）"}
          </pre>
        )}
      </section>
    </div>
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
  const placeholder = useMemo(() => "写下答案，agent 会记住…", []);
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
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAnswer(q.id, q.question, text)}
        />
        <button className="btn btn-xs" onClick={() => onAnswer(q.id, q.question, text)}>
          保存
        </button>
      </div>
    </li>
  );
}
