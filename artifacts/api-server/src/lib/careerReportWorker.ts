import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import {
  careerGenerationAttemptsTable,
  careerResultsTable,
  careerStrategiesTable,
  careerSubmissionsTable,
  db,
  institutionsTable,
  pool,
  studentsTable,
} from "@workspace/db";
import type { CareerSubmissionInput } from "@workspace/api-zod";
import {
  careerReportJsonSchema,
  careerReportSchema,
  type CareerReport,
} from "./careerReportSchema";
import { careerMarketContext } from "./careerMarketContext";
import type { StudentContext } from "./studentContext";
import { studentContextPromptLines } from "./studentContext";
import { CAREERS, CATALOG_VERSION } from "./careerStrategy/catalog";
import { buildStrategyExplanation, EXPLANATION_VERSION } from "./careerStrategy/explanation";
import { normalizeAnswers } from "./careerStrategy/fitProfile";
import { buildEntryStrategy } from "./careerStrategy/strategy";
import {
  CANONICAL_ARCHETYPE_DEFINITIONS,
  CANONICAL_ARCHETYPE_NAMES,
  classifyArchetype,
  type CanonicalArchetypeId,
} from "./careerStrategy/archetype";
import {
  attachDeterministicReportFields,
  mergeDeterministicReport,
} from "./careerStrategy/careerDirection";
import type { CareerStrategy, CareerStrategyExplanation } from "./careerStrategy/types";
import { createReportProvider } from "./ai/aiProvider";
import { toStrategyRecord } from "./strategyRecord";
import { describeDatabaseCause, describeGenerationError, describeProviderError, nextAttemptNumber } from "./generationAttempts";
import { logger } from "./logger";
import { globalWorkerRateLimiter } from "./workerRateLimiter";
import { operationalMetrics } from "./operationalMetrics";

const MAX_OUTPUT_TOKENS = 8192;
const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 1_500;
const STALE_JOB_MS = Math.max(
  60_000,
  parseInt(process.env.REPORT_WORKER_STALE_MS || "600000", 10) || 600_000,
);

let activeJobsCount = 0;
let workerStarted = false;
let isShuttingDown = false;
let pollTimer: NodeJS.Timeout | null = null;
let staleRecoveryTimer: NodeJS.Timeout | null = null;
const shutdownWaiters = new Set<() => void>();

export function getActiveJobsCount(): number {
  return activeJobsCount;
}

export function isWorkerRunning(): boolean {
  return workerStarted && !isShuttingDown;
}

export interface ClaimedSubmission {
  id: string;
  attemptCount: number;
  /**
   * Globally increasing attempt number for the attempts table, unique across
   * UI retries. attemptCount stays per-run (retry limit/backoff); this stays
   * unique (UNIQUE(submission_id, attempt) constraint).
   */
  attemptNumber: number;
  answers: CareerSubmissionInput["answers"];
  department: string;
  year: string;
  batch: string;
  studentContext: StudentContext;
  institutionName: string;
  enqueuedAt?: Date;
}

/** Claimed submission plus its deterministic entry strategy. */
export interface ReportJob extends ClaimedSubmission {
  strategy: CareerStrategy;
  explanation: CareerStrategyExplanation;
}

/**
 * Builds the deterministic strategy for a claimed submission. Pure input
 * mapping (the engine itself is pure); exported for verification tests.
 */
export function strategyForSubmission(job: ClaimedSubmission): CareerStrategy {
  return buildEntryStrategy({
    answers: job.answers,
    context: job.studentContext,
    catalog: CAREERS,
  });
}

export interface DeterminedArchetype {
  id: CanonicalArchetypeId;
  name: string;
  definition: string;
  strength: "Strong" | "Moderate" | "Emerging";
  evidence: string[];
}

/**
 * Deterministic work archetype for a claimed submission. Returns null when
 * the answers carry no classifiable signal; the prompt then requires the
 * model to choose only from the five canonical names.
 */
export function archetypeForSubmission(
  job: Pick<ClaimedSubmission, "answers">,
): DeterminedArchetype | null {
  const result = classifyArchetype(job.answers);
  if (!result) return null;
  return {
    id: result.archetype,
    name: CANONICAL_ARCHETYPE_NAMES[result.archetype],
    definition: CANONICAL_ARCHETYPE_DEFINITIONS[result.archetype],
    strength: result.strength,
    evidence: result.evidence,
  };
}
/**
 * Builds the deterministic explanation for a claimed submission from the
 * same strategy inputs. Exported for verification tests.
 */
export function explanationForSubmission(
  job: ClaimedSubmission,
  strategy: CareerStrategy,
): CareerStrategyExplanation {
  return buildStrategyExplanation({
    strategy,
    profile: normalizeAnswers(job.answers),
    context: job.studentContext,
    catalog: CAREERS,
  });
}

export interface ReportParts {
  systemText: string;
  userPayload: unknown;
}

/**
 * Provider-neutral prompt parts. buildReportMessages renders these into the
 * OpenAI chat shape; AI providers consume them directly.
 */
export function buildReportParts(job: ReportJob): ReportParts {
  const determined = archetypeForSubmission(job);
  const archetypeLine = determined
    ? `DETERMINISTIC WORK ARCHETYPE — AUTHORITATIVE. The student's work archetype is "${determined.name}": ${determined.definition} Restate this exact name and definition in the report's workArchetype field. Do not invent a different archetype, personality label, or diagnosis.`
    : `DETERMINISTIC WORK ARCHETYPE — UNAVAILABLE. The answers carry no classifiable work-preference signal. If the report names an approach to work, choose only from: The Practical Builder, The Analytical Solver, The Creative Designer, The People Connector, The Entrepreneurial Operator. Do not invent any other name.`;
  const hours = job.studentContext.availableHoursPerWeek;
  return {
    systemText: [
      "You are a candid, supportive career guide for undergraduate students in India.",
      "Use the student's 13 answers as the primary evidence. Do not invent personal facts or pretend to know the student's background beyond those answers.",
      "Be direct and practical without being cruel, fatalistic, or overly flattering. Do not reward answers that merely sound prestigious.",
      "Distinguish long-term potential from the first realistic job a fresher could obtain. Give a clear bridge between them.",
      ...studentContextPromptLines(job.studentContext),
        "CAREER STRATEGY — DETERMINISTIC SYSTEM OUTPUT. Treat these values as authoritative. Do not replace, recalculate, or contradict them. If insufficientContext is true, do not invent strategy content.",
        "STRATEGY EXPLANATION — DETERMINISTIC AND AUTHORITATIVE. You may use this explanation when describing the strategy, but you must not replace or contradict the strategy.",
        archetypeLine,
        "CAREER DIRECTION CONSISTENCY. The report's target role, entry role, and route must match entryStrategy exactly (targetCareer, bestEntryCareer, routeType). Explain those choices; do not replace them. An explicit student aversion (for example to deep coding) must be visibly weighed when a code-intensive route is still recommended.",
        `STUDENT CONTEXT GROUNDING. The student reported ${hours} hours per week of preparation time in STUDENT CONTEXT. State exactly ${hours} hours wherever availability appears. Never substitute a different number. Scale roadmap workloads to these hours.`,
        "EVIDENCE DISCIPLINE. Support each stated strength or friction with a specific submitted answer. Phrase frictions as testable hypotheses with a small experiment, never as verdicts on discipline, intelligence, technical ability, or potential. An answer alone never proves professional competence.",
        "NO FABRICATION. Do not invent salaries, hiring rates, openings, companies, statistics, qualifications, years of experience, or personal facts beyond the 13 answers and student context.",
      "Use only salary and hiring information explicitly present in market_context. When market_context has no verified salary range, set salaryInrLpa to null; do not estimate or invent salaries. Never invent placement rates, job-posting counts, or other statistics. For fresherDemand use 'Not available in verified market context' when the context provides no hiring data.",
      "Make every recommendation specific, explain why it fits, and name concrete actions. When answers conflict, explain the conflict without treating it as a diagnosis.",
      "Return only the report object matching the required schema.",
    ].join("\n"),
    userPayload: {
      institution: job.institutionName,
      market_context: careerMarketContext,
      academicContext: {
        department: job.department,
        year: job.year,
        batch: job.batch,
      },
      studentContext: {
        degree: job.studentContext.degree,
        graduationYear: job.studentContext.graduationYear,
        availableHoursPerWeek: job.studentContext.availableHoursPerWeek,
      },
      entryStrategy: job.strategy,
      strategyExplanation: job.explanation,
      longTermOptions: job.strategy.longTermOptions,
      entryOptions: job.strategy.entryOptions,
      recommendedWorkLane: job.strategy.recommendedWorkLane,
      answerKey: {
        q1: "Preferred way of working and sources of motivation",
        q2: "Enjoyment of technical work and problem solving",
        q3: "Comfort with ambiguity, risk, and stability",
        q4: "People, communication, and collaboration preferences",
        q5: "Creative interests and preferred work outputs",
        q6: "Strengths and evidence from past work",
        q7: "Tasks the student avoids or finds draining",
        q8: "Learning habits and willingness to practice",
        q9: "Workplace and team preferences",
        q10: "Interest in business, entrepreneurship, or ownership",
        q11: "Career expectations and lifestyle priorities",
        q12: "Current skills, projects, or experience",
        q13: "Anything else the student wants considered",
      },
      answers: job.answers,
      reportRequirements: {
        sections: [
          "section1_profile",
          "section2_strengthsAndWorkingStyle",
          "section3_currentReadiness",
          "section4_longTermAndEntryCareers",
          "section5_careerOptionsCompared",
          "section6_bestFitWorkLane",
          "section7_practicalYearRoadmap",
          "section8_candidMentorNote",
        ],
        section4Rule:
          "Include exactly 5 long-term career options and exactly 5 entry-level options matching entryStrategy.longTermOptions and entryStrategy.entryOptions. Do not add, remove, reorder, or rescore roles. Explain why the deterministic engine selected each role.",
        section5ComparisonRule:
          "Compare the top 3 long-term careers and top 3 entry-level jobs separately (6 roles total, all from Section 4). For each role provide roleInvolves, whyFit, tradeOff, and differentiation.",
        section6LaneRule:
          "Recommend one primary work lane matching entryStrategy.recommendedWorkLane.lane. Explain why it fits, primary career, supporting careers, and entry route following Sections 4 and 5.",
        section7RoadmapRule:
          "Return exactly 5 ordered 12-month milestones building toward the recommended work lane and entry role, with measurable deliverables and actions scaled to available study hours.",
        section8MentorRule:
          "The candid mentor note includes exactly one evidence-based pattern observed, one realistic risk or limitation, and one specific experiment to run.",
        traitsRule:
          "Scores are integers from 1 through 5, with evidence-based reasons.",
        noSkillsGaps:
          "Do not generate the old skillsGaps section; it is removed from the report contract.",
      },
    },
  };
}

export function buildReportMessages(job: ReportJob) {
  const parts = buildReportParts(job);
  return [
    {
      role: "system" as const,
      content: parts.systemText,
    },
    {
      role: "user" as const,
      content: JSON.stringify(parts.userPayload, null, 2),
    },
  ];
}

/**
 * Safely parses and unwraps the JSON report returned by an AI provider.
 * If the model placed the output inside a wrapper key (e.g. `report`,
 * `career_discovery_report`, or `data`), unwraps it before running
 * authoritative Zod validation against `careerReportSchema`.
 */
export function parseReportContent(content: string): CareerReport {
  const rawParsed: unknown = JSON.parse(content);
  const unwrapCandidate =
    rawParsed &&
    typeof rawParsed === "object" &&
    !Array.isArray(rawParsed) &&
    !("profile" in rawParsed)
      ? ((rawParsed as Record<string, unknown>).report ??
        (rawParsed as Record<string, unknown>).career_discovery_report ??
        (rawParsed as Record<string, unknown>).data ??
        rawParsed)
      : rawParsed;
  return careerReportSchema.parse(unwrapCandidate);
}

export async function recoverStaleJobs(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_JOB_MS);

  await db
    .update(careerSubmissionsTable)
    .set({
      status: "pending",
      error: "Retrying report generation after an interrupted attempt.",
      nextAttemptAt: new Date(),
      processingStartedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(careerSubmissionsTable.status, "processing"),
        lte(careerSubmissionsTable.attemptCount, MAX_ATTEMPTS - 1),
        lte(careerSubmissionsTable.processingStartedAt, staleBefore),
      ),
    );

  await db
    .update(careerSubmissionsTable)
    .set({
      status: "failed",
      error: "Report generation did not finish. Please retry your assessment.",
      processingStartedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(careerSubmissionsTable.status, "processing"),
        gte(careerSubmissionsTable.attemptCount, MAX_ATTEMPTS),
        lte(careerSubmissionsTable.processingStartedAt, staleBefore),
      ),
    );
}

async function touchJobHeartbeat(submissionId: string): Promise<void> {
  try {
    await db
      .update(careerSubmissionsTable)
      .set({
        processingStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(careerSubmissionsTable.id, submissionId),
          eq(careerSubmissionsTable.status, "processing"),
        ),
      );
  } catch {
    // Non-fatal heartbeat warning
  }
}

async function claimNextSubmission(): Promise<ClaimedSubmission | null> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: careerSubmissionsTable.id,
        studentId: careerSubmissionsTable.studentId,
        answers: careerSubmissionsTable.answers,
        attemptCount: careerSubmissionsTable.attemptCount,
        createdAt: careerSubmissionsTable.createdAt,
      })
      .from(careerSubmissionsTable)
      .where(
        and(
          eq(careerSubmissionsTable.status, "pending"),
          lte(careerSubmissionsTable.nextAttemptAt, new Date()),
        ),
      )
      .orderBy(asc(careerSubmissionsTable.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!candidate) {
      return null;
    }

    const attemptCount = candidate.attemptCount + 1;
    await tx
      .update(careerSubmissionsTable)
      .set({
        status: "processing",
        attemptCount,
        processingStartedAt: new Date(),
        updatedAt: new Date(),
        error: null,
      })
      .where(eq(careerSubmissionsTable.id, candidate.id));

    const [student] = await tx
      .select({
        department: studentsTable.department,
        year: studentsTable.year,
        batch: studentsTable.batch,
        degree: studentsTable.degree,
        graduationYear: studentsTable.graduationYear,
        availableHoursPerWeek: studentsTable.availableHoursPerWeek,
        institutionName: institutionsTable.name,
      })
      .from(studentsTable)
      .innerJoin(
        institutionsTable,
        eq(studentsTable.institutionId, institutionsTable.id),
      )
      .where(eq(studentsTable.id, candidate.studentId))
      .limit(1);

    if (!student) {
      await tx
        .update(careerSubmissionsTable)
        .set({
          status: "failed",
          error: "The student record could not be found.",
          processingStartedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(careerSubmissionsTable.id, candidate.id));
      return null;
    }

    // Number attempts globally: retries reset attemptCount, so per-run
    // numbers would collide with history on the unique constraint.
    const [maxRow] = await tx
      .select({
        maxAttempt: sql<number | null>`max(${careerGenerationAttemptsTable.attempt})`,
      })
      .from(careerGenerationAttemptsTable)
      .where(eq(careerGenerationAttemptsTable.submissionId, candidate.id));
    const attemptNumber = nextAttemptNumber(maxRow?.maxAttempt ?? null);

    return {
      id: candidate.id,
      attemptCount,
      attemptNumber,
      answers: candidate.answers as CareerSubmissionInput["answers"],
      department: student.department,
      year: student.year,
      batch: student.batch,
      studentContext: {
        degree: student.degree,
        graduationYear: student.graduationYear,
        availableHoursPerWeek: student.availableHoursPerWeek,
      },
      institutionName: student.institutionName,
      enqueuedAt: candidate.createdAt,
    };
  });
}

async function saveFailure(
  job: ClaimedSubmission,
  error: unknown,
): Promise<void> {
  const terminal = job.attemptCount >= MAX_ATTEMPTS;
  const described = describeGenerationError(error);
  const providerDetail = describeProviderError(error);
  const errorMsg = error instanceof Error ? error.message : String(error);
  const is429 = providerDetail.providerErrorStatus === 429 || /429|resource_exhausted|rate limit/i.test(errorMsg);

  // Exponential backoff with jitter to avoid retry storms
  const jitterMs = Math.floor(Math.random() * 2500);
  let retryDelayMs = 0;
  if (!terminal) {
    if (job.attemptCount === 1) {
      retryDelayMs = 30_000 + jitterMs;
    } else if (job.attemptCount === 2) {
      retryDelayMs = 120_000 + jitterMs;
    }
    if (is429) {
      retryDelayMs = Math.max(retryDelayMs, 35_000 + jitterMs);
    }
  }

  if (terminal) {
    operationalMetrics.recordTerminalFailure(described.errorType);
  } else {
    operationalMetrics.recordRetryAttempt(described.errorType);
  }

  await db
    .update(careerSubmissionsTable)
    .set({
      status: terminal ? "failed" : "pending",
      error: terminal
        ? "Report generation failed after several attempts. Please retry."
        : "A temporary issue interrupted report generation. It will retry automatically.",
      nextAttemptAt: new Date(Date.now() + retryDelayMs),
      processingStartedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(careerSubmissionsTable.id, job.id));

  logger.error(
    {
      submissionId: job.id,
      attempt: job.attemptCount,
      attemptNumber: job.attemptNumber,
      errorType: described.errorType,
      errorMessage: described.errorMessage,
      ...(providerDetail.providerErrorDetail
        ? { providerErrorDetail: providerDetail.providerErrorDetail }
        : {}),
      ...(providerDetail.providerErrorStatus !== null
        ? { providerErrorStatus: providerDetail.providerErrorStatus }
        : {}),
      terminal,
      retryDelayMs,
    },
    "Career report generation attempt failed",
  );
}

async function generateReport(job: ClaimedSubmission): Promise<void> {
  // Provider selection is configuration-driven; construction throws a clear
  // error when the selected provider is misconfigured.
  const provider = createReportProvider();

  // Deterministic strategy first; the model receives it as authoritative input.
  const strategy = strategyForSubmission(job);
  const explanation = explanationForSubmission(job, strategy);
  const reportJob: ReportJob = { ...job, strategy, explanation };
  logger.info(
    {
      submissionId: job.id,
      provider: provider.provider,
      routeType: strategy.routeType,
      targetCareer: strategy.targetCareer?.id ?? null,
      bestEntryCareer: strategy.bestEntryCareer?.id ?? null,
      insufficientContext: strategy.insufficientContext,
    },
    "Career entry strategy determined",
  );

  const parts = buildReportParts(reportJob);
  let inputTokens = 0;
  let outputTokens = 0;
  const startTime = Date.now();

  operationalMetrics.recordAiRequestStart();
  const releasePermit = await globalWorkerRateLimiter.acquirePermit();

  try {
    const generation = await provider.generateStructuredReport({
      systemText: parts.systemText,
      userJson: JSON.stringify(parts.userPayload, null, 2),
      schemaName: "career_discovery_report",
      jsonSchema: careerReportJsonSchema,
      maxTokens: MAX_OUTPUT_TOKENS,
    });
    releasePermit();

    inputTokens = generation.inputTokens;
    outputTokens = generation.outputTokens;
    const durationMs = Date.now() - startTime;
    const queueWaitMs = job.enqueuedAt ? Date.now() - job.enqueuedAt.getTime() : undefined;

    operationalMetrics.recordAiSuccess({
      model: provider.model,
      inputTokens,
      outputTokens,
      durationMs,
      queueWaitMs,
    });

    const content = generation.content;
    if (!content) {
      throw new Error("The report model returned no content.");
    }

    const rawParsed: unknown = JSON.parse(content);
    const unwrapCandidate =
      rawParsed &&
      typeof rawParsed === "object" &&
      !Array.isArray(rawParsed) &&
      !("profile" in rawParsed)
        ? ((rawParsed as Record<string, unknown>).report ??
          (rawParsed as Record<string, unknown>).career_discovery_report ??
          (rawParsed as Record<string, unknown>).data ??
          rawParsed)
        : rawParsed;

    if (!unwrapCandidate || typeof unwrapCandidate !== "object" || Array.isArray(unwrapCandidate)) {
      throw new Error("Report content must be an object.");
    }

    // Deterministic post-parse composition & merge:
    // The deterministic engine is the author of the 5 long-term and 5 entry-level options,
    // the work lane, transition route, and work archetype. Whatever the model returns is merged
    // and strictly enforced with authoritative deterministic values.
    const merged = mergeDeterministicReport(
      unwrapCandidate as Record<string, any>,
      strategy,
      explanation,
      job.answers,
      job.studentContext,
      CAREERS,
    );

    // Verify the merged report strictly satisfies the canonical report contract.
    const report = careerReportSchema.parse(merged);

    await db.transaction(async (tx) => {
      await tx.insert(careerResultsTable).values({
        submissionId: job.id,
        report,
        archetype: report.profile.archetype,
        workerType: report.profile.workerType,
        clarityLevel: report.profile.clarityLevel,
        recommendedTrack: report.recommendedTrack,
        technicalScore: report.traits.technical.score,
        creativeScore: report.traits.creative.score,
        peopleScore: report.traits.people.score,
        riskScore: report.traits.risk.score,
        learningScore: report.traits.learning.score,
        model: provider.model,
        inputTokens,
        outputTokens,
      });

      await tx.insert(careerGenerationAttemptsTable).values({
        submissionId: job.id,
        attempt: job.attemptNumber,
        model: provider.model,
        inputTokens,
        outputTokens,
        succeeded: true,
      });

      // Persist the exact deterministic strategy + explanation used above,
      // atomically with the report: a report never exists without its
      // strategy, and retries deterministically upsert identical values.
      const strategyRecord = toStrategyRecord(job.id, strategy, explanation, {
        strategyVersion: CATALOG_VERSION,
        explanationVersion: EXPLANATION_VERSION,
      });
      await tx
        .insert(careerStrategiesTable)
        .values(strategyRecord)
        .onConflictDoUpdate({
          target: careerStrategiesTable.submissionId,
          set: { ...strategyRecord, generatedAt: new Date() },
        });

      await tx
        .update(careerSubmissionsTable)
        .set({
          status: "done",
          error: null,
          processingStartedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(careerSubmissionsTable.id, job.id));
    });
  } catch (error) {
    releasePermit();
    const providerDetail = describeProviderError(error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    const is429 = providerDetail.providerErrorStatus === 429 || /429|resource_exhausted|rate limit/i.test(errorMsg);

    if (is429) {
      globalWorkerRateLimiter.reportRateLimit();
    }
    operationalMetrics.recordAiError(error, providerDetail.providerErrorStatus ?? (is429 ? 429 : undefined));

    await db.insert(careerGenerationAttemptsTable).values({
      submissionId: job.id,
      attempt: job.attemptNumber,
      model: provider.model,
      inputTokens,
      outputTokens,
      succeeded: false,
      errorType: describeGenerationError(error).errorType,
    });
    throw error;
  }
}

async function processClaimedJob(job: ClaimedSubmission): Promise<void> {
  // Heartbeat updates processingStartedAt every 20s so long generations are never marked stale
  const heartbeat = setInterval(() => {
    void touchJobHeartbeat(job.id);
  }, 20_000);
  heartbeat.unref();

  try {
    await generateReport(job);
    logger.info(
      { submissionId: job.id, attempt: job.attemptCount, attemptNumber: job.attemptNumber },
      "Career report generated",
    );
  } catch (error) {
    await saveFailure(job, error);
  } finally {
    clearInterval(heartbeat);
  }
}

let isDispatching = false;
let dispatchQueued = false;

async function dispatchAvailableJobs(): Promise<void> {
  if (isShuttingDown || !workerStarted) {
    return;
  }
  if (isDispatching) {
    dispatchQueued = true;
    return;
  }
  isDispatching = true;

  try {
    do {
      dispatchQueued = false;
      const maxConcurrency = globalWorkerRateLimiter.getConcurrencyLimit();

      while (!isShuttingDown && activeJobsCount < maxConcurrency) {
        let job: ClaimedSubmission | null = null;
        try {
          job = await claimNextSubmission();
        } catch (claimErr) {
          const described = describeGenerationError(claimErr);
          const dbCause = describeDatabaseCause(claimErr);
          logger.error(
            {
              errorType: described.errorType,
              ...(dbCause.dbErrorCode ? { dbErrorCode: dbCause.dbErrorCode } : {}),
              ...(dbCause.dbErrorMessage ? { dbErrorMessage: dbCause.dbErrorMessage } : {}),
            },
            "Failed to claim next submission from queue",
          );
          break;
        }

        if (!job) {
          break; // No pending due submissions right now
        }

        activeJobsCount++;
        const currentJob = job;

        void (async () => {
          try {
            await processClaimedJob(currentJob);
          } finally {
            activeJobsCount = Math.max(0, activeJobsCount - 1);
            if (activeJobsCount === 0 && isShuttingDown) {
              for (const resolve of shutdownWaiters) resolve();
              shutdownWaiters.clear();
            }
            if (!isShuttingDown) {
              void dispatchAvailableJobs();
            }
          }
        })();
      }
    } while (dispatchQueued && !isShuttingDown && activeJobsCount < globalWorkerRateLimiter.getConcurrencyLimit());
  } finally {
    isDispatching = false;
  }
}

export function startCareerReportWorker(): void {
  if (workerStarted) {
    return;
  }
  workerStarted = true;
  isShuttingDown = false;

  // Validate the configured AI provider up front so a misconfigured server
  // fails fast with a clear error instead of dequeuing work it cannot do.
  const provider = createReportProvider();

  // Run initial stale recovery, then dispatch any pending jobs
  void recoverStaleJobs();
  void dispatchAvailableJobs();

  pollTimer = setInterval(() => void dispatchAvailableJobs(), POLL_INTERVAL_MS);
  pollTimer.unref();

  staleRecoveryTimer = setInterval(() => void recoverStaleJobs(), 60_000);
  staleRecoveryTimer.unref();

  logger.info(
    {
      provider: provider.provider,
      model: provider.model,
      concurrency: globalWorkerRateLimiter.getConcurrencyLimit(),
      rpm: globalWorkerRateLimiter.getRpmLimit(),
    },
    "Career report worker started",
  );
}

export async function stopCareerReportWorker(timeoutMs: number = 30_000): Promise<void> {
  if (!workerStarted || isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.info({ activeJobs: activeJobsCount }, "Stopping career report worker, waiting for in-flight jobs...");

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (staleRecoveryTimer) {
    clearInterval(staleRecoveryTimer);
    staleRecoveryTimer = null;
  }

  if (activeJobsCount > 0) {
    await Promise.race([
      new Promise<void>((resolve) => {
        shutdownWaiters.add(resolve);
      }),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  workerStarted = false;
  logger.info("Career report worker stopped cleanly");
}

export async function closeCareerReportWorker(): Promise<void> {
  await stopCareerReportWorker();
  await pool.end();
}
