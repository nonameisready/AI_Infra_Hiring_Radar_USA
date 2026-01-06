export type RoleType = "backend" | "infra" | "fde" | "platform" | "ai-infra" | "unknown";

const RULES: Array<[RoleType, RegExp[]]> = [
  ["fde", [/forward deployed/i, /forward-deployed/i, /deployment engineer/i, /field engineer/i, /solutions engineer/i]],
  ["ai-infra", [/gpu/i, /cuda/i, /inference/i, /training/i, /distributed/i, /kubernetes/i, /\bk8s\b/i, /\bray\b/i, /nccl/i, /pytorch/i, /triton/i]],
  ["infra", [/infrastructure/i, /platform/i, /sre/i, /reliability/i, /devops/i, /kubernetes/i, /observability/i]],
  ["backend", [/backend/i, /api/i, /distributed systems/i, /data platform/i, /pipeline/i, /storage/i]],
  ["platform", [/platform/i, /developer experience/i, /\bdx\b/i, /runtime/i]],
];

export function classifyRole(title: string, team?: string) {
  const text = `${title} ${team ?? ""}`.trim();
  const hits: RoleType[] = [];
  for (const [t, regs] of RULES) {
    if (regs.some((r) => r.test(text))) hits.push(t);
  }
  return hits.length ? Array.from(new Set(hits)) : ["unknown"];
}

export function inferSeniority(title: string) {
  const t = title.toLowerCase();
  if (/(intern)/.test(t)) return "intern";
  if (/(junior|entry)/.test(t)) return "junior";
  if (/(staff|principal|distinguished)/.test(t)) return "staff+";
  if (/(senior)/.test(t)) return "senior";
  if (/(lead)/.test(t)) return "lead";
  return "mid";
}

export function isSeniorStaff(title: string) {
  const s = inferSeniority(title);
  return s === "senior" || s === "staff+" || s === "lead";
}
