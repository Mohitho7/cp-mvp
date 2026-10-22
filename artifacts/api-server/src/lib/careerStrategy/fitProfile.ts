/**
 * Batch 2 — Deterministic normalization of the 13Q answers into fit signals.
 * (Saturation rework: per-question normalized shares.)
 *
 * PURE + DETERMINISTIC + TESTABLE: no LLM, database, or network calls.
 *
 * The answer model is categorical (option labels), so each question maps its
 * option labels to fit dimensions via lowercase keyword fragments. Tables are
 * scoped per question because the same word means different things in
 * different questions (e.g. "enjoy" in the coding-comfort question vs the
 * success-vision question).
 *
 * SCORING (shares, not raw counts): every answered question contributes a
 * total weight of 1.0, split equally among its selected labels; each label's
 * share splits equally among the dimensions it matches. Labels matching
 * nothing consume share without contributing (picking "Gaming" dilutes the
 * technical signal instead of inflating it). Each dimension score is its
 * accumulated share divided by the number of answered questions — i.e. the
 * share of the student's expressed answers pointing at that dimension.
 *
 * This matters because the old formula (raw matched-label counts divided by
 * 3) measured selection breadth, not preference strength: any student
 * selecting 3+ matching options saturated a dimension at 1.0, so broad
 * multi-select responders maxed 9 of 10 dimensions while focused
 * single-select responders scored lower on the same leanings. The normalized
 * form keeps relative order comparable across response styles, mirroring the
 * archetype classifier's per-question normalization.
 *
 * q8 ("what would drain you") is intentionally excluded: drains express
 * elimination, and the existing report already handles tensions. q13 free
 * text is treated as one more question unit (at most 1.0 total to split),
 * so a long essay cannot dominate the profile.
 */
import type { CareerSubmissionInput } from "@workspace/api-zod";
import { FIT_DIMENSIONS, type FitDimension, type StudentFitProfile } from "./types";

type Answers = CareerSubmissionInput["answers"];

type KeywordTable = Partial<Record<FitDimension, string[]>>;

const QUESTION_TABLES: Record<string, KeywordTable> = {
  q1: {
    technical: ["build", "solv", "cod"],
    execution: ["build"],
    analytical: ["solv", "problem"],
    business: ["money"],
    people: ["people"],
    communication: ["people"],
    creative: ["creat", "design"],
  },
  q2: {
    technical: ["build", "cod"],
    execution: ["build", "fix", "manag"],
    analytical: ["problem"],
    people: ["manag"],
    structure: ["manag"],
    creative: ["creative", "design"],
    autonomy: ["silent", "focused", "own"],
    product: ["manag"],
    business: ["manag"],
  },
  q3: {
    technical: ["tech", "cod", "ai", "tool"],
    creative: ["edit", "design", "content", "creation"],
    analytical: ["learn"],
    business: ["business", "money"],
    people: ["help", "friend"],
    structure: ["organiz", "plan"],
  },
  q4: {
    technical: ["code", "tool", "automat"],
    communication: ["talk", "client"],
    people: ["people", "client"],
    analytical: ["data", "research", "learn"],
    structure: ["organiz", "system"],
    creative: ["visual", "content", "creat"],
    execution: ["shortcut", "automat"],
    business: ["client"],
    product: ["client"],
  },
  q5: {
    technical: ["enjoy", "learn", "code"],
    execution: ["low-code", "no-code", "tool"],
    product: ["low-code", "no-code"],
  },
  q6: {
    execution: ["try", "break", "build", "project"],
    autonomy: ["directly"],
    structure: ["structured", "steps", "course"],
    people: ["community", "friends"],
    technical: ["build"],
  },
  q7: {
    autonomy: ["startup", "remote", "independent", "freelanc", "own"],
    product: ["startup", "growth"],
    business: ["growth", "freelanc", "running"],
    structure: ["stable", "corporate", "structure"],
    people: ["team", "collaboration", "meeting"],
    communication: ["team", "collaboration", "meeting"],
  },
  q9: {
    business: ["money", "earning"],
    autonomy: ["anywhere", "own", "free time"],
    product: ["building", "own"],
    structure: ["stable", "predictable"],
    execution: ["building"],
  },
  q10: {
    technical: ["app", "website", "ai", "automat", "tool"],
    product: ["creating", "app", "project", "strategy"],
    business: ["business", "money", "strategy", "managing"],
    creative: ["design", "content", "creation"],
    people: ["managing", "people"],
    execution: ["project"],
    structure: ["managing"],
    analytical: ["data", "analytical", "solving", "problem"],
  },
  q11: {
    structure: ["stable", "predictable"],
    business: ["financial", "freedom", "wealth", "running", "business", "venture"],
    autonomy: ["own", "flexible", "travel", "remote", "freedom"],
    product: ["business", "venture"],
  },
  q12: {
    analytical: ["learning", "constantly"],
    structure: ["stable", "mastering"],
  },
};

const Q13_TABLE: KeywordTable = {
  analytical: ["data", "analy", "research", "problem", "solv", "logic", "math"],
  technical: ["cod", "software", "app", "website", "ai", "automat", "tool", "tech", "program", "cloud", "cyber", "devops"],
  creative: ["design", "creat", "content", "video", "art", "ui", "ux", "draw", "music"],
  people: ["people", "team", "teach", "mentor", "help", "communit"],
  communication: ["communicat", "talk", "client", "present", "writ", "market", "sale"],
  structure: ["organiz", "plan", "manag", "system", "process", "test"],
  autonomy: ["startup", "freelanc", "remote", "own", "independent"],
  product: ["product", "startup", "build", "app", "venture", "user", "client", "lead", "manage", "roadmap", "feature"],
  business: ["business", "money", "startup", "financ", "entrepren", "market", "sale", "operation", "strategy"],
  execution: ["build", "project", "ship", "launch", "automat", "operation", "deliver"],
};

function emptyProfile(): StudentFitProfile {
  return {
    analytical: 0,
    technical: 0,
    creative: 0,
    people: 0,
    communication: 0,
    structure: 0,
    autonomy: 0,
    product: 0,
    business: 0,
    execution: 0,
  };
}

function matchedDimensions(label: string, table: KeywordTable): FitDimension[] {
  const text = label.toLowerCase();
  return FIT_DIMENSIONS.filter((dimension) => {
    const fragments = table[dimension];
    return fragments !== undefined && fragments.some((fragment) => text.includes(fragment));
  });
}

function toAnswerLabels(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

/**
 * Converts 13Q answers to a normalized 0..1 fit profile: each dimension's
 * score is the share of the student's expressed answers pointing at it.
 * Same input always yields the same output. Missing/null answers and
 * unmapped labels contribute nothing (unmapped labels dilute the shares).
 */
export function normalizeAnswers(answers: Answers): StudentFitProfile {
  const counts = emptyProfile();
  // Defensive: the DB column and API contract guarantee an object, but a
  // corrupt row must yield "insufficient context", never a TypeError that
  // burns worker retry attempts.
  const record =
    answers && typeof answers === "object"
      ? (answers as Record<string, unknown>)
      : {};

  let answered = 0;
  const addUnit = (table: KeywordTable, labels: string[]): void => {
    const selected = labels.filter(
      (label): label is string => typeof label === "string" && label.trim().length > 0,
    );
    if (selected.length === 0) return;
    answered += 1;
    const sharePerLabel = 1 / selected.length;
    for (const label of selected) {
      const matched = matchedDimensions(label, table);
      if (matched.length === 0) continue;
      const sharePerDimension = sharePerLabel / matched.length;
      for (const dimension of matched) {
        counts[dimension] += sharePerDimension;
      }
    }
  };

  for (const [questionId, table] of Object.entries(QUESTION_TABLES)) {
    addUnit(table, toAnswerLabels(record[questionId]));
  }

  // q13 free text counts as one more question unit.
  const q13 = typeof record.q13 === "string" ? record.q13 : "";
  if (q13.trim().length > 0) {
    addUnit(Q13_TABLE, [q13]);
  }

  const profile = emptyProfile();
  if (answered > 0) {
    for (const dimension of FIT_DIMENSIONS) {
      profile[dimension] = Math.min(1, counts[dimension] / answered);
    }
  }
  return profile;
}

/** Total recognized signal; near-zero means there is nothing to strategize on. */
export function totalFitSignal(profile: StudentFitProfile): number {
  return FIT_DIMENSIONS.reduce((sum, dimension) => sum + profile[dimension], 0);
}
