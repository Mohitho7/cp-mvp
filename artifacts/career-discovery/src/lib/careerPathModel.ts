/**
 * Batch 4 — Pure display logic for the Career Path section.
 *
 * The frontend NEVER calculates strategy: it only classifies and orders the
 * persisted API payload for rendering. All functions are pure and unit
 * tested with node:test (no DOM framework exists in this repo).
 */
import type { CareerSubmissionResult } from "@workspace/api-client-react";

export type CareerPathStrategy = NonNullable<CareerSubmissionResult["strategy"]>;

export type CareerPathState =
  | "unavailable"
  | "insufficient"
  | "direct"
  | "adjacent"
  | "bridge";

/** Classifies which Career Path state to render. */
export function getCareerPathState(
  strategy: CareerPathStrategy | null | undefined,
): CareerPathState {
  if (!strategy) return "unavailable";
  if (strategy.insufficientContext) return "insufficient";
  if (!strategy.targetCareer || !strategy.bestEntryCareer) return "unavailable";
  if (strategy.routeType === "DIRECT") return "direct";
  if (strategy.routeType === "BRIDGE" && strategy.bridgeCareer) return "bridge";
  return "adjacent";
}

export interface PathStep {
  kind: "target" | "entry" | "bridge";
  title: string;
}

/**
 * Ordered display steps, target-first. DIRECT merges target+entry into a
 * single step so the UI never renders "X ↓ X".
 */
export function getPathSteps(strategy: CareerPathStrategy): {
  steps: PathStep[];
  mergedTargetEntry: boolean;
} {
  const state = getCareerPathState(strategy);
  if (state === "direct" && strategy.targetCareer) {
    return {
      steps: [{ kind: "target", title: strategy.targetCareer.title }],
      mergedTargetEntry: true,
    };
  }
  const steps: PathStep[] = [];
  if (strategy.targetCareer) {
    steps.push({ kind: "target", title: strategy.targetCareer.title });
  }
  if (state === "bridge" && strategy.bridgeCareer) {
    steps.push({ kind: "bridge", title: strategy.bridgeCareer.title });
  }
  if (strategy.bestEntryCareer && state !== "direct") {
    steps.push({ kind: "entry", title: strategy.bestEntryCareer.title });
  }
  return { steps, mergedTargetEntry: false };
}

export const ROUTE_LABEL: Record<string, string> = {
  DIRECT: "DIRECT",
  ADJACENT: "ADJACENT",
  BRIDGE: "BRIDGE",
};

/** Human route badge label; falls back safely for unknown values. */
export function getRouteLabel(routeType: string | null): string {
  if (!routeType) return "ROUTE UNAVAILABLE";
  return ROUTE_LABEL[routeType] ?? "ROUTE UNAVAILABLE";
}
