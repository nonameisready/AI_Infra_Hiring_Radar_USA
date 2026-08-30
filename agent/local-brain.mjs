// Local answering brain: asks the user's own OpenAI-compatible model (Qwen via
// Ollama / LM Studio / vLLM on localhost) to turn unanswered form questions
// into finisher rules, using agent/KNOWLEDGE.md as its knowledge base.
// Zero cloud tokens. Used by agent/local-replay.mjs when LOCAL_BRAIN is on.
//
// Config (env):
//   QWEN_BASE_URL  e.g. http://localhost:11434/v1 (Ollama) or http://localhost:1234/v1 (LM Studio)
//                  — if unset, the common local ports are probed automatically.
//   QWEN_MODEL     model name as your server knows it (e.g. "qwen2.5:14b").
//                  — if unset, the first model the server lists is used.
import fs from "node:fs";
import path from "node:path";

const CANDIDATE_BASES = [
  process.env.QWEN_BASE_URL,
  "http://127.0.0.1:8080/v1", // user's llama.cpp/MLX server (Qwen3.5-35B-A3B-4bit)
  "http://localhost:11434/v1",
  "http://127.0.0.1:11434/v1",
  "http://localhost:1234/v1",
  "http://localhost:8000/v1",
].filter(Boolean);
const API_KEY = process.env.QWEN_API_KEY || "local";
const AUTH_HEADERS = { authorization: `Bearer ${API_KEY}` };

let resolved = null; // { base, model }

async function resolveServer() {
  if (resolved) return resolved;
  for (const base of CANDIDATE_BASES) {
    try {
      const r = await fetch(`${base}/models`, { headers: AUTH_HEADERS, signal: AbortSignal.timeout(2500) });
      if (!r.ok) continue;
      const j = await r.json();
      const model = process.env.QWEN_MODEL || j?.data?.[0]?.id;
      if (!model) continue;
      resolved = { base, model };
      console.log(`  🧠 local brain: ${model} @ ${base}`);
      return resolved;
    } catch { /* try next */ }
  }
  return null;
}

export async function brainAvailable() {
  return Boolean(await resolveServer());
}

async function chat(system, user, maxTokens = 1400) {
  const srv = await resolveServer();
  if (!srv) throw new Error("no local model reachable (set QWEN_BASE_URL)");
  const r = await fetch(`${srv.base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: srv.model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error(`local model HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

function knowledgeText(repo) {
  return fs.readFileSync(path.join(repo, "agent/KNOWLEDGE.md"), "utf8");
}

function extractJson(text) {
  // Qwen3 emits <think>…</think> reasoning blocks — strip them first,
  // then tolerate ```json fences and prose around the object
  text = text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("model returned no JSON object");
  return JSON.parse(m[0]);
}

/**
 * Turn unanswered questions into finisher rules.
 * @param repo   repo root path
 * @param job    { company, title }
 * @param missing array of question label strings the finisher could not answer
 * @returns {combos:[], texts:[]} — validated, possibly empty
 */
export async function answerQuestions(repo, job, missing) {
  const system = knowledgeText(repo) +
    "\nYou are the applicant's answering assistant. Follow the knowledge base exactly. " +
    "Output ONLY the strict JSON described under 'Output format for rule generation'.";
  const user =
    `Company: ${job.company}\nRole: ${job.title}\n` +
    `The form-filler could not answer these required questions (labels may be truncated):\n` +
    missing.map((q, i) => `${i + 1}. ${q}`).join("\n") +
    `\nProduce rules for ALL of them. For yes/no or option questions use combos ` +
    `(prefer = regex of the right option). For free-text use texts with the full answer written out. ` +
    `If a question demands a verifiable personal fact not in the knowledge base, SKIP it (no rule).`;
  const raw = await chat(system, user);
  const j = extractJson(raw);
  const combos = (Array.isArray(j.combos) ? j.combos : [])
    .filter((c) => c && typeof c.label === "string" && typeof c.prefer === "string")
    .map((c) => ({ label: c.label, prefer: c.prefer, ...(typeof c.type === "string" ? { type: c.type } : {}) }));
  const texts = (Array.isArray(j.texts) ? j.texts : [])
    .filter((t) => t && typeof t.label === "string" && typeof t.text === "string")
    .map((t) => ({ label: t.label, text: t.text }));
  // safety: drop rules whose regexes don't compile
  const ok = (re) => { try { new RegExp(re, "i"); return true; } catch { return false; } };
  return {
    combos: combos.filter((c) => ok(c.label) && ok(c.prefer)),
    texts: texts.filter((t) => ok(t.label)),
  };
}
