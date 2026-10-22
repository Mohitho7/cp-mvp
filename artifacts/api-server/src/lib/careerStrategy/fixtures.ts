/**
 * Batch 2 — Reusable deterministic test fixtures.
 *
 * Clearly synthetic students (internal identifiers only, never real data, no
 * randomness). Answers reuse the production 13Q option labels.
 */
import type { CareerSubmissionInput } from "@workspace/api-zod";
import type { StudentContext } from "../studentContext";
import type { CareerDefinition } from "./types";

type Answers = CareerSubmissionInput["answers"];

export interface StrategyFixture {
  name: string;
  answers: Answers;
  context: StudentContext;
}

function baseContext(overrides: Partial<StudentContext> = {}): StudentContext {
  return {
    degree: "B.Tech Computer Science",
    graduationYear: 2027,
    availableHoursPerWeek: 10,
    ...overrides,
  };
}

const EMPTY_MULTI: string[] = [];

export const fixtureAnalyticalTechnical: StrategyFixture = {
  name: "analytical-technical-cse-20h",
  answers: {
    q1: "Solving difficult problems",
    q2: ["The person who builds/codes things", "The one fixing problems last minute"],
    q3: ["Watching tech / coding videos", "Exploring AI tools", "Learning random stuff online"],
    q4: ["Writing code or working with tools", "Organizing data or systems", "Researching and learning new things"],
    q5: "I actually enjoy it",
    q6: ["Trying things directly and breaking stuff", "Building real projects while learning"],
    q7: ["Stable corporate structure"],
    q8: ["Too much theory with no practical work"],
    q9: ["Being respected and highly skilled"],
    q10: ["Working with AI or automation tools", "Working with data or solving analytical problems", "Creating apps or websites"],
    q11: ["Financial freedom — options and wealth"],
    q12: "I genuinely enjoy constantly learning new things",
    q13: "I want to work with data and build models",
  },
  context: baseContext({ availableHoursPerWeek: 20 }),
};

export const fixtureLowTimeAvailability: StrategyFixture = {
  name: "analytical-technical-cse-4h",
  answers: fixtureAnalyticalTechnical.answers,
  context: baseContext({ availableHoursPerWeek: 4 }),
};

export const fixtureProductOriented: StrategyFixture = {
  name: "product-oriented-bba-10h",
  answers: {
    q1: "Working with people",
    q2: ["The one managing everyone"],
    q3: ["Business or money content", "Helping friends solve problems"],
    q4: ["Talking to people or clients"],
    q5: "I don't enjoy it much",
    q6: ["Learning with a community or friends"],
    q7: ["Team collaboration and meetings"],
    q8: ["Too much deep coding all day"],
    q9: ["Building something of my own"],
    q10: ["Understanding business, money, or strategy", "Managing people or projects"],
    q11: ["Running my own business or venture"],
    q12: "I'm okay with it if it helps my career growth",
    q13: "I want to manage products and teams",
  },
  context: baseContext({ degree: "BBA", graduationYear: 2026 }),
};

export const fixtureDesignOriented: StrategyFixture = {
  name: "design-oriented-bdes-12h",
  answers: {
    q1: "Creating or designing things",
    q2: ["The creative or design person"],
    q3: ["Editing, design, or content creation", "Helping friends solve problems"],
    q4: ["Creating visuals or content", "Talking to people or clients"],
    q5: "I prefer low-code or no-code tools",
    q6: ["Trying things directly and breaking stuff"],
    q7: ["Freelancing or running my own thing"],
    q8: ["Too much deep coding all day"],
    q9: ["Doing work I actually enjoy"],
    q10: ["Design or content creation"],
    q11: ["Peaceful low-stress, meaningful work"],
    q12: "I prefer mastering stable skills, not chasing trends",
    q13: "I love designing interfaces and visuals",
  },
  context: baseContext({ degree: "B.Des Communication Design", availableHoursPerWeek: 12 }),
};

export const fixtureBusinessOriented: StrategyFixture = {
  name: "business-oriented-bcom-10h",
  answers: {
    q1: "Making money early",
    q2: ["The one managing everyone", "The silent one doing their own focused work"],
    q3: ["Business or money content", "Organizing and planning things"],
    q4: ["Organizing data or systems", "Talking to people or clients"],
    q5: "I can learn if it helps my career",
    q6: ["Following structured steps or courses"],
    q7: ["Stable corporate structure"],
    q8: ["High-pressure competitive environments"],
    q9: ["A stable and predictable life"],
    q10: ["Understanding business, money, or strategy"],
    q11: ["Stable family life with predictable income"],
    q12: "I prefer mastering stable skills, not chasing trends",
    q13: "",
  },
  context: baseContext({ degree: "B.Com", graduationYear: 2026 }),
};

export const fixtureUnknownDegree: StrategyFixture = {
  name: "analytical-unknown-degree-15h",
  answers: fixtureAnalyticalTechnical.answers,
  context: baseContext({
    degree: "Underwater Basket Weaving",
    availableHoursPerWeek: 15,
  }),
};

export const fixtureEmptyAnswers: StrategyFixture = {
  name: "empty-answers",
  answers: {
    q1: null,
    q2: EMPTY_MULTI,
    q3: EMPTY_MULTI,
    q4: EMPTY_MULTI,
    q5: null,
    q6: EMPTY_MULTI,
    q7: EMPTY_MULTI,
    q8: EMPTY_MULTI,
    q9: EMPTY_MULTI,
    q10: EMPTY_MULTI,
    q11: EMPTY_MULTI,
    q12: null,
    q13: "",
  },
  context: baseContext(),
};

export const ALL_FIXTURES: readonly StrategyFixture[] = [
  fixtureAnalyticalTechnical,
  fixtureLowTimeAvailability,
  fixtureProductOriented,
  fixtureDesignOriented,
  fixtureBusinessOriented,
  fixtureUnknownDegree,
  fixtureEmptyAnswers,
];

/** Minimal four-career catalog forcing a BRIDGE route (test-only). */
export const BRIDGE_CATALOG: readonly CareerDefinition[] = [
  {
    id: "apex-role",
    title: "Apex Role",
    category: "Apex",
    accessibility: "LOW",
    degreeStrong: [],
    degreeModerate: [],
    degreeWeak: [],
    runwayHours: 400,
    codeIntensity: 0,
    targetPotential: 5,
    fitWeights: { analytical: 1 },
    entryCandidates: ["step-role"],
    bridgeCandidates: ["mid-role"],
  },
  {
    id: "step-role",
    title: "Step Role",
    category: "Other",
    accessibility: "LOW",
    degreeStrong: [],
    degreeModerate: [],
    degreeWeak: [],
    runwayHours: 400,
    codeIntensity: 0,
    targetPotential: 2,
    fitWeights: { analytical: 0.9 },
    entryCandidates: [],
    bridgeCandidates: [],
  },
  {
    id: "mid-role",
    title: "Mid Role",
    category: "Apex",
    accessibility: "MEDIUM",
    degreeStrong: [],
    degreeModerate: [],
    degreeWeak: [],
    runwayHours: 200,
    codeIntensity: 0,
    targetPotential: 3,
    fitWeights: { analytical: 0.8 },
    entryCandidates: ["wedge-role"],
    bridgeCandidates: [],
  },
  {
    id: "wedge-role",
    title: "Wedge Role",
    category: "Apex",
    accessibility: "VERY_HIGH",
    degreeStrong: [],
    degreeModerate: [],
    degreeWeak: [],
    runwayHours: 100,
    codeIntensity: 0,
    targetPotential: 2,
    fitWeights: { analytical: 0.8 },
    entryCandidates: [],
    bridgeCandidates: [],
  },
];

/** Single-career catalog: alternative and bridge must be null. */
export const SOLO_CATALOG: readonly CareerDefinition[] = [
  {
    id: "solo-role",
    title: "Solo Role",
    category: "Solo",
    accessibility: "HIGH",
    degreeStrong: [],
    degreeModerate: [],
    degreeWeak: [],
    runwayHours: 100,
    codeIntensity: 0,
    targetPotential: 3,
    fitWeights: { analytical: 1 },
    entryCandidates: [],
    bridgeCandidates: [],
  },
];

/** Minimal two-career catalog for tie-breaking tests (not the V1 catalog). */
export const TIE_CATALOG: readonly CareerDefinition[] = [
  {
    id: "beta-role",
    title: "Beta Role",
    category: "Test",
    accessibility: "HIGH",
    degreeStrong: [],
    degreeModerate: [],
    degreeWeak: [],
    runwayHours: 100,
    codeIntensity: 0,
    targetPotential: 3,
    fitWeights: { analytical: 1 },
    entryCandidates: [],
    bridgeCandidates: [],
  },
  {
    id: "alpha-role",
    title: "Alpha Role",
    category: "Test",
    accessibility: "HIGH",
    degreeStrong: [],
    degreeModerate: [],
    degreeWeak: [],
    runwayHours: 100,
    codeIntensity: 0,
    targetPotential: 3,
    fitWeights: { analytical: 1 },
    entryCandidates: [],
    bridgeCandidates: [],
  },
];
