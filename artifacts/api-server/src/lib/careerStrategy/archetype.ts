/**
 * Deterministic work-archetype classifier.
 *
 * PURE + DETERMINISTIC + SIDE-EFFECT FREE: no database, network, LLM, clock,
 * or random calls. Same answers always yield the same archetype.
 *
 * The five canonical archetypes describe a preferred APPROACH TO WORK, not a
 * person's identity, capability, or chances of success. This taxonomy is a
 * product classification for readable reports — it is NOT psychometrically
 * validated, and the classifier never claims otherwise.
 *
 * Scoring rules (documented, reviewable):
 * - Each question contributes at most 1.0 vote total, split equally among the
 *   student's SELECTED options. Selecting many options in one question cannot
 *   overwhelm single-select questions.
 * - Each option's share splits equally among its mapped archetypes. Almost
 *   every option maps to exactly one archetype; ambiguous or attitudinal
 *   options map to none rather than forcing a weak signal.
 * - q8 (drains/aversion) is excluded: elimination is handled by the strategy
 *   layer, not the identity classifier.
 * - q5/q12 attitude answers are excluded except q5's low-code tool
 *   preference, which names a concrete way of working.
 * - q13 free text contributes at most 1.0 total, split among keyword-matched
 *   archetypes. Matching is transparent substring search, documented below.
 * - Winner is the highest vote share; exact ties resolve in canonical order.
 * - Strength is the winner's vote share: Strong (>= 0.5), Moderate (>= 0.35),
 *   Emerging (below that). Zero total votes yields no archetype (null) so a
 *   degenerate assessment never fabricates an identity.
 */
import type { CareerSubmissionInput } from "@workspace/api-zod";

export const CANONICAL_ARCHETYPE_ORDER = [
  "practical-builder",
  "analytical-solver",
  "creative-designer",
  "people-connector",
  "entrepreneurial-operator",
] as const;

export type CanonicalArchetypeId = (typeof CANONICAL_ARCHETYPE_ORDER)[number];

export const CANONICAL_ARCHETYPE_NAMES: Record<CanonicalArchetypeId, string> = {
  "practical-builder": "The Practical Builder",
  "analytical-solver": "The Analytical Solver",
  "creative-designer": "The Creative Designer",
  "people-connector": "The People Connector",
  "entrepreneurial-operator": "The Entrepreneurial Operator",
};

export const CANONICAL_ARCHETYPE_DEFINITIONS: Record<CanonicalArchetypeId, string> = {
  "practical-builder":
    "You turn ideas into working solutions — learning by building, prototyping, and experimenting with tools to solve concrete problems.",
  "analytical-solver":
    "You understand problems before acting — investigating issues, analyzing information, and improving systems using evidence.",
  "creative-designer":
    "You imagine and shape better experiences — creating, designing, and improving how products and information feel to use.",
  "people-connector":
    "You achieve outcomes through people — communicating clearly, coordinating teams, and solving problems collaboratively.",
  "entrepreneurial-operator":
    "You turn opportunities into measurable outcomes — coordinating resources, improving operations, and using practical tools to get results.",
};

export type ArchetypeStrength = "Strong" | "Moderate" | "Emerging";

export interface ArchetypeResult {
  archetype: CanonicalArchetypeId;
  strength: ArchetypeStrength;
  /** Option labels (verbatim) that contributed most, for evidence display. */
  evidence: string[];
}

type Answers = CareerSubmissionInput["answers"];

// Per-question option label (lowercased fragment) -> archetype ids.
// Fragments must identify the specific option; review against QUESTIONS in
// artifacts/career-discovery/src/pages/CareerDiscovery.tsx when editing.
const OPTION_TABLES: Record<string, Record<string, CanonicalArchetypeId[]>> = {
  q1: {
    "building something cool": ["practical-builder"],
    "solving difficult problems": ["analytical-solver"],
    "making money early": ["entrepreneurial-operator"],
    "working with people": ["people-connector"],
    "creating or designing things": ["creative-designer"],
  },
  q2: {
    "builds/codes": ["practical-builder"],
    "managing everyone": ["people-connector"],
    "creative or design person": ["creative-designer"],
    "fixing problems last minute": ["analytical-solver"],
    "silent one doing their own focused work": ["analytical-solver"],
  },
  q3: {
    "tech / coding videos": ["practical-builder"],
    "editing, design, or content creation": ["creative-designer"],
    "learning random stuff online": ["analytical-solver"],
    "business or money content": ["entrepreneurial-operator"],
    "exploring ai tools": ["practical-builder"],
    "helping friends solve problems": ["people-connector"],
    "organizing and planning things": ["entrepreneurial-operator"],
  },
  q4: {
    "writing code or working with tools": ["practical-builder"],
    "talking to people or clients": ["people-connector"],
    "organizing data or systems": ["analytical-solver"],
    "creating visuals or content": ["creative-designer"],
    "researching and learning new things": ["analytical-solver"],
    "finding shortcuts or automating tasks": ["practical-builder"],
  },
  q5: {
    "actually enjoy it": ["practical-builder"],
    "low-code or no-code tools": ["entrepreneurial-operator"],
  },
  q6: {
    "trying things directly and breaking stuff": ["practical-builder"],
    "following structured steps or courses": ["analytical-solver"],
    "learning with a community or friends": ["people-connector"],
    "building real projects while learning": ["practical-builder"],
  },
  q7: {
    "startup chaos and fast growth": ["entrepreneurial-operator"],
    "team collaboration and meetings": ["people-connector"],
    "freelancing or running my own thing": ["entrepreneurial-operator"],
  },
  q9: {
    "earning a lot of money": ["entrepreneurial-operator"],
    "building something of my own": ["entrepreneurial-operator"],
  },
  q10: {
    "creating apps or websites": ["practical-builder"],
    "working with ai or automation tools": ["practical-builder"],
    "understanding business, money, or strategy": ["entrepreneurial-operator"],
    "design or content creation": ["creative-designer"],
    "managing people or projects": ["people-connector"],
    "working with data or solving analytical problems": ["analytical-solver"],
  },
  q11: {
    "financial freedom": ["entrepreneurial-operator"],
    "running my own business or venture": ["entrepreneurial-operator"],
  },
  q12: {},
};

const Q13_KEYWORDS: Record<string, CanonicalArchetypeId[]> = {
  build: ["practical-builder"],
  prototype: ["practical-builder"],
  tool: ["practical-builder"],
  code: ["practical-builder"],
  app: ["practical-builder"],
  data: ["analytical-solver"],
  analy: ["analytical-solver"],
  research: ["analytical-solver"],
  diagnos: ["analytical-solver"],
  evidence: ["analytical-solver"],
  design: ["creative-designer"],
  creat: ["creative-designer"],
  visual: ["creative-designer"],
  content: ["creative-designer"],
  art: ["creative-designer"],
  people: ["people-connector"],
  team: ["people-connector"],
  communicat: ["people-connector"],
  coordinat: ["people-connector"],
  business: ["entrepreneurial-operator"],
  startup: ["entrepreneurial-operator"],
  venture: ["entrepreneurial-operator"],
  money: ["entrepreneurial-operator"],
  operation: ["entrepreneurial-operator"],
};

function toLabels(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

interface Contribution {
  label: string;
  archetype: CanonicalArchetypeId;
  weight: number;
}

export function classifyArchetype(answers: Answers): ArchetypeResult | null {
  const record =
    answers && typeof answers === "object"
      ? (answers as Record<string, unknown>)
      : {};
  const votes: Record<CanonicalArchetypeId, number> = {
    "practical-builder": 0,
    "analytical-solver": 0,
    "creative-designer": 0,
    "people-connector": 0,
    "entrepreneurial-operator": 0,
  };
  const contributions: Contribution[] = [];

  for (const [questionId, table] of Object.entries(OPTION_TABLES)) {
    const labels = toLabels(record[questionId]).filter(
      (label) => label.trim().length > 0,
    );
    if (labels.length === 0) continue;
    const sharePerLabel = 1 / labels.length;
    for (const label of labels) {
      const text = label.toLowerCase();
      const matched = Object.entries(table).find(([fragment]) =>
        text.includes(fragment),
      );
      if (!matched) continue;
      const [, archetypes] = matched;
      const sharePerArchetype = sharePerLabel / archetypes.length;
      for (const archetype of archetypes) {
        votes[archetype] += sharePerArchetype;
        contributions.push({ label, archetype, weight: sharePerArchetype });
      }
    }
  }

  if (typeof record.q13 === "string" && record.q13.trim().length > 0) {
    const text = record.q13.toLowerCase();
    const matched = Object.entries(Q13_KEYWORDS).filter(([fragment]) =>
      text.includes(fragment),
    );
    const archetypes = [...new Set(matched.flatMap(([, ids]) => ids))];
    if (archetypes.length > 0) {
      const share = 1 / archetypes.length;
      for (const archetype of archetypes) {
        votes[archetype] += share;
        contributions.push({ label: record.q13, archetype, weight: share });
      }
    }
  }

  const total = CANONICAL_ARCHETYPE_ORDER.reduce((sum, id) => sum + votes[id], 0);
  if (total <= 0) return null;

  let winner: CanonicalArchetypeId = CANONICAL_ARCHETYPE_ORDER[0];
  for (const id of CANONICAL_ARCHETYPE_ORDER) {
    if (votes[id] > votes[winner]) winner = id;
  }
  const share = votes[winner] / total;
  const strength: ArchetypeStrength =
    share >= 0.5 ? "Strong" : share >= 0.35 ? "Moderate" : "Emerging";

  const evidence = contributions
    .filter((item) => item.archetype === winner)
    .sort(
      (a, b) => b.weight - a.weight || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
    )
    .slice(0, 3)
    .map((item) =>
      item.label.length > 120 ? `${item.label.slice(0, 117)}...` : item.label,
    );

  return { archetype: winner, strength, evidence };
}
