/**
 * Batch 2 — Deterministic career entry strategy engine.
 *
 * PURE + DETERMINISTIC + SIDE-EFFECT FREE: no database, network, LLM, clock,
 * or random calls. Same input always yields the same output.
 *
 * Separation enforced here:
 * - TARGET  = strongest long-term fit (accessibility cannot replace it)
 * - ENTRY   = strongest realistic first-job wedge toward the target
 * - BRIDGE  = intermediate step, only when materially necessary (else null)
 * - ROUTE   = DIRECT | ADJACENT | BRIDGE derived from the above
 */
import type { StudentContext } from "../studentContext";
import type {
  CareerDefinition,
  CareerReference,
  CareerStrategy,
  DegreeAlignment,
  DegreeFamily,
  FitDimension,
  RouteType,
  StudentFitProfile,
} from "./types";
import { FIT_DIMENSIONS } from "./types";
import { normalizeAnswers, totalFitSignal } from "./fitProfile";
import {
  ACCESSIBILITY_VALUE,
  alignmentFor,
  DEGREE_ALIGNMENT_VALUE,
  normalizeDegreeFamily,
} from "./degreeAlignment";
import type { CareerSubmissionInput } from "@workspace/api-zod";
import { buildMultiRoleRanking } from "./ranking";
import { CAREERS } from "./catalog";

/** Internal ranking weights (mechanics, never shown to students). */
export const WEIGHT_ACCESS = 0.2;
export const WEIGHT_DEGREE = 0.15;
export const WEIGHT_RUNWAY = 0.2;
export const WEIGHT_CONNECTION = 0.2;
export const WEIGHT_FIT = 0.25;

/**
 * Entry penalty scale for an explicit student aversion to deep coding.
 * Proportional to career codeIntensity.
 */
export const AVERSION_PENALTY = 0.1;

/** Calibrated long-term target weights and aversion penalty. */
export const WEIGHT_TARGET_FIT = 0.8;
export const WEIGHT_TARGET_POTENTIAL = 0.2;
export const TARGET_AVERSION_PENALTY = 0.08;

/** q8 option label expressing an aversion to deep coding (stored verbatim). */
const DEEP_CODING_AVERSION_FRAGMENT = "deep cod";

export function hasDeepCodingAversion(answers: CareerSubmissionInput["answers"]): boolean {
  const record =
    answers && typeof answers === "object"
      ? (answers as Record<string, unknown>)
      : {};
  const value = record.q8;
  const labels =
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
  return labels.some((label) =>
    label.toLowerCase().includes(DEEP_CODING_AVERSION_FRAGMENT),
  );
}

/** Runway bands: estimated preparation weeks from typicalRunwayHours / hrs-per-week. */
export const RUNWAY_BANDS = [
  { maxWeeks: 8, value: 1 },
  { maxWeeks: 16, value: 0.8 },
  { maxWeeks: 26, value: 0.6 },
  { maxWeeks: 52, value: 0.4 },
] as const;
export const RUNWAY_FLOOR_VALUE = 0.2;

const SCORE_EPSILON = 1e-9;
const MIN_TOTAL_FIT_SIGNAL = 0.05;

export function cosineSimilarity(profile: StudentFitProfile, weights: Partial<Record<FitDimension, number>>): number {
  let dot = 0;
  let profileNorm = 0;
  let weightsNorm = 0;
  for (const dimension of FIT_DIMENSIONS) {
    const profileValue = profile[dimension];
    const weightValue = weights[dimension] ?? 0;
    dot += profileValue * weightValue;
    profileNorm += profileValue * profileValue;
    weightsNorm += weightValue * weightValue;
  }
  if (profileNorm <= 0 || weightsNorm <= 0) return 0;
  return dot / (Math.sqrt(profileNorm) * Math.sqrt(weightsNorm));
}

export function runwayFitValue(runwayHours: number, hoursPerWeek: number): number {
  const weeks = runwayHours / Math.max(1, hoursPerWeek);
  for (const band of RUNWAY_BANDS) {
    if (weeks <= band.maxWeeks) return band.value;
  }
  return RUNWAY_FLOOR_VALUE;
}

export function estimatedWeeks(runwayHours: number, hoursPerWeek: number): number {
  return runwayHours / Math.max(1, hoursPerWeek);
}

function connectionValue(candidate: CareerDefinition, target: CareerDefinition): number {
  if (candidate.id === target.id) return 1;
  if (target.entryCandidates.includes(candidate.id)) return 0.7;
  if (candidate.category === target.category) return 0.5;
  return 0.3;
}

interface ScoredCareer {
  career: CareerDefinition;
  entryScore: number;
  targetScore: number;
  fitCosine: number;
  alignment: DegreeAlignment;
}

function scoreCareer(
  career: CareerDefinition,
  target: CareerDefinition,
  profile: StudentFitProfile,
  family: DegreeFamily,
  hoursPerWeek: number,
  codeAversion: boolean,
): ScoredCareer {
  const fitCosine = cosineSimilarity(profile, career.fitWeights);
  const alignment = alignmentFor(career, family);
  const entryScore =
    WEIGHT_ACCESS * (ACCESSIBILITY_VALUE[career.accessibility] / 5) +
    WEIGHT_DEGREE * DEGREE_ALIGNMENT_VALUE[alignment] +
    WEIGHT_RUNWAY * runwayFitValue(career.runwayHours, hoursPerWeek) +
    WEIGHT_CONNECTION * connectionValue(career, target) +
    WEIGHT_FIT * fitCosine -
    (codeAversion ? AVERSION_PENALTY * career.codeIntensity : 0);
  const targetAversionPenalty = codeAversion ? TARGET_AVERSION_PENALTY * career.codeIntensity : 0;
  const targetScore =
    WEIGHT_TARGET_FIT * fitCosine +
    WEIGHT_TARGET_POTENTIAL * (career.targetPotential / 5) -
    targetAversionPenalty;
  return { career, entryScore, targetScore, fitCosine, alignment };
}

/**
 * Deterministic ordering: score desc, accessibility desc, degree alignment
 * desc, runway asc, career id alphabetical. Never random, never time-based.
 */
function compareEntry(a: ScoredCareer, b: ScoredCareer): number {
  if (Math.abs(b.entryScore - a.entryScore) > SCORE_EPSILON) {
    return b.entryScore - a.entryScore;
  }
  const accessDiff = ACCESSIBILITY_VALUE[b.career.accessibility] - ACCESSIBILITY_VALUE[a.career.accessibility];
  if (accessDiff !== 0) return accessDiff;
  const alignDiff = DEGREE_ALIGNMENT_VALUE[b.alignment] - DEGREE_ALIGNMENT_VALUE[a.alignment];
  if (Math.abs(alignDiff) > SCORE_EPSILON) return alignDiff > 0 ? 1 : -1;
  if (a.career.runwayHours !== b.career.runwayHours) {
    return a.career.runwayHours - b.career.runwayHours;
  }
  return a.career.id < b.career.id ? -1 : a.career.id > b.career.id ? 1 : 0;
}

function topDimensions(profile: StudentFitProfile, count: number): string[] {
  return [...FIT_DIMENSIONS]
    .sort((a, b) => {
      const diff = profile[b] - profile[a];
      if (Math.abs(diff) > SCORE_EPSILON) return diff;
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .slice(0, count);
}

function toReference(career: CareerDefinition): CareerReference {
  return { id: career.id, title: career.title };
}

function insufficientStrategy(reason: string): CareerStrategy {
  return {
    targetCareer: null,
    bestEntryCareer: null,
    bridgeCareer: null,
    alternativeRoute: null,
    routeType: null,
    rationale: {
      target: `No target selected: ${reason}`,
      entry: "No entry selected: insufficient context.",
      bridge: null,
      academic: "No academic assessment: insufficient context.",
      time: "No time assessment: insufficient context.",
    },
    insufficientContext: true,
    longTermOptions: [],
    entryOptions: [],
    recommendedWorkLane: null,
  };
}

export interface StrategyInputs {
  answers: CareerSubmissionInput["answers"];
  context: StudentContext;
  catalog: readonly CareerDefinition[];
}

export function isCompatibleEntry(
  candidate: CareerDefinition,
  target: CareerDefinition,
  hoursPerWeek: number,
  catalog: readonly CareerDefinition[] = CAREERS,
): boolean {
  if (candidate.id === target.id) {
    return (
      candidate.accessibility !== "LOW" &&
      candidate.accessibility !== "VERY_LOW" &&
      runwayFitValue(target.runwayHours, hoursPerWeek) > RUNWAY_FLOOR_VALUE
    );
  }
  if (target.entryCandidates.includes(candidate.id)) {
    return true;
  }
  if (target.bridgeCandidates.length > 0) {
    const byId = new Map(catalog.map((c) => [c.id, c]));
    for (const bridgeId of target.bridgeCandidates) {
      if (bridgeId === candidate.id || bridgeId === target.id) continue;
      const bridgeDef = byId.get(bridgeId);
      if (bridgeDef && bridgeDef.entryCandidates.includes(candidate.id)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Builds the deterministic entry strategy. Same inputs → same output, always.
 */
export function buildEntryStrategy(inputs: StrategyInputs): CareerStrategy {
  const { answers, context, catalog } = inputs;
  if (catalog.length === 0) {
    return insufficientStrategy("the career catalog is empty.");
  }
  if (!context.degree || context.degree.trim().length === 0) {
    return insufficientStrategy("degree context is missing.");
  }
  if (!Number.isInteger(context.availableHoursPerWeek) || context.availableHoursPerWeek <= 0) {
    return insufficientStrategy("weekly availability is invalid.");
  }

  const profile = normalizeAnswers(answers);
  if (totalFitSignal(profile) < MIN_TOTAL_FIT_SIGNAL) {
    return insufficientStrategy("no recognizable fit signals in the answers.");
  }

  const family = normalizeDegreeFamily(context.degree);
  const hoursPerWeek = context.availableHoursPerWeek;

  const codeAversion = hasDeepCodingAversion(answers);

  // TARGET: strongest long-term fit with calibrated fit weighting and aversion penalty.
  // Stepping stones (targetPotential < 3) are excluded from target selection.
  const eligibleTargets = catalog.filter((career) => career.targetPotential >= 3);
  const targetPool = eligibleTargets.length > 0 ? eligibleTargets : catalog;
  const scoredForTarget = targetPool.map((career) =>
    scoreCareer(career, career, profile, family, hoursPerWeek, codeAversion),
  );
  scoredForTarget.sort((a, b) => {
    if (Math.abs(b.targetScore - a.targetScore) > SCORE_EPSILON) {
      return b.targetScore - a.targetScore;
    }
    if (b.career.targetPotential !== a.career.targetPotential) {
      return b.career.targetPotential - a.career.targetPotential;
    }
    return a.career.id < b.career.id ? -1 : a.career.id > b.career.id ? 1 : 0;
  });
  const target = scoredForTarget[0].career;
  const targetFit = scoredForTarget[0].fitCosine;

  // ENTRY: strongest realistic wedge toward the (already fixed) target.
  // DIRECT feasibility gate: when the entry winner would equal the target
  // but the target's runway feasibility is at the floor value, the target
  // is not a realistic first step, so it is excluded from the entry pool
  // and entry selection reruns. Target selection itself is never altered.
  let scoredForEntry = catalog.map((career) =>
    scoreCareer(career, target, profile, family, hoursPerWeek, codeAversion),
  );
  scoredForEntry.sort(compareEntry);
  if (
    scoredForEntry.length > 0 &&
    scoredForEntry[0].career.id === target.id &&
    runwayFitValue(target.runwayHours, hoursPerWeek) <= RUNWAY_FLOOR_VALUE
  ) {
    scoredForEntry = scoredForEntry.filter((item) => item.career.id !== target.id);
  }
  if (scoredForEntry.length === 0) {
    return insufficientStrategy("no feasible entry career is available.");
  }

  // Find the top compatible entry route toward target.
  const compatibleEntry = scoredForEntry.find((item) =>
    isCompatibleEntry(item.career, target, hoursPerWeek, catalog),
  );
  if (!compatibleEntry) {
    return insufficientStrategy("no valid entry route exists toward target career.");
  }
  const entry = compatibleEntry;

  const usedIds = new Set([target.id, entry.career.id]);
  let routeType: RouteType;
  let bridge: ScoredCareer | null = null;

  if (entry.career.id === target.id) {
    routeType = "DIRECT";
  } else if (target.entryCandidates.includes(entry.career.id)) {
    routeType = "ADJACENT";
  } else {
    const bridgeOptions = scoredForEntry.filter(
      (item) =>
        target.bridgeCandidates.includes(item.career.id) &&
        item.career.entryCandidates.includes(entry.career.id) &&
        !usedIds.has(item.career.id),
    );
    if (bridgeOptions.length > 0) {
      bridge = bridgeOptions[0];
      usedIds.add(bridge.career.id);
      routeType = "BRIDGE";
    } else {
      return insufficientStrategy("no valid transition route connects entry to target career.");
    }
  }

  const alternative = scoredForEntry.find((item) => !usedIds.has(item.career.id)) ?? null;

  const dimensions = topDimensions(profile, 2);
  const entryWeeks = estimatedWeeks(entry.career.runwayHours, hoursPerWeek);
  const entryAlignment = alignmentFor(entry.career, family);
  const aversionNote =
    codeAversion && entry.career.codeIntensity >= 0.5
      ? " Your aversion to deep coding was weighed against code-intensive routes."
      : "";

  const multiRoleRanking = buildMultiRoleRanking({
    catalog,
    profile,
    context,
    codeAversion,
    primaryTarget: target,
    bestEntry: entry.career,
  });

  return {
    targetCareer: toReference(target),
    bestEntryCareer: toReference(entry.career),
    bridgeCareer: bridge ? toReference(bridge.career) : null,
    alternativeRoute: alternative ? toReference(alternative.career) : null,
    routeType,
    rationale: {
      target: `Target selected by long-term fit: ${target.title} (strongest signals: ${dimensions.join(", ")}; fit ${targetFit.toFixed(2)}).`,
      entry:
        routeType === "DIRECT"
          ? `Direct entry is realistic: ${entry.career.title} is both the target and the best first step.${aversionNote}`
          : `Most realistic first step toward ${target.title}: ${entry.career.title} (entry score ${entry.entryScore.toFixed(2)}).${aversionNote}`,
      bridge: bridge
        ? `Intermediate step: ${bridge.career.title} connects ${entry.career.title} to ${target.title}.`
        : null,
      academic: `Degree family ${family} aligns ${entryAlignment} with ${entry.career.title}.`,
      time: `Estimated preparation ≈ ${entryWeeks.toFixed(1)} weeks at ${hoursPerWeek} hrs/week (heuristic, not a promise).`,
    },
    insufficientContext: false,
    longTermOptions: multiRoleRanking.longTermOptions,
    entryOptions: multiRoleRanking.entryOptions,
    recommendedWorkLane: multiRoleRanking.recommendedWorkLane,
  };
}
