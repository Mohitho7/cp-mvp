/**
 * Batch 3 — Deterministic strategy explanation builder.
 *
 * PURE + DETERMINISTIC + SIDE-EFFECT FREE: no database, network, LLM,
 * clock, or random calls. Same strategy + profile + context + catalog
 * always yields the exact same explanation.
 *
 * The builder EXPLAINS the Batch 2 decision; it never makes, ranks,
 * modifies, or overrides it. Every sentence is grounded in actual inputs:
 * fit profile values, catalog attributes, degree alignment, route type,
 * and available hours. No salaries, hiring rates, openings, companies,
 * timelines, or unassessed skills are ever mentioned. Internal scores are
 * never dumped.
 */
import type { StudentContext } from "../studentContext";
import type {
  AccessibilityLevel,
  CareerDefinition,
  CareerStrategy,
  CareerStrategyExplanation,
  DegreeFamily,
  FitDimension,
  StudentFitProfile,
} from "./types";
import { alignmentFor, normalizeDegreeFamily } from "./degreeAlignment";
import { runwayFitValue } from "./strategy";

/** Explanation contract version, persisted alongside each strategy. */
export const EXPLANATION_VERSION = "batch3-v1";

export interface ExplanationInputs {
  strategy: CareerStrategy;
  profile: StudentFitProfile;
  context: StudentContext;
  catalog: readonly CareerDefinition[];
}

/** A dimension counts as a supporting signal with at least one matched label. */
const SUPPORT_THRESHOLD = 1 / 3;

const DIMENSION_CONCEPTS: Record<FitDimension, string> = {
  analytical: "analytical thinking and problem solving",
  technical: "hands-on technical work",
  creative: "creative and design-oriented work",
  people: "working closely with people",
  communication: "communication and explaining ideas",
  structure: "structured, organized work",
  autonomy: "independent, self-directed work",
  product: "product thinking and building things people use",
  business: "business and commercial thinking",
  execution: "practical execution and getting things done",
};

const ACCESSIBILITY_PHRASE: Record<AccessibilityLevel, string> = {
  VERY_HIGH: "offers a highly accessible starting point for a fresher",
  HIGH: "offers a more accessible starting point for a fresher",
  MEDIUM: "offers a moderately accessible starting point",
  LOW: "is a demanding starting point that the model still ranks as the most realistic available option",
  VERY_LOW:
    "is a demanding starting point that the model still ranks as the most realistic available option",
};

const DEGREE_FAMILY_LABEL: Record<Exclude<DegreeFamily, "OTHER">, string> = {
  CS_IT_DATA: "computing",
  ENGINEERING: "engineering",
  BUSINESS_COMMERCE: "business/commerce",
  DESIGN: "design",
  ARTS_HUMANITIES: "arts/humanities",
  SCIENCE: "science",
};

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]}, and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Supporting dimensions: weighted by the career and present in the profile. */
function supportingConcepts(
  career: CareerDefinition,
  profile: StudentFitProfile,
  count: number,
): string[] {
  return Object.entries(career.fitWeights)
    .filter(([dimension, weight]) => (weight ?? 0) > 0 && profile[dimension as FitDimension] >= SUPPORT_THRESHOLD)
    .sort((a, b) => {
      const weightDiff = (b[1] ?? 0) - (a[1] ?? 0);
      if (weightDiff !== 0) return weightDiff;
      const profileDiff = profile[b[0] as FitDimension] - profile[a[0] as FitDimension];
      if (profileDiff !== 0) return profileDiff;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    })
    .slice(0, count)
    .map(([dimension]) => DIMENSION_CONCEPTS[dimension as FitDimension]);
}

function insufficientExplanation(): CareerStrategyExplanation {
  return {
    target: "There's not enough information yet to determine a reliable target career.",
    entry: "There's not enough information yet to recommend a realistic entry career.",
    route:
      "Complete the required assessment and student context so Career Pathfinder can build an entry strategy.",
    academic:
      "Academic alignment cannot be assessed until the required assessment and student context are complete.",
    time: "Time feasibility cannot be assessed until the required assessment and student context are complete.",
    bridge: null,
    alternative: null,
  };
}

function runwayPhrase(runwayValue: number, hoursPerWeek: number): string {
  const base = `At ${hoursPerWeek} hour${hoursPerWeek === 1 ? "" : "s"} per week of focused preparation, `;
  if (runwayValue >= 1) {
    return `${base}this entry route fits comfortably within your available time.`;
  }
  if (runwayValue >= 0.6) {
    return `${base}this entry route fits within your available time under the strategy's runway model.`;
  }
  if (runwayValue >= 0.4) {
    return `${base}this entry route will require sustained effort at your current availability.`;
  }
  return (
    `${base}the model keeps this entry point conservative, since the preparation ` +
    `needed exceeds what your current availability comfortably supports.`
  );
}

/**
 * Builds the student-readable explanation. Deterministic; explains only.
 */
export function buildStrategyExplanation(inputs: ExplanationInputs): CareerStrategyExplanation {
  const { strategy, profile, context, catalog } = inputs;
  const byId = new Map(catalog.map((career) => [career.id, career]));

  if (strategy.insufficientContext) {
    return insufficientExplanation();
  }
  const targetDef = strategy.targetCareer ? byId.get(strategy.targetCareer.id) : undefined;
  const entryDef = strategy.bestEntryCareer ? byId.get(strategy.bestEntryCareer.id) : undefined;
  if (!targetDef || !entryDef || !strategy.routeType) {
    return insufficientExplanation();
  }

  const family = normalizeDegreeFamily(context.degree);
  const hoursPerWeek = context.availableHoursPerWeek;

  const targetConcepts = supportingConcepts(targetDef, profile, 2);
  const target =
    targetConcepts.length > 0
      ? `${targetDef.title} is your strongest long-term direction because your assessment shows stronger ${joinAnd(targetConcepts)}.`
      : `${targetDef.title} is your strongest long-term direction, based on the overall pattern of your answers.`;

  const sharedConcepts = supportingConcepts(entryDef, profile, 1);
  const connection = entryDef.id === targetDef.id
    ? "It is both the long-term direction and the starting point."
    : targetDef.entryCandidates.includes(entryDef.id)
      ? `It is directly connected to ${targetDef.title} in the strategy model, so experience there transfers toward your target.`
      : entryDef.category === targetDef.category
        ? `It sits in the same ${entryDef.category} area as ${targetDef.title}, keeping you connected to your target direction.`
        : `It keeps you connected to your ${targetDef.title} direction while remaining realistic to enter.`;
  const entry =
    `${entryDef.title} is the recommended starting point: it ${ACCESSIBILITY_PHRASE[entryDef.accessibility]}. ` +
    `${connection}` +
    (sharedConcepts.length > 0 ? ` It also matches your stronger ${sharedConcepts[0]}.` : "");

  let route: string;
  if (strategy.routeType === "DIRECT") {
    route =
      `Your recommended starting point and long-term direction are the same (${targetDef.title}), ` +
      `so this is a direct route \u2014 no intermediate step is required.`;
  } else if (strategy.routeType === "ADJACENT") {
    route =
      `This is an adjacent route: start as ${entryDef.title} and use that experience as a ` +
      `stepping stone toward ${targetDef.title}.`;
  } else {
    const bridgeDef = strategy.bridgeCareer ? byId.get(strategy.bridgeCareer.id) : undefined;
    if (!bridgeDef) {
      return insufficientExplanation();
    }
    route =
      `This is a bridge route with a clear chain: ${entryDef.title} \u2192 ${bridgeDef.title} \u2192 ${targetDef.title}. ` +
      `${bridgeDef.title} builds on entry-level experience and moves you closer to ${targetDef.title}.`;
  }

  const alignment = alignmentFor(entryDef, family);
  const academic =
    alignment === "STRONG" && family !== "OTHER"
      ? `Your ${DEGREE_FAMILY_LABEL[family]} background aligns strongly with this entry direction.`
      : alignment === "MODERATE" && family !== "OTHER"
        ? `Your ${DEGREE_FAMILY_LABEL[family]} background has a moderate alignment with this entry direction, so fit and feasibility carry the rest.`
        : `Your degree does not provide a strong direct signal for this entry direction, so the recommendation leans more on fit, accessibility, and runway.`;

  let time = runwayPhrase(runwayFitValue(entryDef.runwayHours, Math.max(1, hoursPerWeek)), hoursPerWeek);
  if (hoursPerWeek <= 5 && entryDef.id !== targetDef.id) {
    time +=
      " With limited weekly availability, entering directly into the longer-runway target would not be practical.";
  }

  const bridgeDef = strategy.bridgeCareer ? byId.get(strategy.bridgeCareer.id) : undefined;
  const bridge =
    strategy.bridgeCareer && bridgeDef
      ? `${bridgeDef.title} sits between ${entryDef.title} and ${targetDef.title}: ` +
        `it builds on entry-level experience and moves you closer to ${targetDef.title}.`
      : null;

  const alternativeDef = strategy.alternativeRoute ? byId.get(strategy.alternativeRoute.id) : undefined;
  const alternative =
    strategy.alternativeRoute && alternativeDef
      ? `${alternativeDef.title} is a secondary option to keep in mind. ` +
        `It ranked below the primary route, so treat it as a backup rather than an equal recommendation.`
      : null;

  return { target, entry, route, academic, time, bridge, alternative };
}
