import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import type { SubmissionAnswers } from "./reportSchema.js";
import {
  MAX_ATTEMPTS,
  STALE_JOB_MS,
  isTerminalAttempt,
  nextAttemptAt,
  type ClaimedJob,
  type CompletedReport,
  type WorkerStore,
} from "./worker.js";
import type { OwnedSubmission, StudentRow, SubmissionStore } from "./handlers.js";

type Db = NodePgDatabase<typeof schema>;

export class DrizzleStore implements SubmissionStore, WorkerStore {
  constructor(private readonly db: Db) {}

  // ---------------------------------------------------------------
  // SubmissionStore
  // ---------------------------------------------------------------

  async findStudent(
    institutionId: string,
    clerkUserId: string,
  ): Promise<StudentRow | null> {
    const [row] = await this.db
      .select({
        id: schema.studentsTable.id,
        institutionId: schema.studentsTable.institutionId,
        department: schema.studentsTable.department,
        year: schema.studentsTable.year,
        batch: schema.studentsTable.batch,
      })
      .from(schema.studentsTable)
      .where(
        and(
          eq(schema.studentsTable.institutionId, institutionId),
          eq(schema.studentsTable.clerkUserId, clerkUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async createStudent(input: {
    institutionId: string;
    clerkUserId: string;
    department: string;
    year: string;
    batch: string;
  }): Promise<StudentRow | null> {
    const [row] = await this.db
      .insert(schema.studentsTable)
      .values(input)
      .onConflictDoNothing({
        target: [
          schema.studentsTable.institutionId,
          schema.studentsTable.clerkUserId,
        ],
      })
      .returning({
        id: schema.studentsTable.id,
        institutionId: schema.studentsTable.institutionId,
        department: schema.studentsTable.department,
        year: schema.studentsTable.year,
        batch: schema.studentsTable.batch,
      });
    return row ?? null;
  }

  async updateStudentCohort(
    studentId: string,
    cohort: { department: string; year: string; batch: string },
  ): Promise<void> {
    await this.db
      .update(schema.studentsTable)
      .set({ ...cohort, updatedAt: new Date() })
      .where(eq(schema.studentsTable.id, studentId));
  }

  async findSubmissionByStudent(
    studentId: string,
  ): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: schema.careerSubmissionsTable.id })
      .from(schema.careerSubmissionsTable)
      .where(eq(schema.careerSubmissionsTable.studentId, studentId))
      .limit(1);
    return row ?? null;
  }

  async createSubmission(
    studentId: string,
    answers: SubmissionAnswers,
    consentVersion: string,
  ): Promise<{ id: string; createdAt: Date } | null> {
    const [row] = await this.db
      .insert(schema.careerSubmissionsTable)
      .values({
        studentId,
        answers,
        consentedAt: new Date(),
        consentVersion,
      })
      .onConflictDoNothing({
        target: schema.careerSubmissionsTable.studentId,
      })
      .returning({
        id: schema.careerSubmissionsTable.id,
        createdAt: schema.careerSubmissionsTable.createdAt,
      });
    return row ?? null;
  }

  async getOwnedSubmission(
    clerkUserId: string,
    submissionId?: string,
  ): Promise<OwnedSubmission | null> {
    const filters = [eq(schema.studentsTable.clerkUserId, clerkUserId)];
    if (submissionId) {
      filters.push(eq(schema.careerSubmissionsTable.id, submissionId));
    }
    const [row] = await this.db
      .select({
        id: schema.careerSubmissionsTable.id,
        status: schema.careerSubmissionsTable.status,
        submittedAt: schema.careerSubmissionsTable.createdAt,
        error: schema.careerSubmissionsTable.error,
        report: schema.careerResultsTable.report,
      })
      .from(schema.careerSubmissionsTable)
      .innerJoin(
        schema.studentsTable,
        eq(schema.careerSubmissionsTable.studentId, schema.studentsTable.id),
      )
      .leftJoin(
        schema.careerResultsTable,
        eq(
          schema.careerResultsTable.submissionId,
          schema.careerSubmissionsTable.id,
        ),
      )
      .where(and(...filters))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      submittedAt: row.submittedAt,
      report: (row.report ?? null) as OwnedSubmission["report"],
      error: row.error,
    };
  }

  async requeueFailedSubmission(submissionId: string): Promise<{
    id: string;
    createdAt: Date;
  } | null> {
    const [row] = await this.db
      .update(schema.careerSubmissionsTable)
      .set({
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: new Date(),
        processingStartedAt: null,
        error: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.careerSubmissionsTable.id, submissionId),
          eq(schema.careerSubmissionsTable.status, "failed"),
        ),
      )
      .returning({
        id: schema.careerSubmissionsTable.id,
        createdAt: schema.careerSubmissionsTable.createdAt,
      });
    return row ?? null;
  }

  async checkRateLimit(
    key: string,
    windowStartMs: number,
    windowMs: number,
    max: number,
    now: Date,
  ): Promise<{ allowed: boolean; retryAfterSec: number }> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.submissionRateLimitsTable)
        .where(eq(schema.submissionRateLimitsTable.key, key))
        .limit(1)
        .for("update");
      if (!row || row.windowStart.getTime() < windowStartMs) {
        await tx
          .insert(schema.submissionRateLimitsTable)
          .values({ key, windowStart: new Date(windowStartMs), count: 1 })
          .onConflictDoUpdate({
            target: schema.submissionRateLimitsTable.key,
            set: { windowStart: new Date(windowStartMs), count: 1 },
          });
        return { allowed: true, retryAfterSec: 0 };
      }
      if ((row.count ?? 0) >= max) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil(
            (row.windowStart.getTime() + windowMs - now.getTime()) / 1000,
          ),
        );
        return { allowed: false, retryAfterSec };
      }
      await tx
        .update(schema.submissionRateLimitsTable)
        .set({ count: (row.count ?? 0) + 1 })
        .where(eq(schema.submissionRateLimitsTable.key, key));
      return { allowed: true, retryAfterSec: 0 };
    });
  }

  // ---------------------------------------------------------------
  // WorkerStore
  // ---------------------------------------------------------------

  async recoverStaleJobs(now: Date): Promise<void> {
    const staleBefore = new Date(now.getTime() - STALE_JOB_MS);
    await this.db
      .update(schema.careerSubmissionsTable)
      .set({
        status: "pending",
        error: "Retrying report generation after an interrupted attempt.",
        nextAttemptAt: now,
        processingStartedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.careerSubmissionsTable.status, "processing"),
          lte(schema.careerSubmissionsTable.attemptCount, MAX_ATTEMPTS - 1),
          lte(schema.careerSubmissionsTable.processingStartedAt, staleBefore),
        ),
      );
    await this.db
      .update(schema.careerSubmissionsTable)
      .set({
        status: "failed",
        error: "Report generation did not finish. Please retry your assessment.",
        processingStartedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.careerSubmissionsTable.status, "processing"),
          gte(schema.careerSubmissionsTable.attemptCount, MAX_ATTEMPTS),
          lte(schema.careerSubmissionsTable.processingStartedAt, staleBefore),
        ),
      );
  }

  async claimNextJob(now: Date): Promise<ClaimedJob | null> {
    return this.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({
          id: schema.careerSubmissionsTable.id,
          studentId: schema.careerSubmissionsTable.studentId,
          answers: schema.careerSubmissionsTable.answers,
          attemptCount: schema.careerSubmissionsTable.attemptCount,
        })
        .from(schema.careerSubmissionsTable)
        .where(
          and(
            eq(schema.careerSubmissionsTable.status, "pending"),
            lte(schema.careerSubmissionsTable.nextAttemptAt, now),
          ),
        )
        .orderBy(asc(schema.careerSubmissionsTable.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });

      if (!candidate) return null;

      const attemptCount = candidate.attemptCount + 1;
      await tx
        .update(schema.careerSubmissionsTable)
        .set({
          status: "processing",
          attemptCount,
          processingStartedAt: now,
          updatedAt: now,
          error: null,
        })
        .where(eq(schema.careerSubmissionsTable.id, candidate.id));

      const [student] = await tx
        .select({
          department: schema.studentsTable.department,
          year: schema.studentsTable.year,
          batch: schema.studentsTable.batch,
          institutionName: schema.institutionsTable.name,
        })
        .from(schema.studentsTable)
        .innerJoin(
          schema.institutionsTable,
          eq(schema.studentsTable.institutionId, schema.institutionsTable.id),
        )
        .where(eq(schema.studentsTable.id, candidate.studentId))
        .limit(1);

      if (!student) {
        await tx
          .update(schema.careerSubmissionsTable)
          .set({
            status: "failed",
            error: "The student record could not be found.",
            processingStartedAt: null,
            updatedAt: now,
          })
          .where(eq(schema.careerSubmissionsTable.id, candidate.id));
        return null;
      }

      return {
        id: candidate.id,
        attemptCount,
        answers: candidate.answers as SubmissionAnswers,
        ...student,
      };
    });
  }

  async completeJob(jobId: string, completed: CompletedReport): Promise<void> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.careerResultsTable).values({
        submissionId: jobId,
        report: completed.report,
        archetype: completed.report.profile.archetype,
        workerType: completed.report.profile.workerType,
        clarityLevel: completed.report.profile.clarityLevel,
        recommendedTrack: completed.report.recommendedTrack,
        technicalScore: completed.report.traits.technical.score,
        creativeScore: completed.report.traits.creative.score,
        peopleScore: completed.report.traits.people.score,
        riskScore: completed.report.traits.risk.score,
        learningScore: completed.report.traits.learning.score,
        model: completed.model,
        inputTokens: completed.inputTokens,
        outputTokens: completed.outputTokens,
      });
      const [submission] = await tx
        .select({ attemptCount: schema.careerSubmissionsTable.attemptCount })
        .from(schema.careerSubmissionsTable)
        .where(eq(schema.careerSubmissionsTable.id, jobId))
        .limit(1);
      await tx.insert(schema.careerGenerationAttemptsTable).values({
        submissionId: jobId,
        attempt: submission?.attemptCount ?? 1,
        model: completed.model,
        inputTokens: completed.inputTokens,
        outputTokens: completed.outputTokens,
        succeeded: true,
      });
      await tx
        .update(schema.careerSubmissionsTable)
        .set({
          status: "done",
          error: null,
          processingStartedAt: null,
          updatedAt: now,
        })
        .where(eq(schema.careerSubmissionsTable.id, jobId));
    });
  }

  async failJob(
    jobId: string,
    attempt: number,
    errorType: string,
    now: Date,
    usage?: { model: string; inputTokens: number; outputTokens: number },
  ): Promise<{ terminal: boolean }> {
    const terminal = isTerminalAttempt(attempt);
    await this.db.insert(schema.careerGenerationAttemptsTable).values({
      submissionId: jobId,
      attempt,
      model: usage?.model ?? "unknown",
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      succeeded: false,
      errorType,
    });
    await this.db
      .update(schema.careerSubmissionsTable)
      .set({
        status: terminal ? "failed" : "pending",
        error: terminal
          ? "Report generation failed after several attempts. Please retry."
          : "A temporary issue interrupted report generation. It will retry automatically.",
        nextAttemptAt: nextAttemptAt(attempt, now.getTime()),
        processingStartedAt: null,
        updatedAt: now,
      })
      .where(eq(schema.careerSubmissionsTable.id, jobId));
    return { terminal };
  }

  /** Removes rate-limit rows older than the current window (maintenance). */
  async pruneRateLimits(olderThan: Date): Promise<void> {
    await this.db
      .delete(schema.submissionRateLimitsTable)
      .where(
        sql`${schema.submissionRateLimitsTable.windowStart} < ${olderThan}`,
      );
  }
}
