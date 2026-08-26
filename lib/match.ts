import fs from "node:fs";
import path from "node:path";

/**
 * Jobright-style personal match score: how well a posting fits THIS candidate,
 * not just the track. Deterministic and cheap enough to compute per row at
 * query time, so no schema migration and it updates the moment the profile
 * does. The candidate picture comes from data/agent/profile.json (the same
 * file the apply agent maintains); a built-in fallback keeps the API working
 * if the file is missing from a deployment.
 *
 * Weights: skills coverage 45 · seniority fit 20 · track relevance 20 ·
 * location 15. Posts that demand citizenship or a security clearance are
 * capped low — the candidate needs sponsorship, so they are honest bad bets.
 */

export type MatchBreakdown = {
  skills: number;
  seniority: number;
  relevance: number;
  location: number;
  flags: string[];
};

type CandidateProfile = {
  skills: string[];
  yearsExperience: number;
  location: string;
  needsSponsor: boolean;
};

const FALLBACK: CandidateProfile = {
  skills: ["Python", "Go", "TypeScript", "SQL", "AWS", "Docker", "REST APIs", "Distributed systems"],
  yearsExperience: 7,
  location: "New York, NY",
  needsSponsor: true,
};

let cached: CandidateProfile | null = null;
function candidate(): CandidateProfile {
  if (cached) return cached;
  try {
    const p = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "agent", "profile.json"), "utf8"),
    );
    cached = {
      skills: Array.isArray(p.skills) && p.skills.length ? p.skills : FALLBACK.skills,
      yearsExperience: Number(p.yearsExperience) || FALLBACK.yearsExperience,
      location: p.location || FALLBACK.location,
      needsSponsor: p.needsSponsor ?? FALLBACK.needsSponsor,
    };
  } catch {
    cached = FALLBACK;
  }
  return cached;
}

/**
 * The tech vocabulary a job description can "ask for". Each entry maps a
 * canonical name to the regex that detects it in job text; candidate skills
 * are matched against the same canon (with aliases) so coverage is
 * two-sided: (tech the job mentions that the candidate has) / (tech the job
 * mentions at all).
 */
const TECH: Array<[string, RegExp]> = [
  ["python", /\bpython\b/i],
  ["go", /\bgo(lang)?\b/i],
  ["typescript", /\btypescript\b|\bts\b/i],
  ["javascript", /\bjavascript\b|\bnode(\.?js)?\b/i],
  ["java", /\bjava\b(?!script)/i],
  ["c++", /\bc\+\+\b/i],
  ["rust", /\brust\b/i],
  ["ruby", /\bruby\b|\brails\b/i],
  ["sql", /\bsql\b|\bpostgres(ql)?\b|\bmysql\b/i],
  ["nosql", /\bmongo(db)?\b|\bdynamodb\b|\bnosql\b|\bdocument( |-)based\b/i],
  ["spark", /\b(py)?spark\b/i],
  ["kafka", /\bkafka\b/i],
  ["queues", /\bmessage queue|rabbitmq|nats\b|\bsqs\b|\bpub\/?sub\b|celery/i],
  ["redis", /\bredis\b|\bcach(e|ing)\b/i],
  ["aws", /\baws\b|\bamazon web services\b/i],
  ["azure", /\bazure\b/i],
  ["gcp", /\bgcp\b|\bgoogle cloud\b/i],
  ["docker", /\bdocker\b|\bcontainer/i],
  ["kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["terraform", /\bterraform\b|\binfrastructure as code\b/i],
  ["ci/cd", /\bci\/?cd\b|\bgithub actions\b|\bjenkins\b/i],
  ["distributed systems", /\bdistributed system/i],
  ["microservices", /\bmicroservice/i],
  ["rest apis", /\brest(ful)? api|\bapi design\b|\bbackend service/i],
  ["graphql", /\bgraphql\b/i],
  ["grpc", /\bgrpc\b/i],
  ["react", /\breact\b/i],
  ["next.js", /\bnext\.?js\b/i],
  ["ml", /\bmachine learning\b|\bml\b|\bpytorch\b|\btensorflow\b/i],
  ["llm", /\bllms?\b|\blarge language model|\bgen(erative)? ?ai\b/i],
  ["rag", /\brag\b|retrieval[- ]augmented/i],
  ["vector db", /\bvector (db|database|store)|\bembedding/i],
  ["llm serving", /\bvllm\b|\bsglang\b|\binference (pipeline|serving)/i],
  ["agents", /\bagentic?\b|\bai agents?\b/i],
  ["data pipelines", /\bdata pipeline|\betl\b|\bhigh[- ]throughput/i],
  ["observability", /\bobservabilit|monitoring|datadog|grafana/i],
  ["reliability", /\breliabilit|\bsre\b|high[- ]availab/i],
  ["fintech", /\bfintech\b|financial (data|systems|applications)|\btrading\b|\bderivatives\b|\bpayments?\b/i],
];

const CANDIDATE_ALIASES: Record<string, RegExp> = {
  python: /python/i,
  go: /^go$|golang/i,
  typescript: /typescript/i,
  javascript: /typescript|javascript|next\.?js/i, // TS work covers JS asks
  sql: /sql|postgres/i,
  nosql: /vector databases|mongo/i,
  spark: /pyspark|spark/i,
  queues: /nats|celery|amps|message|queue/i,
  redis: /redis/i,
  aws: /aws/i,
  azure: /azure/i,
  docker: /docker/i,
  "ci/cd": /ci\/?cd|github actions/i,
  "distributed systems": /distributed/i,
  microservices: /microservice/i,
  "rest apis": /rest|api/i,
  react: /react|next\.?js|typescript/i,
  "next.js": /next\.?js/i,
  ml: /ml |mlflow|machine learning|llm/i,
  llm: /llm|rag/i,
  rag: /rag/i,
  "vector db": /vector/i,
  "llm serving": /vllm|sglang/i,
  agents: /agent/i,
  "data pipelines": /pipeline|throughput|etl|parallel/i,
  observability: /observabilit|reliability/i,
  reliability: /reliabilit/i,
  fintech: /financial|derivatives|trading|regulatory|stripe|billing/i,
};

function candidateHas(canon: string, skills: string[]): boolean {
  const alias = CANDIDATE_ALIASES[canon];
  if (!alias) return false;
  return skills.some((s) => alias.test(s));
}

export function computeMatch(job: {
  title: string;
  description?: string | null;
  seniority?: string | null;
  location?: string | null;
  remote?: boolean;
  usa?: boolean;
  score?: number;
}): { match: number; breakdown: MatchBreakdown } {
  const me = candidate();
  const text = `${job.title}\n${job.description ?? ""}`;
  const flags: string[] = [];

  // Skills coverage: of the tech this job mentions, how much do I have?
  const asked = TECH.filter(([, re]) => re.test(text)).map(([name]) => name);
  const have = asked.filter((name) => candidateHas(name, me.skills));
  const skills = asked.length === 0 ? 0.6 : have.length / asked.length;
  if (asked.length > 0 && skills < 0.4) flags.push("stack mismatch");

  // Seniority fit for a ~7-year senior engineer.
  const seniorityScore =
    { senior: 1.0, mid: 0.85, lead: 0.8, "staff+": 0.6, junior: 0.35 }[
      job.seniority ?? ""
    ] ?? 0.75;

  // Track relevance reuses the classifier's 0-100 score.
  const relevance = Math.min(Math.max((job.score ?? 50) / 100, 0), 1);

  // Location: remote or NYC is ideal; anywhere in the US works (willing to
  // relocate); outside the US is a long shot.
  const location = job.remote
    ? 1.0
    : /new york|nyc|brooklyn/i.test(job.location ?? "")
      ? 1.0
      : job.usa !== false
        ? 0.8
        : 0.3;

  let match = Math.round(100 * (0.45 * skills + 0.2 * seniorityScore + 0.2 * relevance + 0.15 * location));

  // A strong skills overlap cannot rescue a role that is the wrong shape:
  // an off-track posting or a junior req for a 7-year engineer stays capped.
  if (relevance < 0.4) {
    match = Math.min(match, 55);
    flags.push("off-track role");
  }
  if (seniorityScore <= 0.35) {
    match = Math.min(match, 55);
    flags.push("seniority mismatch");
  }

  // Honest caps: sponsorship-blocking requirements make high scores a lie.
  if (me.needsSponsor && /security clearance|us citizens? (only|required)|citizenship (is )?required|must be (a )?us citizen/i.test(text)) {
    match = Math.min(match, 40);
    flags.push("citizenship/clearance required");
  }
  if (/\bno sponsorship\b|unable to sponsor|cannot sponsor|not able to sponsor/i.test(text) && me.needsSponsor) {
    match = Math.min(match, 35);
    flags.push("no sponsorship");
  }

  return {
    match,
    breakdown: {
      skills: Math.round(skills * 100),
      seniority: Math.round(seniorityScore * 100),
      relevance: Math.round(relevance * 100),
      location: Math.round(location * 100),
      flags,
    },
  };
}
