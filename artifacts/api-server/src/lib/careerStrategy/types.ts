/**
 * Batch 2 — Deterministic career entry strategy: shared types.
 *
 * Pure type definitions only (no imports, no runtime). The strategy engine
 * separates long-term CAREER FIT from realistic CAREER ENTRY.
 */

export type AccessibilityLevel =
  | "VERY_LOW"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH";

export type DegreeAlignment = "STRONG" | "MODERATE" | "NEUTRAL" | "WEAK";

export type DegreeFamily =
  | "CS_IT_DATA"
  | "ENGINEERING"
  | "BUSINESS_COMMERCE"
  | "DESIGN"
  | "ARTS_HUMANITIES"
  | "SCIENCE"
  | "OTHER";

export type RouteType = "DIRECT" | "ADJACENT" | "BRIDGE";

export type FitDimension =
  | "analytical"
  | "technical"
  | "creative"
  | "people"
  | "communication"
  | "structure"
  | "autonomy"
  | "product"
  | "business"
  | "execution";

export const FIT_DIMENSIONS: readonly FitDimension[] = [
  "analytical",
  "technical",
  "creative",
  "people",
  "communication",
  "structure",
  "autonomy",
  "product",
  "business",
  "execution",
];

/** Normalized 0..1 fit signals derived deterministically from the 13Q answers. */
export type StudentFitProfile = Record<FitDimension, number>;

export interface CareerDefinition {
  id: string;
  title: string;
  category: string;
  /** Fresher accessibility: internal ranking heuristic, NOT a hiring probability. */
  accessibility: AccessibilityLevel;
  degreeStrong: DegreeFamily[];
  degreeModerate: DegreeFamily[];
  degreeWeak: DegreeFamily[];
  /** Focused preparation hours to become reasonably entry-ready (heuristic). */
  runwayHours: number;
  /**
   * How code-intensive day-to-day work in this career typically is (0..1,
   * heuristic). Used only to weigh an explicit student aversion to deep
   * coding during ENTRY evaluation — never for target selection.
   */
  codeIntensity: number;
  /** Long-term target suitability, 1..5. */
  targetPotential: number;
  /** Dimension weights 0..1 describing what the career rewards. */
  fitWeights: Partial<Record<FitDimension, number>>;
  /** Career ids that are credible first-job wedges toward this target. */
  entryCandidates: string[];
  /** Career ids that can serve as an intermediate step toward this target. */
  bridgeCandidates: string[];
}

export interface CareerReference {
  id: string;
  title: string;
}

export interface StrategyRationale {
  target: string;
  entry: string;
  bridge: string | null;
  academic: string;
  time: string;
}

export type WorkLaneId =
  | "Engineering"
  | "Product"
  | "Automation"
  | "Startup Ops"
  | "Technical Business"
  | "Design / UI-UX"
  | "Hybrid Tech-Generalist";

export const WORK_LANE_IDS: readonly WorkLaneId[] = [
  "Engineering",
  "Product",
  "Automation",
  "Startup Ops",
  "Technical Business",
  "Design / UI-UX",
  "Hybrid Tech-Generalist",
];

export interface RankedCareerOption {
  career: CareerReference;
  category: string;
  score: number;
  fitScore: number;
  rationale: string;
  accessibility?: AccessibilityLevel;
  alignment?: DegreeAlignment;
  runwayWeeks?: number;
}

export interface RecommendedWorkLane {
  lane: WorkLaneId;
  why: string;
  primaryCareer: CareerReference;
  supportingCareers: CareerReference[];
}

export interface MultiRoleRanking {
  longTermOptions: RankedCareerOption[];
  entryOptions: RankedCareerOption[];
  recommendedWorkLane: RecommendedWorkLane | null;
}

export interface CareerStrategy {
  targetCareer: CareerReference | null;
  bestEntryCareer: CareerReference | null;
  bridgeCareer: CareerReference | null;
  alternativeRoute: CareerReference | null;
  routeType: RouteType | null;
  rationale: StrategyRationale;
  insufficientContext: boolean;
  longTermOptions?: RankedCareerOption[];
  entryOptions?: RankedCareerOption[];
  recommendedWorkLane?: RecommendedWorkLane | null;
}

/**
 * Batch 3 — Deterministic, student-readable explanation of a CareerStrategy.
 * Every section is generated from actual strategy inputs; nothing is
 * invented. bridge/alternative are null exactly when the strategy has none.
 */
export interface CareerStrategyExplanation {
  target: string;
  entry: string;
  route: string;
  academic: string;
  time: string;
  bridge: string | null;
  alternative: string | null;
}
