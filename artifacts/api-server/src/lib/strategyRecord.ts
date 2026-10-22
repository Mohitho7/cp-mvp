/**
 * Batch 4 — Pure mapping between the deterministic strategy output and the
 * career_strategies persistence/API shape.
 *
 * No imports, no I/O: round-trips are unit-testable without a database.
 * Nulls stay null; versions travel explicitly; route types pass through a
 * strict allowlist so only DIRECT/ADJACENT/BRIDGE (or null) can persist.
 */
import type {
  CareerStrategy,
  CareerStrategyExplanation,
} from "./careerStrategy/types";

export type PersistedRouteType = "DIRECT" | "ADJACENT" | "BRIDGE";

export interface StrategyVersions {
  strategyVersion: string;
  explanationVersion: string;
}

export interface StrategyReference {
  id: string;
  title: string;
}

export interface StrategyRecordValues {
  submissionId: string;
  strategyVersion: string;
  explanationVersion: string;
  targetCareerId: string | null;
  targetCareerTitle: string | null;
  entryCareerId: string | null;
  entryCareerTitle: string | null;
  bridgeCareerId: string | null;
  bridgeCareerTitle: string | null;
  alternativeCareerId: string | null;
  alternativeCareerTitle: string | null;
  routeType: PersistedRouteType | null;
  insufficientContext: boolean;
  rationaleTarget: string;
  rationaleEntry: string;
  rationaleBridge: string | null;
  rationaleAcademic: string;
  rationaleTime: string;
  explanationTarget: string;
  explanationEntry: string;
  explanationRoute: string;
  explanationAcademic: string;
  explanationTime: string;
  explanationBridge: string | null;
  explanationAlternative: string | null;
}

export interface StrategyApiShape extends StrategyVersions {
  targetCareer: StrategyReference | null;
  bestEntryCareer: StrategyReference | null;
  bridgeCareer: StrategyReference | null;
  alternativeRoute: StrategyReference | null;
  routeType: PersistedRouteType | null;
  rationale: {
    target: string;
    entry: string;
    bridge: string | null;
    academic: string;
    time: string;
  };
  explanation: {
    target: string;
    entry: string;
    route: string;
    academic: string;
    time: string;
    bridge: string | null;
    alternative: string | null;
  };
  insufficientContext: boolean;
}

function toReference(value: { id: string; title: string } | null): StrategyReference | null {
  if (!value) return null;
  return { id: value.id, title: value.title };
}

function toRouteType(value: string | null): PersistedRouteType | null {
  if (value === "DIRECT" || value === "ADJACENT" || value === "BRIDGE") {
    return value;
  }
  return null;
}

/** Flattens engine output into career_strategies insert values. */
export function toStrategyRecord(
  submissionId: string,
  strategy: CareerStrategy,
  explanation: CareerStrategyExplanation,
  versions: StrategyVersions,
): StrategyRecordValues {
  return {
    submissionId,
    strategyVersion: versions.strategyVersion,
    explanationVersion: versions.explanationVersion,
    targetCareerId: strategy.targetCareer?.id ?? null,
    targetCareerTitle: strategy.targetCareer?.title ?? null,
    entryCareerId: strategy.bestEntryCareer?.id ?? null,
    entryCareerTitle: strategy.bestEntryCareer?.title ?? null,
    bridgeCareerId: strategy.bridgeCareer?.id ?? null,
    bridgeCareerTitle: strategy.bridgeCareer?.title ?? null,
    alternativeCareerId: strategy.alternativeRoute?.id ?? null,
    alternativeCareerTitle: strategy.alternativeRoute?.title ?? null,
    routeType: toRouteType(strategy.routeType),
    insufficientContext: strategy.insufficientContext,
    rationaleTarget: strategy.rationale.target,
    rationaleEntry: strategy.rationale.entry,
    rationaleBridge: strategy.rationale.bridge,
    rationaleAcademic: strategy.rationale.academic,
    rationaleTime: strategy.rationale.time,
    explanationTarget: explanation.target,
    explanationEntry: explanation.entry,
    explanationRoute: explanation.route,
    explanationAcademic: explanation.academic,
    explanationTime: explanation.time,
    explanationBridge: explanation.bridge,
    explanationAlternative: explanation.alternative,
  };
}

function pairReference(
  id: string | null,
  title: string | null,
): StrategyReference | null {
  if (!id || !title) return null;
  return { id, title };
}

/** Row shape read back from career_strategies (route arrives as plain text). */
export interface StrategyRowValues
  extends Omit<StrategyRecordValues, "submissionId" | "routeType"> {
  routeType: string | null;
}

/** Rebuilds the API shape from a career_strategies row (or select subset). */
export function toStrategyResponse(row: StrategyRowValues): StrategyApiShape {
  return {
    strategyVersion: row.strategyVersion,
    explanationVersion: row.explanationVersion,
    targetCareer: pairReference(row.targetCareerId, row.targetCareerTitle),
    bestEntryCareer: pairReference(row.entryCareerId, row.entryCareerTitle),
    bridgeCareer: pairReference(row.bridgeCareerId, row.bridgeCareerTitle),
    alternativeRoute: pairReference(row.alternativeCareerId, row.alternativeCareerTitle),
    routeType: toRouteType(row.routeType),
    rationale: {
      target: row.rationaleTarget,
      entry: row.rationaleEntry,
      bridge: row.rationaleBridge,
      academic: row.rationaleAcademic,
      time: row.rationaleTime,
    },
    explanation: {
      target: row.explanationTarget,
      entry: row.explanationEntry,
      route: row.explanationRoute,
      academic: row.explanationAcademic,
      time: row.explanationTime,
      bridge: row.explanationBridge,
      alternative: row.explanationAlternative,
    },
    insufficientContext: row.insufficientContext,
  };
}
