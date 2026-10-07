import type { CareerReport, SubmissionAnswers } from "./reportSchema.js";

export const MAX_ATTEMPTS = 3;
/** Jobs stuck in `processing` longer than this are requeued (or failed). */
export const STALE_JOB_MS = 15 * 60 * 1000;

export interface ClaimedJob {
  id: string;
  attemptCount: number;
  answers: SubmissionAnswers;
  department: string;
  year: string;
  batch: string;
  institutionName: string;
}

export interface CompletedReport {
  report: CareerReport;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AttemptUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface WorkerStore {
  recoverStaleJobs(now: Date): Promise<void>;
  claimNextJob(now: Date): Promise<ClaimedJob | null>;
  completeJob(jobId: string, completed: CompletedReport): Promise<void>;
  /**
   * Records a failed attempt. Returns whether the job reached its terminal
   * state (no further automatic retries).
   */
  failJob(
    jobId: string,
    attempt: number,
    errorType: string,
    now: Date,
    usage?: AttemptUsage,
  ): Promise<{ terminal: boolean }>;
}

export type LlmGenerate = (job: ClaimedJob) => Promise<CompletedReport>;

// ---------------------------------------------------------------------------
// Retry policy — pure functions so the "3 attempts then failed" guarantee is
// unit-testable. The durable path below must use exactly these.
// ---------------------------------------------------------------------------

export function isTerminalAttempt(attemptCount: number): boolean {
  return attemptCount >= MAX_ATTEMPTS;
}

/** Backoff before the next automatic attempt (ms). 0 when terminal. */
export function retryDelayMs(attemptCount: number): number {
  if (attemptCount <= 1) return 30_000;
  if (attemptCount === 2) return 120_000;
  return 0;
}

/** Absolute retry timestamp for a failed attempt. */
export function nextAttemptAt(
  attemptCount: number,
  nowMs: number = Date.now(),
): Date {
  return new Date(nowMs + retryDelayMs(attemptCount));
}

export function errorTypeOf(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

// ---------------------------------------------------------------------------
// Durable queue drain — safe to run from Vercel cron AND from the poll-pump
// in GET /api/result/:id. Row locking (in the store) prevents two
// invocations from processing the same submission. No in-memory state.
// ---------------------------------------------------------------------------

export async function processOneDueJob(
  store: WorkerStore,
  llm: LlmGenerate,
  now: Date = new Date(),
): Promise<boolean> {
  const job = await store.claimNextJob(now);
  if (!job) {
    return false;
  }
  try {
    const completed = await llm(job);
    await store.completeJob(job.id, completed);
  } catch (error) {
    await store.failJob(
      job.id,
      job.attemptCount,
      errorTypeOf(error),
      now,
      usageOf(error),
    );
  }
  return true;
}

/** Extracts token usage from errors that carry it (e.g. failed validation). */
function usageOf(error: unknown): AttemptUsage | undefined {
  if (error !== null && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (
      typeof record.model === "string" &&
      typeof record.inputTokens === "number" &&
      typeof record.outputTokens === "number"
    ) {
      return {
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
      };
    }
  }
  return undefined;
}

export interface DrainOptions {
  now?: Date;
  /** Stop starting new jobs after this budget elapses (serverless safety). */
  timeBudgetMs?: number;
  /** Maximum jobs per invocation (serverless safety). */
  maxJobs?: number;
}

export async function drainQueue(
  store: WorkerStore,
  llm: LlmGenerate,
  options: DrainOptions = {},
): Promise<{ processed: number }> {
  const { now = new Date(), timeBudgetMs = 240_000, maxJobs = 25 } = options;
  const startedAt = Date.now();
  await store.recoverStaleJobs(now);
  let processed = 0;
  while (processed < maxJobs) {
    if (Date.now() - startedAt > timeBudgetMs) break;
    const didWork = await processOneDueJob(store, llm, new Date());
    if (!didWork) break;
    processed += 1;
  }
  return { processed };
}
