/**
 * Deterministic career-direction composer.
 *
 * PURE + DETERMINISTIC: builds the report's careerDirection object from the
 * authoritative Batch 2 strategy, the Batch 3 explanation, catalog
 * attributes, and student context. The language model never authors this
 * object — the worker composes it after parsing, so target/entry/route can
 * never drift from the strategy that was actually persisted.
 */
import type { StudentContext } from "../studentContext";
import type {
  CareerDefinition,
  CareerStrategy,
  CareerStrategyExplanation,
} from "./types";
import { alignmentFor, normalizeDegreeFamily } from "./degreeAlignment";
import { estimatedWeeks } from "./strategy";
import {
  CANONICAL_ARCHETYPE_DEFINITIONS,
  CANONICAL_ARCHETYPE_NAMES,
  classifyArchetype,
  type ArchetypeStrength,
} from "./archetype";
import type { CareerSubmissionInput } from "@workspace/api-zod";

export interface DirectionRole {
  title: string;
  why: string;
}

export interface CareerDirectionBlock {
  target: DirectionRole;
  entry: DirectionRole;
  route: "DIRECT" | "ADJACENT" | "BRIDGE";
  routeWhy: string;
  barriers: string[];
  alternativesNote: string | null;
}

export interface DeterminedWorkArchetype {
  name: string;
  definition: string;
  strength: ArchetypeStrength;
  evidence: string[];
}

export interface DeterministicReportFields {
  workArchetype: DeterminedWorkArchetype | null;
  careerDirection: CareerDirectionBlock | null;
}

/**
 * Code-owned report fields, composed AFTER the model response is parsed.
 * Whatever the model wrote for these shapes is replaced with deterministic
 * values, so generated prose can never drift from the persisted strategy.
 * Exported for verification tests; used by the worker before persistence.
 */
export function attachDeterministicReportFields(
  answers: CareerSubmissionInput["answers"],
  strategy: CareerStrategy,
  explanation: CareerStrategyExplanation,
  context: StudentContext,
  catalog: readonly CareerDefinition[],
): DeterministicReportFields {
  const classification = classifyArchetype(answers);
  return {
    workArchetype: classification
      ? {
          name: CANONICAL_ARCHETYPE_NAMES[classification.archetype],
          definition: CANONICAL_ARCHETYPE_DEFINITIONS[classification.archetype],
          strength: classification.strength,
          evidence: classification.evidence,
        }
      : null,
    careerDirection: composeCareerDirection(strategy, explanation, catalog, context),
  };
}

/**
 * Merges authoritative deterministic values with model-generated prose.
 *
 * The deterministic engine owns:
 * - 5 long-term options and 5 entry-level options (IDs, ranks 1..5, scores, fitScores, accessibility, alignment, runwayWeeks).
 * - Comparison entry role IDs and titles (strictly top 3 long-term and top 3 entry roles from Section 4).
 * - Work lane recommendation (lane, primary career, supporting careers, entry route).
 * - Work archetype and career direction blocks.
 *
 * The model provides:
 * - Explanatory prose and rationales.
 * - Section 5 comparison analysis (roleInvolves, whyFit, tradeOff, differentiation).
 * - Section 6 lane fit explanation following sections 4 & 5.
 * - Section 7 12-month roadmap deliverables and actions.
 * - Section 8 mentor note (1 pattern, 1 risk, 1 experiment).
 */
export function mergeDeterministicReport<T extends Record<string, any>>(
  parsed: T,
  strategy: CareerStrategy,
  explanation: CareerStrategyExplanation,
  answers: CareerSubmissionInput["answers"],
  context: StudentContext,
  catalog: readonly CareerDefinition[],
): T & {
  workArchetype: ReturnType<typeof attachDeterministicReportFields>["workArchetype"];
  careerDirection: ReturnType<typeof attachDeterministicReportFields>["careerDirection"];
  longTermOptions: Array<{ id: string; title: string; category: string; rank: number; score: number; fitScore: number; rationale: string }>;
  entryOptions: Array<{ id: string; title: string; category: string; rank: number; score: number; fitScore: number; accessibility: any; alignment: any; runwayWeeks: number; rationale: string }>;
  careerComparison: { longTerm: any[]; entryLevel: any[] };
  recommendedWorkLane: any;
  recommendedTrack: string;
  roadmap: any;
  mentorNote: any;
} {
  const { workArchetype, careerDirection } = attachDeterministicReportFields(
    answers,
    strategy,
    explanation,
    context,
    catalog,
  );

  // Section 4: Long-Term Career Options (Top 5)
  const deterministicLongTerm =
    strategy.longTermOptions && strategy.longTermOptions.length >= 5
      ? strategy.longTermOptions
      : catalog
          .filter((c) => c.targetPotential >= 3)
          .slice(0, 5)
          .map((c, i) => ({
            career: c,
            category: c.category,
            score: 85 - i * 5,
            fitScore: 85 - i * 5,
            rationale: `Selected from deterministic career catalog for ${c.title}.`,
          }));
  const longTermOptions = deterministicLongTerm.slice(0, 5).map((opt, i) => {
    const modelEntry = parsed.longTermOptions?.find(
      (m: any) => m.id === opt.career.id || m.title === opt.career.title,
    ) ?? parsed.longTermOptions?.[i];
    const rationale =
      typeof modelEntry?.rationale === "string" && modelEntry.rationale.trim().length > 0
        ? modelEntry.rationale.trim()
        : opt.rationale;
    return {
      id: opt.career.id,
      title: opt.career.title,
      category: opt.category,
      rank: i + 1,
      score: opt.score,
      fitScore: opt.fitScore,
      rationale,
    };
  });

  // Section 4: Entry-Level Job Options (Top 5)
  const deterministicEntry =
    strategy.entryOptions && strategy.entryOptions.length >= 5
      ? strategy.entryOptions
      : catalog
          .filter((c) => c.accessibility !== "LOW" && c.accessibility !== "VERY_LOW")
          .slice(0, 5)
          .map((c, i) => ({
            career: c,
            category: c.category,
            score: 90 - i * 5,
            fitScore: 88 - i * 5,
            accessibility: c.accessibility,
            alignment: "STRONG" as const,
            runwayWeeks: 12,
            rationale: `Selected from deterministic entry catalog for ${c.title}.`,
          }));
  const entryOptions = deterministicEntry.slice(0, 5).map((opt, i) => {
    const modelEntry = parsed.entryOptions?.find(
      (m: any) => m.id === opt.career.id || m.title === opt.career.title,
    ) ?? parsed.entryOptions?.[i];
    const rationale =
      typeof modelEntry?.rationale === "string" && modelEntry.rationale.trim().length > 0
        ? modelEntry.rationale.trim()
        : opt.rationale;
    return {
      id: opt.career.id,
      title: opt.career.title,
      category: opt.category,
      rank: i + 1,
      score: opt.score,
      fitScore: opt.fitScore,
      accessibility: opt.accessibility ?? ("MODERATE" as const),
      alignment: opt.alignment ?? ("MODERATE" as const),
      runwayWeeks: opt.runwayWeeks ?? 12,
      rationale,
    };
  });

  // Section 5: Career Options Compared (Top 3 Long-Term & Top 3 Entry-Level)
  const top3LongTerm = longTermOptions.slice(0, 3);
  const top3Entry = entryOptions.slice(0, 3);

  const comparedLongTerm = top3LongTerm.map((role, i) => {
    const modelItem = parsed.careerComparison?.longTerm?.find(
      (m: any) => m.id === role.id || m.title === role.title,
    ) ?? parsed.careerComparison?.longTerm?.[i];
    return {
      id: role.id,
      title: role.title,
      roleInvolves:
        typeof modelItem?.roleInvolves === "string" && modelItem.roleInvolves.trim().length > 0
          ? modelItem.roleInvolves.trim()
          : `Core responsibilities and professional deliverables in ${role.title}.`,
      whyFit:
        typeof modelItem?.whyFit === "string" && modelItem.whyFit.trim().length > 0
          ? modelItem.whyFit.trim()
          : role.rationale,
      tradeOff:
        typeof modelItem?.tradeOff === "string" && modelItem.tradeOff.trim().length > 0
          ? modelItem.tradeOff.trim()
          : "Demands sustained skill mastery and competitive focus.",
      differentiation:
        typeof modelItem?.differentiation === "string" && modelItem.differentiation.trim().length > 0
          ? modelItem.differentiation.trim()
          : "Distinctive trajectory compared to other top-ranked destinations.",
    };
  });

  const comparedEntryLevel = top3Entry.map((role, i) => {
    const modelItem = parsed.careerComparison?.entryLevel?.find(
      (m: any) => m.id === role.id || m.title === role.title,
    ) ?? parsed.careerComparison?.entryLevel?.[i];
    return {
      id: role.id,
      title: role.title,
      roleInvolves:
        typeof modelItem?.roleInvolves === "string" && modelItem.roleInvolves.trim().length > 0
          ? modelItem.roleInvolves.trim()
          : `Practical operational tasks and day-to-day execution in ${role.title}.`,
      whyFit:
        typeof modelItem?.whyFit === "string" && modelItem.whyFit.trim().length > 0
          ? modelItem.whyFit.trim()
          : role.rationale,
      tradeOff:
        typeof modelItem?.tradeOff === "string" && modelItem.tradeOff.trim().length > 0
          ? modelItem.tradeOff.trim()
          : "Initial execution-focused workload before reaching higher leverage.",
      differentiation:
        typeof modelItem?.differentiation === "string" && modelItem.differentiation.trim().length > 0
          ? modelItem.differentiation.trim()
          : "Provides immediate, accessible market entry aligned with preparation runway.",
    };
  });

  // Section 6: Recommended Work Lane
  const fallbackTarget = strategy.targetCareer ?? { id: "software-engineer", title: "Software Engineer" };
  const fallbackLane = strategy.recommendedWorkLane?.lane ?? "Hybrid Tech-Generalist";
  const primaryCareer = strategy.recommendedWorkLane?.primaryCareer ?? fallbackTarget;
  const supportingCareers = strategy.recommendedWorkLane?.supportingCareers ?? [];
  const entryRoute = {
    routeType: strategy.routeType ?? ("DIRECT" as const),
    entryCareer: strategy.bestEntryCareer ?? primaryCareer,
    bridgeCareer: strategy.bridgeCareer ?? null,
    rationale:
      typeof parsed.recommendedWorkLane?.entryRoute?.rationale === "string" &&
      parsed.recommendedWorkLane.entryRoute.rationale.trim().length > 0
        ? parsed.recommendedWorkLane.entryRoute.rationale.trim()
        : explanation.route || strategy.rationale.entry,
  };

  const recommendedWorkLane = {
    lane: fallbackLane,
    why:
      typeof parsed.recommendedWorkLane?.why === "string" && parsed.recommendedWorkLane.why.trim().length > 0
        ? parsed.recommendedWorkLane.why.trim()
        : (strategy.recommendedWorkLane?.why ?? `Directly aligns with demonstrated fit in ${primaryCareer.title}.`),
    primaryCareer,
    supportingCareers,
    entryRoute,
    explanation:
      typeof parsed.recommendedWorkLane?.explanation === "string" &&
      parsed.recommendedWorkLane.explanation.trim().length > 0
        ? parsed.recommendedWorkLane.explanation.trim()
        : explanation.route || `Follows the options evaluated in Sections 4 and 5 toward ${primaryCareer.title}.`,
  };

  // Section 7: Roadmap (Ensure 5 ordered milestones)
  const defaultRanges = ["Months 1-2", "Months 3-4", "Months 5-6", "Months 7-9", "Months 10-12"];
  const roadmap = Array.from({ length: 5 }, (_, i) => {
    const step = Array.isArray(parsed.roadmap) ? parsed.roadmap[i] : undefined;
    return {
      order: i + 1,
      monthRange:
        typeof step?.monthRange === "string" && step.monthRange.trim().length > 0
          ? step.monthRange.trim()
          : defaultRanges[i],
      focus:
        typeof step?.focus === "string" && step.focus.trim().length > 0
          ? step.focus.trim()
          : `Milestone ${i + 1}: ${fallbackLane} Foundations`,
      actions:
        Array.isArray(step?.actions) && step.actions.length > 0
          ? step.actions.map(String)
          : ["Complete foundational coursework and practical exercises."],
      measurableOutputs:
        Array.isArray(step?.measurableOutputs) && step.measurableOutputs.length > 0
          ? step.measurableOutputs.map(String)
          : ["Documented proof of completion and initial portfolio project."],
    };
  });

  // Section 8: Mentor Note
  const mentorNote = {
    observedPattern:
      typeof parsed.mentorNote?.observedPattern === "string" && parsed.mentorNote.observedPattern.trim().length > 0
        ? parsed.mentorNote.observedPattern.trim()
        : "Consistent pattern observed across assessment answers.",
    realisticRisk:
      typeof parsed.mentorNote?.realisticRisk === "string" && parsed.mentorNote.realisticRisk.trim().length > 0
        ? parsed.mentorNote.realisticRisk.trim()
        : "Key challenge requiring proactive preparation.",
    actionableExperiment:
      typeof parsed.mentorNote?.actionableExperiment === "string" &&
      parsed.mentorNote.actionableExperiment.trim().length > 0
        ? parsed.mentorNote.actionableExperiment.trim()
        : "Concrete experiment to validate interest and fit.",
  };

  // Section 3: Caliber vs Entry (Ensure firstEntryRoles matches authoritative entryOptions)
  const authoritativeWedges = entryOptions.slice(0, 3).map((e) => e.title);
  const caliberVsEntry = parsed.caliberVsEntry
    ? {
        ...parsed.caliberVsEntry,
        firstEntryRoles:
          authoritativeWedges.length > 0
            ? authoritativeWedges
            : parsed.caliberVsEntry.firstEntryRoles,
      }
    : parsed.caliberVsEntry;

  // Unify canonical report profile archetype with deterministic work archetype if classified
  const profile = parsed.profile
    ? {
        ...parsed.profile,
        archetype: workArchetype?.name ?? parsed.profile.archetype,
      }
    : parsed.profile;

  return {
    ...parsed,
    profile,
    caliberVsEntry,
    workArchetype,
    careerDirection,
    longTermOptions,
    entryOptions,
    careerComparison: {
      longTerm: comparedLongTerm,
      entryLevel: comparedEntryLevel,
    },
    recommendedWorkLane,
    recommendedTrack: fallbackLane,
    roadmap,
    mentorNote,
  };
}

/**
 * Deterministic entry barriers grounded in catalog attributes and context.
 * Empty when the target is directly accessible with a short runway.
 */
export function deriveBarriers(
  target: CareerDefinition,
  hoursPerWeek: number,
  family: ReturnType<typeof normalizeDegreeFamily>,
): string[] {
  const barriers: string[] = [];
  if (target.accessibility === "VERY_LOW" || target.accessibility === "LOW") {
    barriers.push(
      `Direct entry into ${target.title} is limited, which is why the strategy favors a staged entry route.`,
    );
  }
  const weeks = estimatedWeeks(target.runwayHours, Math.max(1, hoursPerWeek));
  if (weeks > 26) {
    barriers.push(
      `Reaching entry-readiness for ${target.title} takes sustained preparation (roughly ${Math.round(weeks)} weeks at ${hoursPerWeek} hours per week).`,
    );
  }
  if (alignmentFor(target, family) === "WEAK") {
    barriers.push(
      `A ${family} background is not closely aligned with ${target.title}, so preparation should emphasize the listed entry role first.`,
    );
  }
  return barriers;
}

export function composeCareerDirection(
  strategy: CareerStrategy,
  explanation: CareerStrategyExplanation,
  catalog: readonly CareerDefinition[],
  context: StudentContext,
): CareerDirectionBlock | null {
  if (
    strategy.insufficientContext ||
    !strategy.targetCareer ||
    !strategy.bestEntryCareer ||
    !strategy.routeType
  ) {
    return null;
  }
  const byId = new Map(catalog.map((career) => [career.id, career]));
  const targetDef = byId.get(strategy.targetCareer.id);
  const entryDef = byId.get(strategy.bestEntryCareer.id);
  if (!targetDef || !entryDef) return null;

  const family = normalizeDegreeFamily(context.degree);
  return {
    target: { title: strategy.targetCareer.title, why: explanation.target },
    entry: { title: strategy.bestEntryCareer.title, why: explanation.entry },
    route: strategy.routeType,
    routeWhy: explanation.route,
    barriers: deriveBarriers(targetDef, context.availableHoursPerWeek, family),
    alternativesNote: strategy.alternativeRoute
      ? `Considered alternative: ${strategy.alternativeRoute.title} — ranked below the primary route.`
      : null,
  };
}
