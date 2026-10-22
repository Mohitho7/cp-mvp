/**
 * Phase 2 — Deterministic multi-role ranking and work-lane alignment.
 *
 * PURE + DETERMINISTIC + SIDE-EFFECT FREE: no database, network, LLM, clock,
 * or random calls. Same inputs always yield the same ranked career options
 * and recommended work lane.
 *
 * Enforces:
 * 1. 5 Long-Term Career Options:
 *    - Scored primarily by intrinsic fit and target potential.
 *    - Strictly excludes stepping stones (targetPotential < 3) and unaligned roles.
 * 2. 5 Entry-Level Job Options:
 *    - Scored by fresher accessibility, degree alignment, runway feasibility,
 *      target connection, and fit, penalized for deep-coding aversion.
 *    - Strictly excludes LOW/VERY_LOW accessibility roles requiring prior experience.
 * 3. Work-Lane Alignment:
 *    - Anchored in one of 7 canonical tracks matching CareerReportRecommendedTrack.
 *    - Derived deterministically from the ranked options and student profile.
 */
import type { StudentContext } from "../studentContext";
import type {
  AccessibilityLevel,
  CareerDefinition,
  CareerReference,
  DegreeAlignment,
  DegreeFamily,
  FitDimension,
  MultiRoleRanking,
  RankedCareerOption,
  RecommendedWorkLane,
  StudentFitProfile,
  WorkLaneId,
} from "./types";
import { FIT_DIMENSIONS } from "./types";
import {
  ACCESSIBILITY_VALUE,
  alignmentFor,
  DEGREE_ALIGNMENT_VALUE,
  normalizeDegreeFamily,
} from "./degreeAlignment";
import {
  estimatedWeeks,
  runwayFitValue,
  RUNWAY_FLOOR_VALUE,
} from "./strategy";

const SCORE_EPSILON = 1e-9;
const MIN_FIT_COSINE_FOR_TARGET = 0.01;


/** Internal ranking weights matching strategy.ts */
export const WEIGHT_ACCESS = 0.2;
export const WEIGHT_DEGREE = 0.15;
export const WEIGHT_RUNWAY = 0.2;
export const WEIGHT_CONNECTION = 0.2;
export const WEIGHT_FIT = 0.25;
export const AVERSION_PENALTY = 0.1;

export const WEIGHT_TARGET_FIT = 0.8;
export const WEIGHT_TARGET_POTENTIAL = 0.2;
export const TARGET_AVERSION_PENALTY = 0.08;

export const CAREER_PRIMARY_LANE: Record<string, WorkLaneId> = {
  "software-engineer": "Engineering",
  "cloud-devops-engineer": "Engineering",
  "cybersecurity-analyst": "Engineering",
  "qa-engineer": "Engineering",
  "it-support": "Engineering",
  "data-scientist": "Engineering",
  "product-manager": "Product",
  "associate-product-manager": "Product",
  "ai-automation-specialist": "Automation",
  "business-analyst": "Technical Business",
  "data-analyst": "Technical Business",
  "project-coordinator": "Startup Ops",
  "operations-associate": "Startup Ops",
  "digital-marketer": "Startup Ops",
  "ux-designer": "Design / UI-UX",
};

/**
 * Calculates cosine similarity between a student fit profile and career fit weights.
 */
export function cosineSimilarity(
  profile: StudentFitProfile,
  weights: Partial<Record<FitDimension, number>>,
): number {
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

function topProfileDimensions(
  profile: StudentFitProfile,
  careerWeights: Partial<Record<FitDimension, number>>,
  count = 2,
): string[] {
  return FIT_DIMENSIONS.filter((dim) => (careerWeights[dim] ?? 0) > 0)
    .sort((a, b) => {
      const diff = profile[b] - profile[a];
      if (Math.abs(diff) > SCORE_EPSILON) return diff;
      return (careerWeights[b] ?? 0) - (careerWeights[a] ?? 0);
    })
    .slice(0, count);
}

export function getCareerMacroDomain(careerId: string): WorkLaneId {
  return CAREER_PRIMARY_LANE[careerId] ?? "Hybrid Tech-Generalist";
}

/**
 * Deterministically ranks long-term career destinations (Top 5).
 *
 * Explicit exclusion rules:
 * - targetPotential < 3: tactical execution or support stepping stones
 *   (e.g. QA Engineer, IT Support, Operations Associate) are excluded from
 *   long-term 5-year destinations.
 * - fitCosine <= 0.01: careers with zero or negative student preference alignment.
 */
export function rankLongTermOptions(
  catalog: readonly CareerDefinition[],
  profile: StudentFitProfile,
  codeAversionOrLimit: boolean | number = false,
  limit = 5,
): RankedCareerOption[] {
  const codeAversion = typeof codeAversionOrLimit === "boolean" ? codeAversionOrLimit : false;
  const effectiveLimit = typeof codeAversionOrLimit === "number" ? codeAversionOrLimit : limit;

  const eligible = catalog.filter(
    (career) => career.targetPotential >= 3,
  );

  const scored = eligible.map((career) => {
    const fitCosine = cosineSimilarity(profile, career.fitWeights);
    const targetAversionPenalty = codeAversion ? TARGET_AVERSION_PENALTY * career.codeIntensity : 0;
    const targetScore =
      WEIGHT_TARGET_FIT * fitCosine +
      WEIGHT_TARGET_POTENTIAL * (career.targetPotential / 5) -
      targetAversionPenalty;
    const matchedDims = topProfileDimensions(profile, career.fitWeights, 2);
    const dimsText =
      matchedDims.length > 0 ? ` (strongest signals: ${matchedDims.join(", ")})` : "";
    const aversionNote =
      codeAversion && career.codeIntensity >= 0.5
        ? " (weighed against coding aversion)"
        : "";
    const rationale = `Long-term suitability score ${(targetScore * 100).toFixed(0)}/100${dimsText} with target potential ${career.targetPotential}/5 and fit index ${fitCosine.toFixed(2)}.${aversionNote}`;

    return {
      career: { id: career.id, title: career.title },
      category: career.category,
      score: Math.round(targetScore * 1000) / 1000,
      fitScore: Math.round(fitCosine * 1000) / 1000,
      rationale,
      targetPotential: career.targetPotential,
      fitCosine,
      rawTargetScore: targetScore,
    };
  });

  scored.sort((a, b) => {
    if (Math.abs(b.rawTargetScore - a.rawTargetScore) > SCORE_EPSILON) {
      return b.rawTargetScore - a.rawTargetScore;
    }
    if (b.targetPotential !== a.targetPotential) {
      return b.targetPotential - a.targetPotential;
    }
    return a.career.id < b.career.id ? -1 : a.career.id > b.career.id ? 1 : 0;
  });

  return scored
    .filter((item) => item.fitCosine >= MIN_FIT_COSINE_FOR_TARGET)
    .slice(0, effectiveLimit)
    .map(({ career, category, score, fitScore, rationale }) => ({
      career,
      category,
      score,
      fitScore,
      rationale,
    }));
}

export interface RankEntryOptionsArgs {
  catalog: readonly CareerDefinition[];
  profile: StudentFitProfile;
  family: DegreeFamily;
  hoursPerWeek: number;
  codeAversion: boolean;
  primaryTarget: CareerDefinition;
  topLongTermTargets?: CareerDefinition[];
  limit?: number;
}

/**
 * Deterministically ranks entry-level job options (Top 5).
 *
 * Explicit exclusion rules:
 * - accessibility === "LOW" or "VERY_LOW": careers requiring prior professional experience
 *   or graduate research (e.g. Product Manager, Data Scientist, Cybersecurity Analyst)
 *   cannot be freshers' first jobs on day 1.
 * - DIRECT feasibility gate: if candidate is the primary target itself but its required
 *   preparation runway exceeds the feasibility ceiling (runwayFitValue <= floor),
 *   direct entry is excluded.
 */
export function rankEntryOptions(args: RankEntryOptionsArgs): RankedCareerOption[] {
  const {
    catalog,
    profile,
    family,
    hoursPerWeek,
    codeAversion,
    primaryTarget,
    topLongTermTargets = [],
    limit = 5,
  } = args;

  // 1. Accessibility gate: freshers cannot enter LOW / VERY_LOW roles on day 1
  let eligible = catalog.filter(
    (career) => career.accessibility !== "LOW" && career.accessibility !== "VERY_LOW",
  );

  // 2. Direct feasibility gate for target
  const isDirectInfeasible =
    runwayFitValue(primaryTarget.runwayHours, hoursPerWeek) <= RUNWAY_FLOOR_VALUE;
  if (isDirectInfeasible) {
    eligible = eligible.filter((career) => career.id !== primaryTarget.id);
  }

  const topTargetIds = new Set(topLongTermTargets.map((t) => t.id));

  const scored = eligible.map((career) => {
    const fitCosine = cosineSimilarity(profile, career.fitWeights);
    const alignment = alignmentFor(career, family);

    // Connection: direct target match (1.0), curated entry candidate of primary target (0.7),
    // same category (0.5), else 0.3.
    let connection = 0.3;
    if (career.id === primaryTarget.id) {
      connection = 1.0;
    } else if (primaryTarget.entryCandidates.includes(career.id)) {
      connection = 0.7;
    } else if (career.category === primaryTarget.category) {
      connection = 0.5;
    }

    const accessScore = ACCESSIBILITY_VALUE[career.accessibility] / 5;
    const degreeScore = DEGREE_ALIGNMENT_VALUE[alignment];
    const runwayScore = runwayFitValue(career.runwayHours, hoursPerWeek);
    const aversionPenalty = codeAversion ? AVERSION_PENALTY * career.codeIntensity : 0;

    const entryScore =
      WEIGHT_ACCESS * accessScore +
      WEIGHT_DEGREE * degreeScore +
      WEIGHT_RUNWAY * runwayScore +
      WEIGHT_CONNECTION * connection +
      WEIGHT_FIT * fitCosine -
      aversionPenalty;

    const weeks = estimatedWeeks(career.runwayHours, hoursPerWeek);
    const connectionNote =
      career.id === primaryTarget.id
        ? "direct destination match"
        : primaryTarget.entryCandidates.includes(career.id)
          ? `curated entry stepping stone toward ${primaryTarget.title}`
          : topTargetIds.has(career.id)
            ? "matches a high-ranking long-term target"
            : career.category === primaryTarget.category
              ? `same domain category (${career.category})`
              : "transferable professional foundation";

    const aversionNote =
      codeAversion && career.codeIntensity >= 0.5
        ? " (weighed against coding aversion)"
        : "";

    const rationale = `Entry score ${(entryScore * 100).toFixed(0)}/100: ${career.accessibility} accessibility, ${alignment} degree alignment for ${family}, ~${weeks.toFixed(0)} wks prep at ${hoursPerWeek} hrs/wk; ${connectionNote}.${aversionNote}`;

    return {
      career: { id: career.id, title: career.title },
      category: career.category,
      score: Math.round(entryScore * 1000) / 1000,
      fitScore: Math.round(fitCosine * 1000) / 1000,
      accessibility: career.accessibility,
      alignment,
      runwayWeeks: Math.round(weeks * 10) / 10,
      rationale,
      rawEntryScore: entryScore,
      runwayHours: career.runwayHours,
    };
  });

  scored.sort((a, b) => {
    if (Math.abs(b.rawEntryScore - a.rawEntryScore) > SCORE_EPSILON) {
      return b.rawEntryScore - a.rawEntryScore;
    }
    const accessDiff =
      ACCESSIBILITY_VALUE[b.accessibility] - ACCESSIBILITY_VALUE[a.accessibility];
    if (accessDiff !== 0) return accessDiff;
    const alignDiff =
      DEGREE_ALIGNMENT_VALUE[b.alignment] - DEGREE_ALIGNMENT_VALUE[a.alignment];
    if (Math.abs(alignDiff) > SCORE_EPSILON) return alignDiff > 0 ? 1 : -1;
    if (a.runwayHours !== b.runwayHours) {
      return a.runwayHours - b.runwayHours;
    }
    return a.career.id < b.career.id ? -1 : a.career.id > b.career.id ? 1 : 0;
  });

  return scored.slice(0, limit).map(
    ({ career, category, score, fitScore, accessibility, alignment, runwayWeeks, rationale }) => ({
      career,
      category,
      score,
      fitScore,
      accessibility,
      alignment,
      runwayWeeks,
      rationale,
    }),
  );
}

export interface DeriveWorkLaneArgs {
  primaryTarget: CareerDefinition;
  bestEntry: CareerDefinition;
  longTermOptions: RankedCareerOption[];
  entryOptions: RankedCareerOption[];
  profile: StudentFitProfile;
}

/**
 * Derives a single recommended work lane anchored in the 7 canonical tracks:
 * "Engineering" | "Product" | "Automation" | "Startup Ops" | "Technical Business" |
 * "Design / UI-UX" | "Hybrid Tech-Generalist".
 *
 * References the ranked career options and entry routes deterministically.
 */
export function deriveRecommendedWorkLane(args: DeriveWorkLaneArgs): RecommendedWorkLane {
  const { primaryTarget, bestEntry, longTermOptions, entryOptions, profile } = args;

  const targetDomain = getCareerMacroDomain(primaryTarget.id);
  const entryDomain = getCareerMacroDomain(bestEntry.id);

  // Broad macro-clusters
  const isTargetTechnical = targetDomain === "Engineering" || targetDomain === "Automation";
  const isTargetBusinessOrProduct =
    targetDomain === "Product" ||
    targetDomain === "Technical Business" ||
    targetDomain === "Startup Ops";

  const isEntryTechnical = entryDomain === "Engineering" || entryDomain === "Automation";
  const isEntryBusinessOrProduct =
    entryDomain === "Product" ||
    entryDomain === "Technical Business" ||
    entryDomain === "Startup Ops";

  // Check for genuine cross-functional hybrid profile
  let isHybrid = false;
  let hybridReason = "";

  // 1. Cross-domain Target & Entry across tech/business boundary with balanced signals
  const hasBalancedTechBusinessProfile =
    (profile.technical >= 0.15 || profile.analytical >= 0.2) &&
    (profile.business >= 0.15 || profile.product >= 0.15 || profile.execution >= 0.2);

  if (
    hasBalancedTechBusinessProfile &&
    ((isTargetBusinessOrProduct && isEntryTechnical) ||
      (isTargetTechnical && isEntryBusinessOrProduct))
  ) {
    isHybrid = true;
    hybridReason = `bridges ${targetDomain} direction with ${entryDomain} entry pathway`;
  }

  // 2. Close score gap between top two long-term options spanning different domains
  if (!isHybrid && longTermOptions.length >= 2) {
    const top1 = longTermOptions[0];
    const top2 = longTermOptions[1];
    const domain1 = getCareerMacroDomain(top1.career.id);
    const domain2 = getCareerMacroDomain(top2.career.id);

    const hasBothTechAndCommercialSignals =
      (profile.technical >= 0.14 || profile.analytical >= 0.20 || profile.technical + profile.analytical >= 0.22) &&
      (profile.business >= 0.14 ||
        profile.product >= 0.14 ||
        profile.communication >= 0.2 ||
        profile.people >= 0.2);

    if (
      domain1 !== domain2 &&
      hasBothTechAndCommercialSignals &&
      Math.abs(top1.score - top2.score) <= 0.06 &&
      top1.fitScore >= 0.4 &&
      top2.fitScore >= 0.4
    ) {
      isHybrid = true;
      hybridReason = `demonstrates balanced multi-domain aptitude across ${domain1} and ${domain2}`;
    }
  }

  let selectedLane: WorkLaneId;
  let why: string;

  if (isHybrid) {
    selectedLane = "Hybrid Tech-Generalist";
    why = `Recommended work lane is Hybrid Tech-Generalist: ${hybridReason}, connecting target destination ${primaryTarget.title} with practical execution in ${bestEntry.title}.`;
  } else {
    selectedLane = targetDomain;
    switch (targetDomain) {
      case "Engineering":
        why = `Recommended work lane is Engineering: driven by software systems, technical problem-solving, and architecture, anchored by target ${primaryTarget.title}.`;
        break;
      case "Product":
        why = `Recommended work lane is Product: centered on user problem discovery, prioritization, and product delivery, anchored by target ${primaryTarget.title}.`;
        break;
      case "Automation":
        why = `Recommended work lane is Automation: focused on AI workflows, no-code integrations, and operational automation, anchored by target ${primaryTarget.title}.`;
        break;
      case "Startup Ops":
        why = `Recommended work lane is Startup Ops: emphasizes organizational execution, agile coordination, and operational momentum, anchored by target ${primaryTarget.title}.`;
        break;
      case "Technical Business":
        why = `Recommended work lane is Technical Business: bridges quantitative data analysis and strategic decision-making, anchored by target ${primaryTarget.title}.`;
        break;
      case "Design / UI-UX":
        why = `Recommended work lane is Design / UI-UX: focuses on user experience, interface architecture, and creative systems, anchored by target ${primaryTarget.title}.`;
        break;
      default:
        why = `Recommended work lane is ${targetDomain}: anchored by target destination ${primaryTarget.title}.`;
    }
  }

  // Supporting careers: entry role + second-ranked target (distinct references)
  const supportingSet = new Set<string>([primaryTarget.id]);
  const supportingCareers: CareerReference[] = [];

  if (!supportingSet.has(bestEntry.id)) {
    supportingCareers.push({ id: bestEntry.id, title: bestEntry.title });
    supportingSet.add(bestEntry.id);
  }

  for (const opt of longTermOptions) {
    if (!supportingSet.has(opt.career.id)) {
      supportingCareers.push({ id: opt.career.id, title: opt.career.title });
      supportingSet.add(opt.career.id);
      if (supportingCareers.length >= 2) break;
    }
  }

  for (const opt of entryOptions) {
    if (supportingCareers.length >= 3) break;
    if (!supportingSet.has(opt.career.id)) {
      supportingCareers.push({ id: opt.career.id, title: opt.career.title });
      supportingSet.add(opt.career.id);
    }
  }

  return {
    lane: selectedLane,
    why,
    primaryCareer: { id: primaryTarget.id, title: primaryTarget.title },
    supportingCareers,
  };
}

export interface BuildMultiRoleRankingInputs {
  catalog: readonly CareerDefinition[];
  profile: StudentFitProfile;
  context: StudentContext;
  codeAversion: boolean;
  primaryTarget: CareerDefinition | null;
  bestEntry: CareerDefinition | null;
}

/**
 * Builds the complete deterministic multi-role ranking and work lane.
 */
export function buildMultiRoleRanking(inputs: BuildMultiRoleRankingInputs): MultiRoleRanking {
  const { catalog, profile, context, codeAversion, primaryTarget, bestEntry } = inputs;

  if (!primaryTarget || !bestEntry || catalog.length === 0) {
    return {
      longTermOptions: [],
      entryOptions: [],
      recommendedWorkLane: null,
    };
  }

  const family = normalizeDegreeFamily(context.degree);
  const hoursPerWeek = context.availableHoursPerWeek;

  const longTermOptions = rankLongTermOptions(catalog, profile, codeAversion, 5);

  const byId = new Map(catalog.map((c) => [c.id, c]));
  const topTargets = longTermOptions
    .map((opt) => byId.get(opt.career.id))
    .filter((c): c is CareerDefinition => c !== undefined);

  const entryOptions = rankEntryOptions({
    catalog,
    profile,
    family,
    hoursPerWeek,
    codeAversion,
    primaryTarget,
    topLongTermTargets: topTargets,
    limit: 5,
  });

  const recommendedWorkLane = deriveRecommendedWorkLane({
    primaryTarget,
    bestEntry,
    longTermOptions,
    entryOptions,
    profile,
  });

  return {
    longTermOptions,
    entryOptions,
    recommendedWorkLane,
  };
}
