export type Track = "ai" | "fde";

export type RoleType =
  | "ai-infra"
  | "ai-engineer"
  | "agentic"
  | "swe"
  | "ml"
  | "infra"
  | "backend"
  | "data"
  | "fde"
  | "solutions"
  | "unknown";

/** Titles that are never engineering ICs, even when they contain matching keywords. */
const EXCLUDE_TITLE = [
  /\b(recruiter|recruiting|sourcer|talent)\b/i,
  /\b(accountant|payroll|controller|bookkeep)/i,
  /\b(sales development|sdr|bdr|account executive|quota)\b/i,
  /\b(paralegal|counsel|attorney)\b/i,
  /\b(executive assistant|office manager|facilities)\b/i,
  /\b(intern|internship|co-?op)\b/i,
  // Go-to-market and back-office roles whose descriptions are full of
  // "solutions engineer" and "AI platform" without being engineering jobs.
  /\b(marketing|marketer|brand|social media|public relations|content strategist)\b/i,
  /\b(business operations|bizops|strategy (and|&) operations)\b/i,
  /\b(go-?to-?market|gtm)\b/i,
  /\bsales\b(?!\s*(engineer|engineering))/i,
  /\banalyst\b/i,
  // Hardware / factory roles that match on the bare phrase "systems engineer".
  /\b(manufacturing|supplier quality|test technician|quality assurance technician)\b/i,
  // Internal IT, which matches "systems engineer" but is not the work here.
  /\b(it systems|help ?desk|desktop support|it support|corporate it)\b/i,
];

/** Signals for the "AI / Software Engineering" track. */
const AI_SIGNALS: Array<[RoleType, RegExp[], number]> = [
  [
    "agentic",
    [
      /\bagentic\b/i,
      /\bai agents?\b/i,
      /\bagent (platform|infra|framework|runtime|systems?)\b/i,
      /\btool[- ]use\b/i,
      /\bmulti-?agent\b/i,
      /\bcoding agents?\b/i,
    ],
    30,
  ],
  [
    "ai-infra",
    [
      /\bai infra(structure)?\b/i,
      /\bml infra(structure)?\b/i,
      /\bgpu\b/i,
      /\bcuda\b/i,
      /\binference\b/i,
      /\btraining (infra|platform|systems?)\b/i,
      /\bmodel serving\b/i,
      /\bnccl\b/i,
      /\btriton\b/i,
      /\bvllm\b/i,
      /\bkernels?\b/i,
      /\baccelerator/i,
      /\bdistributed training\b/i,
      /\bpre-?training\b/i,
    ],
    30,
  ],
  [
    "ai-engineer",
    [
      /\bai engineer\b/i,
      /\bllm\b/i,
      /\bgenerative ai\b/i,
      /\bgen-?ai\b/i,
      /\bapplied ai\b/i,
      /\bfoundation models?\b/i,
      /\bprompt engineer/i,
      /\brag\b/i,
      /\bretrieval[- ]augmented\b/i,
      /\bmember of technical staff\b/i,
    ],
    28,
  ],
  [
    "ml",
    [
      /\bmachine learning\b/i,
      /\bml engineer\b/i,
      /\bdeep learning\b/i,
      /\bpytorch\b/i,
      /\bjax\b/i,
      /\bmlops\b/i,
      /\brecommendations?\b|\brecsys\b/i,
      /\bcomputer vision\b/i,
      /\bnlp\b/i,
      /\bspeech\b/i,
    ],
    18,
  ],
  [
    "infra",
    [
      /\binfrastructure engineer\b/i,
      /\bplatform engineer\b/i,
      /\bsite reliability\b/i,
      /\bsre\b/i,
      /\bdevops\b/i,
      /\bkubernetes\b/i,
      /\bk8s\b/i,
      /\bobservability\b/i,
      /\bcompute platform\b/i,
      /\bcloud infrastructure\b/i,
    ],
    14,
  ],
  [
    "backend",
    [
      /\bbackend\b/i,
      /\bback-?end engineer\b/i,
      /\bdistributed systems\b/i,
      /\bapi engineer\b/i,
      /\bsystems engineer\b/i,
    ],
    10,
  ],
  [
    "data",
    [/\bdata engineer\b/i, /\bdata platform\b/i, /\bdata infrastructure\b/i, /\banalytics engineer\b/i],
    8,
  ],
  [
    "swe",
    [
      /\bsoftware engineer\b/i,
      /\bsoftware development engineer\b/i,
      /\bsde\b/i,
      /\bfull ?stack\b/i,
      /\bproduct engineer\b/i,
    ],
    12,
  ],
];

/** Signals for the "Forward Deployed" track. */
const FDE_SIGNALS: Array<[RoleType, RegExp[], number]> = [
  [
    "fde",
    [
      /\bforward[- ]deployed\b/i,
      /\bfde\b/i,
      /\bdeployment strateg/i,
      /\bdeployed engineer\b/i,
      /\bdeployment engineer\b/i,
      /\bfield engineer\b/i,
    ],
    40,
  ],
  [
    "solutions",
    [
      /\bsolutions? (architect|engineer|consultant)\b/i,
      /\bsolutions? architecture\b/i,
      /\bcustomer engineer\b/i,
      /\bimplementation engineer\b/i,
      /\bintegration engineer\b/i,
      /\btechnical account manager\b/i,
      /\bsales engineer\b/i,
      /\bprofessional services engineer\b/i,
      /\bapplied engineer\b/i,
      /\bpartner engineer\b/i,
      /\bdeveloper advocate\b/i,
      /\bdeveloper relations\b/i,
      /\bcustomer success engineer\b/i,
    ],
    22,
  ],
];

/** Title nouns that pin a posting to the FDE tab regardless of AI keywords. */
const EXPLICIT_FDE_TITLE =
  /\b(forward[- ]deployed|deployment engineer|deployed engineer|field engineer|solutions? (architect|engineer|consultant)|customer engineer|implementation engineer|sales engineer|professional services engineer|technical account manager|partner engineer|developer advocate|developer relations)\b/i;

/** Titles that read as engineering work, used to gate the description-only FDE path. */
const ENGINEERING_TITLE = /\b(engineer|engineering|architect|technical|consultant|developer)\b/i;

const SENIORITY_BONUS: Record<string, number> = {
  "staff+": 14,
  senior: 12,
  lead: 10,
  mid: 4,
  junior: 0,
  intern: -50,
};

/** US metros and markers used to decide whether a posting is USA-based. */
const US_HINTS =
  /\b(usa|u\.s\.|united states|remote - us|us remote|san francisco|sf bay|bay area|palo alto|mountain view|menlo park|sunnyvale|santa clara|san jose|cupertino|redwood city|new york|nyc|brooklyn|boston|cambridge, ma|seattle|bellevue|redmond|austin|dallas|houston|denver|boulder|chicago|atlanta|miami|los angeles|san diego|santa monica|irvine|portland|salt lake|phoenix|pittsburgh|washington|arlington|reston|mclean|raleigh|durham|nashville|minneapolis|detroit|philadelphia|princeton|jersey city|el segundo|culver city|sacramento|san mateo|berkeley|oakland)\b/i;

const US_STATE_CODES =
  /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;

const NON_US =
  /\b(london|dublin|berlin|munich|paris|amsterdam|zurich|zürich|barcelona|madrid|lisbon|milan|stockholm|copenhagen|oslo|helsinki|warsaw|prague|bucharest|tel aviv|bangalore|bengaluru|hyderabad|mumbai|delhi|pune|chennai|singapore|tokyo|osaka|seoul|beijing|shanghai|shenzhen|hong kong|taipei|sydney|melbourne|auckland|toronto|vancouver|montreal|ottawa|waterloo|mexico city|são paulo|sao paulo|buenos aires|bogotá|bogota|lagos|nairobi|cairo|dubai|abu dhabi|riyadh|emea|apac|latam|united kingdom|germany|france|india|canada|australia|japan|korea|china|israel|netherlands|spain|italy|poland|brazil|switzerland|sweden|ireland)\b/i;

export function inferSeniority(title: string) {
  const t = title.toLowerCase();
  if (/\b(intern|internship|co-?op)\b/.test(t)) return "intern";
  if (/\b(junior|entry[- ]level|new grad|graduate|associate)\b/.test(t)) return "junior";
  if (/\b(staff|principal|distinguished|fellow|architect|director|head of|vp)\b/.test(t)) return "staff+";
  if (/\b(senior|sr\.?|snr)\b/.test(t)) return "senior";
  if (/\b(lead|manager|mgr)\b/.test(t)) return "lead";
  return "mid";
}

function scoreSignals(text: string, signals: Array<[RoleType, RegExp[], number]>) {
  const hits: RoleType[] = [];
  let score = 0;
  for (const [type, regs, weight] of signals) {
    const matches = regs.filter((r) => r.test(text)).length;
    if (matches > 0) {
      hits.push(type);
      // First match earns full weight, extras earn a diminishing bonus.
      score += weight + Math.min(matches - 1, 3) * 3;
    }
  }
  return { hits, score };
}

export function isUsaLocation(location?: string | null, remote?: boolean) {
  const loc = (location ?? "").trim();
  if (!loc) return true; // unknown → keep it, the user can filter
  if (US_HINTS.test(loc) || US_STATE_CODES.test(loc)) return true;
  if (NON_US.test(loc)) return false;
  if (remote && /\bremote\b/i.test(loc)) return true;
  return !/\b(emea|apac|europe|asia|international)\b/i.test(loc);
}

export type Classification = {
  track: Track | null;
  types: RoleType[];
  score: number;
  seniority: string;
};

/**
 * Decide which tab a posting belongs in and how strongly it matches.
 * Returns track = null for postings that belong in neither tab.
 */
export function classify(input: {
  title: string;
  team?: string | null;
  description?: string | null;
  location?: string | null;
  remote?: boolean;
}): Classification {
  const title = input.title ?? "";
  const seniority = inferSeniority(title);

  if (EXCLUDE_TITLE.some((r) => r.test(title))) {
    return { track: null, types: ["unknown"], score: 0, seniority };
  }

  // Title matches count for much more than description matches.
  const titleText = `${title} ${input.team ?? ""}`;
  const bodyText = (input.description ?? "").slice(0, 4000);

  const aiTitle = scoreSignals(titleText, AI_SIGNALS);
  const aiBody = scoreSignals(bodyText, AI_SIGNALS);
  const fdeTitle = scoreSignals(titleText, FDE_SIGNALS);
  const fdeBody = scoreSignals(bodyText, FDE_SIGNALS);

  const aiScore = aiTitle.score + Math.min(aiBody.score, 24) * 0.35;
  const fdeScore = fdeTitle.score + Math.min(fdeBody.score, 24) * 0.35;

  // These title nouns name a customer-facing role outright, so they decide the
  // track no matter how much AI vocabulary the rest of the posting carries —
  // "Solutions Architect, LLM Inference" belongs in the FDE tab.
  const isFde =
    EXPLICIT_FDE_TITLE.test(titleText) || (fdeTitle.score > 0 && fdeScore >= aiTitle.score * 0.8);

  let track: Track | null = null;
  let types: RoleType[] = [];
  let score = 0;

  if (isFde) {
    track = "fde";
    types = Array.from(new Set([...fdeTitle.hits, ...fdeBody.hits]));
    score = fdeScore;
  } else if (aiTitle.score > 0) {
    track = "ai";
    types = Array.from(new Set([...aiTitle.hits, ...aiBody.hits]));
    score = aiScore;
  } else if (fdeBody.score >= 40 && ENGINEERING_TITLE.test(title)) {
    // Description-only match: only trust it when the title is an engineering
    // title, otherwise every GTM req that mentions "solutions engineer" lands
    // in the tab.
    track = "fde";
    types = Array.from(new Set(fdeBody.hits));
    score = fdeScore;
  } else {
    return { track: null, types: ["unknown"], score: 0, seniority };
  }

  score += SENIORITY_BONUS[seniority] ?? 0;
  if (input.remote) score += 3;

  return {
    track,
    types: types.length ? types : ["unknown"],
    score: Math.max(0, Math.min(100, Math.round(score))),
    seniority,
  };
}

/** Freshness in days, or null when the posting has no date. */
export function ageInDays(postedAt?: Date | string | null) {
  if (!postedAt) return null;
  const t = new Date(postedAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}
