import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ---------------------------------------------------------------------------
// Enumerations (single source of truth — keep prompt, seed, dashboard in sync)
// ---------------------------------------------------------------------------

export const WORKER_TYPES = [
  "Specialist",
  "Operator",
  "Builder",
  "Analyst",
  "Communicator",
  "Entrepreneur",
  "Manager",
] as const;

export const CLARITY_LEVELS = ["Clear", "Mixed", "Exploratory"] as const;

export const RECOMMENDED_TRACKS = [
  "Engineering",
  "Product",
  "Automation",
  "Startup Ops",
  "Technical Business",
  "Design / UI-UX",
  "Hybrid Tech-Generalist",
] as const;

export const ROLE_TYPES = ["Stepping-stone", "Long-term fit"] as const;

export const ENTRY_DIFFICULTIES = [
  "Easy to enter",
  "Moderately difficult",
  "Highly competitive",
] as const;

export const CAREER_HEALTH_VALUES = [
  "Stable",
  "Fast-growth",
  "High burnout",
  "Oversaturated",
  "High leverage",
] as const;

export const AI_THREATS = ["Low", "Medium", "High"] as const;

export const TRAIT_LABELS = ["Low", "Medium", "High"] as const;

export const MARKET_BARRIER_LEVELS = ["Low", "Moderate", "High"] as const;

// ---------------------------------------------------------------------------
// Career report schema (what the LLM must return)
// ---------------------------------------------------------------------------

const traitScoreSchema = z.object({
  score: z.number().int().min(1).max(5),
  reason: z.string().max(250),
  label: z.enum(TRAIT_LABELS),
});

export type TraitScore = z.infer<typeof traitScoreSchema>;

const careerProfileSchema = z.object({
  archetype: z.string().max(80),
  workerType: z.enum(WORKER_TYPES),
  clarityLevel: z.enum(CLARITY_LEVELS),
  summary: z.string().max(350),
  strengths: z.array(z.string().max(250)).min(2).max(3),
  risks: z.array(z.string().max(250)).min(2).max(3),
  survivalEnvironment: z.string().max(300),
});

const careerTraitsSchema = z.object({
  technical: traitScoreSchema,
  creative: traitScoreSchema,
  people: traitScoreSchema,
  risk: traitScoreSchema,
  learning: traitScoreSchema,
});

const answerConflictSchema = z.object({
  tag: z.string().max(60),
  text: z.string().max(300),
});

const answerPatternsSchema = z.object({
  clear: z.array(z.string().max(250)).max(5),
  conflicts: z.array(answerConflictSchema).max(5),
  worthExploring: z.array(z.string().max(250)).max(5),
});

const caliberVsEntrySchema = z.object({
  longTermCaliber: z.string().max(350),
  marketBarrier: z.string().max(350),
  marketBarrierLevel: z.enum(MARKET_BARRIER_LEVELS),
  firstEntryRoles: z.array(z.string().max(100)).min(1).max(5),
  bridgePath: z.string().max(350),
});

const salaryRangeSchema = z.object({
  min: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
});

const careerFitSchema = z.object({
  title: z.string().max(120),
  roleType: z.enum(ROLE_TYPES),
  salaryInrLpa: salaryRangeSchema.nullable(),
  entryDifficulty: z.enum(ENTRY_DIFFICULTIES),
  careerHealth: z.enum(CAREER_HEALTH_VALUES),
  aiThreat: z.enum(AI_THREATS),
  naturalFitScore: z.number().int().min(1).max(10),
  dailyWork: z.string().max(300),
  whyFits: z.string().max(300),
  fiveYearGrowth: z.string().max(300),
});

export type CareerFit = z.infer<typeof careerFitSchema>;

const careerToAvoidSchema = z.object({
  title: z.string().max(120),
  why: z.string().max(300),
});

const trackDetailSchema = z.object({
  why: z.string().max(350),
  fresherDemand: z.string().max(150),
  skillsToLearn: z.array(z.string().max(80)).min(4).max(8),
});

const roadmapStepSchema = z.object({
  months: z.string().max(20),
  focus: z.string().max(120),
  actions: z.array(z.string().max(200)).min(1).max(3),
});

export const careerReportSchema = z.object({
  profile: careerProfileSchema,
  traits: careerTraitsSchema,
  answerPatterns: answerPatternsSchema,
  caliberVsEntry: caliberVsEntrySchema,
  careerFits: z.array(careerFitSchema).min(4).max(6),
  careersToAvoid: z.array(careerToAvoidSchema),
  recommendedTrack: z.enum(RECOMMENDED_TRACKS),
  trackDetail: trackDetailSchema,
  roadmap: z.array(roadmapStepSchema).min(5).max(5),
  brutalTruth: z.string().max(500),
});

export type CareerReport = z.infer<typeof careerReportSchema>;

type JsonSchema = Record<string, unknown>;

function makeStrictSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(makeStrictSchema);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const schema = value as JsonSchema;
  const result: JsonSchema = {};
  for (const [key, child] of Object.entries(schema)) {
    result[key] = makeStrictSchema(child);
  }
  if (
    result.type === "object" &&
    result.properties !== null &&
    typeof result.properties === "object" &&
    !Array.isArray(result.properties)
  ) {
    result.required = Object.keys(result.properties as JsonSchema);
    result.additionalProperties = false;
  }
  return result;
}

/** Strict JSON schema sent to the LLM (structured outputs). */
export const careerReportJsonSchema = makeStrictSchema(
  zodToJsonSchema(careerReportSchema, { $refStrategy: "none" }),
) as JsonSchema;

// ---------------------------------------------------------------------------
// Submission input (13 structured answers)
// ---------------------------------------------------------------------------

const answerValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.null(),
]);

export const submissionAnswersSchema = z
  .object({
    q1: answerValueSchema,
    q2: answerValueSchema,
    q3: answerValueSchema,
    q4: answerValueSchema,
    q5: answerValueSchema,
    q6: answerValueSchema,
    q7: answerValueSchema,
    q8: answerValueSchema,
    q9: answerValueSchema,
    q10: answerValueSchema,
    q11: answerValueSchema,
    q12: answerValueSchema,
    q13: z.string().max(2000),
  })
  .strict();

export type SubmissionAnswers = z.infer<typeof submissionAnswersSchema>;

export const submissionInputSchema = z
  .object({
    answers: submissionAnswersSchema,
    department: z.string().max(120),
    year: z.string().max(40),
    batch: z.string().max(40),
    consent: z.literal(true),
  })
  .strict();

export type SubmissionInput = z.infer<typeof submissionInputSchema>;

// ---------------------------------------------------------------------------
// Dashboard contract
// ---------------------------------------------------------------------------

export const distributionCountSchema = z.object({
  label: z.string(),
  count: z.number().int(),
});

export type DistributionCount = z.infer<typeof distributionCountSchema>;

export const traitAveragesSchema = z.object({
  technical: z.number(),
  creative: z.number(),
  people: z.number(),
  risk: z.number(),
  learning: z.number(),
});

export type TraitAverages = z.infer<typeof traitAveragesSchema>;

export const skillCountSchema = z.object({
  skill: z.string(),
  count: z.number().int(),
});

export const conflictCountSchema = z.object({
  tag: z.string(),
  text: z.string(),
  count: z.number().int(),
});

export const statusCountsSchema = z.object({
  pending: z.number().int(),
  processing: z.number().int(),
  done: z.number().int(),
  failed: z.number().int(),
});

export const institutionDashboardSchema = z.object({
  institutionName: z.string(),
  totalStudents: z.number().int(),
  statusCounts: statusCountsSchema,
  completedReports: z.number().int(),
  dataSuppressed: z.boolean(),
  trackDistribution: z.array(distributionCountSchema),
  clarityDistribution: z.array(distributionCountSchema),
  workerTypeDistribution: z.array(distributionCountSchema),
  traitAverages: traitAveragesSchema,
  topSkills: z.array(skillCountSchema),
  topCareers: z.array(distributionCountSchema),
  entryRoles: z.array(distributionCountSchema),
  marketBarrierDistribution: z.array(distributionCountSchema),
  longTermCaliberDistribution: z.array(distributionCountSchema),
  careersToAvoid: z.array(distributionCountSchema),
  commonConflicts: z.array(conflictCountSchema),
  departmentOptions: z.array(z.string()),
  yearOptions: z.array(z.string()),
  batchOptions: z.array(z.string()),
});

export type InstitutionDashboard = z.infer<typeof institutionDashboardSchema>;

export const dashboardFiltersSchema = z.object({
  department: z.string().max(120).optional(),
  year: z.string().max(120).optional(),
  batch: z.string().max(120).optional(),
});

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
