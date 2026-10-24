/**
 * Privacy-safe operational metrics for the Career Pathfinder report queue and workers.
 *
 * Tracks queue depths, latencies, provider rate-limit/error counters, token usage,
 * and database connection pool saturation. Strictly excludes student personal data,
 * answers, prompts, and report contents.
 */
import { and, count, eq, lte, min, sql } from "drizzle-orm";
import {
  careerGenerationAttemptsTable,
  careerSubmissionsTable,
  db,
  getPoolStats,
} from "@workspace/db";

export interface OperationalMetricsSnapshot {
  timestamp: string;
  queue: {
    pending: number;
    processing: number;
    done: number;
    failed: number;
    total: number;
    oldestPendingAgeSeconds: number | null;
  };
  throughput: {
    completedPastHour: number;
    reportsPerMinuteEstimate: number;
  };
  latency: {
    avgWaitTimeMs: number;
    avgGenerationDurationMs: number;
    lastGenerationDurationMs: number | null;
  };
  provider: {
    requestsTotal: number;
    successTotal: number;
    rateLimit429Total: number;
    serverError5xxTotal: number;
    otherErrorsTotal: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    tokensByModel: Record<string, { input: number; output: number; count: number }>;
  };
  retries: {
    retryAttemptsTotal: number;
    terminalFailuresTotal: number;
    failureReasons: Record<string, number>;
  };
  database: {
    poolTotal: number;
    poolIdle: number;
    poolWaiting: number;
    poolMax: number;
    poolMin: number;
  };
}

class OperationalMetricsRegistry {
  private requestsTotal = 0;
  private successTotal = 0;
  private rateLimit429Total = 0;
  private serverError5xxTotal = 0;
  private otherErrorsTotal = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private tokensByModel: Record<string, { input: number; output: number; count: number }> = {};

  private generationDurationsMs: number[] = [];
  private waitTimesMs: number[] = [];
  private lastGenerationDurationMs: number | null = null;

  private retryAttemptsTotal = 0;
  private terminalFailuresTotal = 0;
  private failureReasons: Record<string, number> = {};

  recordAiRequestStart(): void {
    this.requestsTotal += 1;
  }

  recordAiSuccess(args: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    queueWaitMs?: number;
  }): void {
    this.successTotal += 1;
    this.totalInputTokens += args.inputTokens;
    this.totalOutputTokens += args.outputTokens;
    this.lastGenerationDurationMs = args.durationMs;

    // Keep rolling sample for latency calculations (last 200 items)
    this.generationDurationsMs.push(args.durationMs);
    if (this.generationDurationsMs.length > 200) {
      this.generationDurationsMs.shift();
    }

    if (args.queueWaitMs !== undefined && args.queueWaitMs >= 0) {
      this.waitTimesMs.push(args.queueWaitMs);
      if (this.waitTimesMs.length > 200) {
        this.waitTimesMs.shift();
      }
    }

    const modelRecord = this.tokensByModel[args.model] ?? { input: 0, output: 0, count: 0 };
    modelRecord.input += args.inputTokens;
    modelRecord.output += args.outputTokens;
    modelRecord.count += 1;
    this.tokensByModel[args.model] = modelRecord;
  }

  recordAiError(error: unknown, status?: number): void {
    const errorStatus = status ?? (error as { status?: number })?.status;
    const msg = error instanceof Error ? error.message : String(error);

    if (errorStatus === 429 || /429|resource_exhausted|rate limit/i.test(msg)) {
      this.rateLimit429Total += 1;
    } else if (errorStatus && errorStatus >= 500 && errorStatus < 600) {
      this.serverError5xxTotal += 1;
    } else {
      this.otherErrorsTotal += 1;
    }
  }

  recordRetryAttempt(reason: string): void {
    this.retryAttemptsTotal += 1;
    this.failureReasons[reason] = (this.failureReasons[reason] ?? 0) + 1;
  }

  recordTerminalFailure(reason: string): void {
    this.terminalFailuresTotal += 1;
    this.failureReasons[reason] = (this.failureReasons[reason] ?? 0) + 1;
  }

  getAverages() {
    const avgGen = this.generationDurationsMs.length > 0
      ? Math.round(this.generationDurationsMs.reduce((a, b) => a + b, 0) / this.generationDurationsMs.length)
      : 0;
    const avgWait = this.waitTimesMs.length > 0
      ? Math.round(this.waitTimesMs.reduce((a, b) => a + b, 0) / this.waitTimesMs.length)
      : 0;
    return { avgGen, avgWait };
  }

  async getSnapshot(): Promise<OperationalMetricsSnapshot> {
    const now = new Date();
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);

    // Query queue aggregate counts from database
    const statusCountsRaw = await db
      .select({
        status: careerSubmissionsTable.status,
        count: count(),
        oldestCreated: min(careerSubmissionsTable.createdAt),
      })
      .from(careerSubmissionsTable)
      .groupBy(careerSubmissionsTable.status);

    const counts: Record<string, number> = {
      pending: 0,
      processing: 0,
      done: 0,
      failed: 0,
    };
    let oldestPendingDate: Date | null = null;

    for (const row of statusCountsRaw) {
      counts[row.status] = Number(row.count);
      if (row.status === "pending" && row.oldestCreated) {
        oldestPendingDate = new Date(row.oldestCreated);
      }
    }

    const totalSubmissions = counts.pending + counts.processing + counts.done + counts.failed;
    const oldestPendingAgeSeconds = oldestPendingDate
      ? Math.max(0, Math.floor((now.getTime() - oldestPendingDate.getTime()) / 1000))
      : null;

    // Recent throughput: count completed in the last hour
    const [recentDone] = await db
      .select({ count: count() })
      .from(careerSubmissionsTable)
      .where(
        and(
          eq(careerSubmissionsTable.status, "done"),
          sql`${careerSubmissionsTable.updatedAt} >= ${oneHourAgo}`,
        ),
      );
    const completedPastHour = Number(recentDone?.count ?? 0);
    const reportsPerMinuteEstimate = completedPastHour > 0
      ? Number((completedPastHour / 60).toFixed(2))
      : 0;

    const { avgGen, avgWait } = this.getAverages();
    const poolStats = getPoolStats();

    return {
      timestamp: now.toISOString(),
      queue: {
        pending: counts.pending,
        processing: counts.processing,
        done: counts.done,
        failed: counts.failed,
        total: totalSubmissions,
        oldestPendingAgeSeconds,
      },
      throughput: {
        completedPastHour,
        reportsPerMinuteEstimate,
      },
      latency: {
        avgWaitTimeMs: avgWait,
        avgGenerationDurationMs: avgGen,
        lastGenerationDurationMs: this.lastGenerationDurationMs,
      },
      provider: {
        requestsTotal: this.requestsTotal,
        successTotal: this.successTotal,
        rateLimit429Total: this.rateLimit429Total,
        serverError5xxTotal: this.serverError5xxTotal,
        otherErrorsTotal: this.otherErrorsTotal,
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        tokensByModel: { ...this.tokensByModel },
      },
      retries: {
        retryAttemptsTotal: this.retryAttemptsTotal,
        terminalFailuresTotal: this.terminalFailuresTotal,
        failureReasons: { ...this.failureReasons },
      },
      database: {
        poolTotal: poolStats.total,
        poolIdle: poolStats.idle,
        poolWaiting: poolStats.waiting,
        poolMax: poolStats.max,
        poolMin: poolStats.min,
      },
    };
  }

  resetForTests(): void {
    this.requestsTotal = 0;
    this.successTotal = 0;
    this.rateLimit429Total = 0;
    this.serverError5xxTotal = 0;
    this.otherErrorsTotal = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.tokensByModel = {};
    this.generationDurationsMs = [];
    this.waitTimesMs = [];
    this.lastGenerationDurationMs = null;
    this.retryAttemptsTotal = 0;
    this.terminalFailuresTotal = 0;
    this.failureReasons = {};
  }
}

export const operationalMetrics = new OperationalMetricsRegistry();
