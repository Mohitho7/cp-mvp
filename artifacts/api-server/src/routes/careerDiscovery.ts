import { Router, type IRouter, type RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  CreateCareerSubmissionBody,
  GetCareerSubmissionParams,
  GetCareerSubmissionResponse,
  GetInstitutionDashboardQueryParams,
  GetInstitutionDashboardResponse,
  GetMyCareerSubmissionResponse,
} from "@workspace/api-zod";
import type {
  CareerSubmissionAccepted,
  CareerSubmissionInput,
} from "@workspace/api-zod";
import {
  careerFeedbackTable,
  careerResultsTable,
  careerStrategiesTable,
  careerSubmissionsTable,
  db,
  studentsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  authorizeInstitutionAdmin,
  ensureConfiguredInstitution,
  getSignedInUserId,
  requireSignedIn,
} from "../lib/institutionAccess";
import {
  getCareerDashboard,
  type CareerDashboardFilters,
} from "../lib/careerDashboard";
import { toStrategyResponse } from "../lib/strategyRecord";
import {
  toStudentContextColumns,
  validateStudentContext,
} from "../lib/studentContext";
import { validateFeedbackInput } from "../lib/careerFeedback";

const router: IRouter = Router();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

router.use(requireSignedIn);

const limitSubmissionRequests: RequestHandler = (req, res, next) => {
  const userId = getSignedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }

  const now = Date.now();
  const bucket = rateLimitBuckets.get(userId);
  if (bucket && bucket.resetAt > now) {
    if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((bucket.resetAt - now) / 1000)),
      );
      res.status(429).json({
        error: "Too many submission attempts. Please try again later.",
      });
      return;
    }
    bucket.count += 1;
  } else {
    rateLimitBuckets.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
  }

  if (rateLimitBuckets.size > 1000) {
    for (const [key, value] of rateLimitBuckets) {
      if (value.resetAt <= now) {
        rateLimitBuckets.delete(key);
      }
    }
  }
  next();
};

export function validateSubmissionInput(
  value: unknown,
): { ok: true; data: CareerSubmissionInput } | { ok: false; message: string } {
  // Student context is validated first on the raw payload so failures get
  // specific messages instead of a generic shape error. No defaults invented.
  const rawContext = value as Record<string, unknown> | null;
  const contextValidation = validateStudentContext({
    degree: rawContext?.degree,
    graduationYear: rawContext?.graduationYear,
    availableHoursPerWeek: rawContext?.availableHoursPerWeek,
  });
  if (!contextValidation.ok) {
    return { ok: false, message: contextValidation.message };
  }

  const parsed = CreateCareerSubmissionBody.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: "The submitted answers are invalid." };
  }
  if (!parsed.data.consent) {
    return {
      ok: false,
      message: "Consent is required to create a report.",
    };
  }

  const requiredAnswers = Object.entries(parsed.data.answers).filter(
    ([key]) => key !== "q13",
  );
  const singleChoiceKeys = new Set(["q1", "q5", "q12"]);
  const multiChoiceLimits: Record<string, number> = {
    q2: 12,
    q3: 12,
    q4: 12,
    q6: 6,
    q7: 3,
    q8: 7,
    q9: 3,
    q10: 3,
    q11: 3,
  };
  if (
    requiredAnswers.some(([key, answer]) => {
      if (singleChoiceKeys.has(key)) {
        return (
          typeof answer !== "string" ||
          answer.trim().length === 0 ||
          answer.length > 300
        );
      }
      return (
        !Array.isArray(answer) ||
        answer.length === 0 ||
        answer.length > multiChoiceLimits[key] ||
        new Set(answer).size !== answer.length ||
        answer.some(
          (choice) => choice.trim().length === 0 || choice.length > 300,
        )
      );
    })
  ) {
    return {
      ok: false,
      message: "Answer all required questions using valid selections.",
    };
  }

  if (
    !parsed.data.department.trim() ||
    !parsed.data.year.trim() ||
    !parsed.data.batch.trim()
  ) {
    return {
      ok: false,
      message: "Department, academic year, and batch are required.",
    };
  }

  const parsedContextValidation = validateStudentContext({
    degree: parsed.data.degree,
    graduationYear: parsed.data.graduationYear,
    availableHoursPerWeek: parsed.data.availableHoursPerWeek,
  });
  if (!parsedContextValidation.ok) {
    // Unreachable for well-formed payloads (already validated above), but
    // kept as a second layer so generated-schema drift can never slip through.
    return { ok: false, message: parsedContextValidation.message };
  }

  return {
    ok: true,
    data: {
      ...parsed.data,
      consent: true,
      department: parsed.data.department.trim(),
      year: parsed.data.year.trim(),
      batch: parsed.data.batch.trim(),
      degree: contextValidation.context.degree,
      graduationYear: contextValidation.context.graduationYear,
      availableHoursPerWeek: contextValidation.context.availableHoursPerWeek,
    },
  };
}

function parseSubmissionId(value: unknown): string | null {
  const parsed = GetCareerSubmissionParams.safeParse({ id: value });
  return parsed.success ? parsed.data.id : null;
}

async function getOwnedSubmission(userId: string, submissionId?: string) {
  const filters = [eq(studentsTable.clerkUserId, userId)];
  if (submissionId) {
    filters.push(eq(careerSubmissionsTable.id, submissionId));
  }

  const [row] = await db
    .select({
      id: careerSubmissionsTable.id,
      status: careerSubmissionsTable.status,
      submittedAt: careerSubmissionsTable.createdAt,
      error: careerSubmissionsTable.error,
      report: careerResultsTable.report,
      strategyVersion: careerStrategiesTable.strategyVersion,
      explanationVersion: careerStrategiesTable.explanationVersion,
      targetCareerId: careerStrategiesTable.targetCareerId,
      targetCareerTitle: careerStrategiesTable.targetCareerTitle,
      entryCareerId: careerStrategiesTable.entryCareerId,
      entryCareerTitle: careerStrategiesTable.entryCareerTitle,
      bridgeCareerId: careerStrategiesTable.bridgeCareerId,
      bridgeCareerTitle: careerStrategiesTable.bridgeCareerTitle,
      alternativeCareerId: careerStrategiesTable.alternativeCareerId,
      alternativeCareerTitle: careerStrategiesTable.alternativeCareerTitle,
      routeType: careerStrategiesTable.routeType,
      insufficientContext: careerStrategiesTable.insufficientContext,
      rationaleTarget: careerStrategiesTable.rationaleTarget,
      rationaleEntry: careerStrategiesTable.rationaleEntry,
      rationaleBridge: careerStrategiesTable.rationaleBridge,
      rationaleAcademic: careerStrategiesTable.rationaleAcademic,
      rationaleTime: careerStrategiesTable.rationaleTime,
      explanationTarget: careerStrategiesTable.explanationTarget,
      explanationEntry: careerStrategiesTable.explanationEntry,
      explanationRoute: careerStrategiesTable.explanationRoute,
      explanationAcademic: careerStrategiesTable.explanationAcademic,
      explanationTime: careerStrategiesTable.explanationTime,
      explanationBridge: careerStrategiesTable.explanationBridge,
      explanationAlternative: careerStrategiesTable.explanationAlternative,
    })
    .from(careerSubmissionsTable)
    .innerJoin(
      studentsTable,
      eq(careerSubmissionsTable.studentId, studentsTable.id),
    )
    .leftJoin(
      careerResultsTable,
      eq(careerResultsTable.submissionId, careerSubmissionsTable.id),
    )
    .leftJoin(
      careerStrategiesTable,
      eq(careerStrategiesTable.submissionId, careerSubmissionsTable.id),
    )
    .where(and(...filters))
    .limit(1);

  return row ?? null;
}

export async function getOwnedStudentAndSubmission(userId: string, submissionId: string) {
  const [row] = await db
    .select({
      submissionId: careerSubmissionsTable.id,
      studentId: studentsTable.id,
      clerkUserId: studentsTable.clerkUserId,
    })
    .from(careerSubmissionsTable)
    .innerJoin(
      studentsTable,
      eq(careerSubmissionsTable.studentId, studentsTable.id),
    )
    .where(
      and(
        eq(studentsTable.clerkUserId, userId),
        eq(careerSubmissionsTable.id, submissionId),
      ),
    )
    .limit(1);

  return row ?? null;
}

let feedbackTableEnsured = false;
export async function ensureFeedbackTable(): Promise<void> {
  if (feedbackTableEnsured) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "career_feedback" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "submission_id" uuid NOT NULL REFERENCES "career_submissions"("id") ON DELETE CASCADE,
        "student_id" uuid NOT NULL REFERENCES "career_students"("id") ON DELETE CASCADE,
        "rating" smallint NOT NULL,
        "comment" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "career_feedback_submission_student_unique" ON "career_feedback" ("submission_id", "student_id");
      CREATE INDEX IF NOT EXISTS "career_feedback_submission_idx" ON "career_feedback" ("submission_id");
      CREATE INDEX IF NOT EXISTS "career_feedback_student_idx" ON "career_feedback" ("student_id");
    `);
    feedbackTableEnsured = true;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      "ensureFeedbackTable notice",
    );
  }
}

export function serializeSubmission(
  row: NonNullable<Awaited<ReturnType<typeof getOwnedSubmission>>>,
) {
  const hasStrategyRow = row.strategyVersion !== null || row.insufficientContext !== null;
  return {
    id: row.id,
    status: row.status,
    submittedAt: row.submittedAt,
    report: row.report,
    strategy: hasStrategyRow
      ? toStrategyResponse({
          strategyVersion: row.strategyVersion ?? "",
          explanationVersion: row.explanationVersion ?? "",
          targetCareerId: row.targetCareerId,
          targetCareerTitle: row.targetCareerTitle,
          entryCareerId: row.entryCareerId,
          entryCareerTitle: row.entryCareerTitle,
          bridgeCareerId: row.bridgeCareerId,
          bridgeCareerTitle: row.bridgeCareerTitle,
          alternativeCareerId: row.alternativeCareerId,
          alternativeCareerTitle: row.alternativeCareerTitle,
          routeType: row.routeType,
          insufficientContext: row.insufficientContext ?? false,
          rationaleTarget: row.rationaleTarget ?? "",
          rationaleEntry: row.rationaleEntry ?? "",
          rationaleBridge: row.rationaleBridge,
          rationaleAcademic: row.rationaleAcademic ?? "",
          rationaleTime: row.rationaleTime ?? "",
          explanationTarget: row.explanationTarget ?? "",
          explanationEntry: row.explanationEntry ?? "",
          explanationRoute: row.explanationRoute ?? "",
          explanationAcademic: row.explanationAcademic ?? "",
          explanationTime: row.explanationTime ?? "",
          explanationBridge: row.explanationBridge,
          explanationAlternative: row.explanationAlternative,
        })
      : null,
    error: row.status === "failed" ? row.error : null,
  };
}

const handleCreateSubmission: RequestHandler = async (req, res) => {
  const userId = getSignedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }

  const validation = validateSubmissionInput(req.body);
  if (!validation.ok) {
    res.status(400).json({ error: validation.message });
    return;
  }

  const institution = await ensureConfiguredInstitution();
  if (!institution) {
    res.status(503).json({ error: "Institution setup is incomplete." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const contextColumns = toStudentContextColumns({
      degree: validation.data.degree,
      graduationYear: validation.data.graduationYear,
      availableHoursPerWeek: validation.data.availableHoursPerWeek,
    });
    let [student] = await tx
      .insert(studentsTable)
      .values({
        institutionId: institution.id,
        clerkUserId: userId,
        department: validation.data.department,
        year: validation.data.year,
        batch: validation.data.batch,
        ...contextColumns,
      })
      .onConflictDoNothing({
        target: [studentsTable.institutionId, studentsTable.clerkUserId],
      })
      .returning({ id: studentsTable.id });

    if (!student) {
      [student] = await tx
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(
          and(
            eq(studentsTable.institutionId, institution.id),
            eq(studentsTable.clerkUserId, userId),
          ),
        )
        .for("update")
        .limit(1);

      if (!student) {
        throw new Error("Could not create or retrieve the student record.");
      }

      const [existingSubmission] = await tx
        .select({ id: careerSubmissionsTable.id })
        .from(careerSubmissionsTable)
        .where(eq(careerSubmissionsTable.studentId, student.id))
        .limit(1);
      if (existingSubmission) {
        return null;
      }

      await tx
        .update(studentsTable)
        .set({
          department: validation.data.department,
          year: validation.data.year,
          batch: validation.data.batch,
          ...contextColumns,
        })
        .where(eq(studentsTable.id, student.id));
    }

    const [submission] = await tx
      .insert(careerSubmissionsTable)
      .values({
        studentId: student.id,
        answers: validation.data.answers,
        consentedAt: new Date(),
        consentVersion: "institution-aggregate-v1",
      })
      .onConflictDoNothing({
        target: careerSubmissionsTable.studentId,
      })
      .returning({
        id: careerSubmissionsTable.id,
        createdAt: careerSubmissionsTable.createdAt,
      });

    return submission ?? null;
  });

  if (!result) {
    res.status(409).json({ error: "This student already has a submission." });
    return;
  }

  const accepted: CareerSubmissionAccepted = {
    id: result.id,
    status: "pending",
    submittedAt: result.createdAt,
  };
  res.status(201).json(accepted);
};

router.post("/submissions", limitSubmissionRequests, handleCreateSubmission);
// Compatibility alias for the original specification path.
router.post("/submit", limitSubmissionRequests, handleCreateSubmission);

router.get("/submissions/me", async (req, res) => {
  const userId = getSignedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }

  const submission = await getOwnedSubmission(userId);
  if (!submission) {
    res.status(404).json({ error: "No assessment has been submitted." });
    return;
  }

  const result = GetMyCareerSubmissionResponse.parse(
    serializeSubmission(submission),
  );
  res.json(result);
});

const handleGetSubmissionById: RequestHandler = async (req, res) => {
  const userId = getSignedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }

  const id = parseSubmissionId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Submission ID must be a valid UUID." });
    return;
  }

  const submission = await getOwnedSubmission(userId, id);
  if (!submission) {
    res.status(404).json({ error: "Submission not found." });
    return;
  }

  const result = GetCareerSubmissionResponse.parse(
    serializeSubmission(submission),
  );
  res.json(result);
};

router.get("/submissions/:id", handleGetSubmissionById);
// Compatibility alias for the original specification path.
router.get("/result/:id", handleGetSubmissionById);

router.post(
  "/submissions/:id/retry",
  limitSubmissionRequests,
  async (req, res) => {
    const userId = getSignedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }

    const id = parseSubmissionId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Submission ID must be a valid UUID." });
      return;
    }

    const submission = await getOwnedSubmission(userId, id);
    if (!submission) {
      res.status(404).json({ error: "Submission not found." });
      return;
    }
    if (submission.status !== "failed") {
      res.status(409).json({ error: "Only failed reports can be retried." });
      return;
    }

    const [requeued] = await db
      .update(careerSubmissionsTable)
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
          eq(careerSubmissionsTable.id, id),
          eq(careerSubmissionsTable.status, "failed"),
        ),
      )
      .returning({
        id: careerSubmissionsTable.id,
        createdAt: careerSubmissionsTable.createdAt,
      });

    if (!requeued) {
      res.status(409).json({ error: "This report is already being retried." });
      return;
    }

    const accepted: CareerSubmissionAccepted = {
      id: requeued.id,
      status: "pending",
      submittedAt: requeued.createdAt,
    };
    res.status(202).json(accepted);
  },
);

router.get("/submissions/:id/feedback", async (req, res) => {
  const userId = getSignedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }

  const id = parseSubmissionId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Submission ID must be a valid UUID." });
    return;
  }

  await ensureFeedbackTable();

  const owned = await getOwnedStudentAndSubmission(userId, id);
  if (!owned) {
    res.status(404).json({ error: "Submission not found or does not belong to the signed-in student." });
    return;
  }

  const [row] = await db
    .select({
      id: careerFeedbackTable.id,
      submissionId: careerFeedbackTable.submissionId,
      rating: careerFeedbackTable.rating,
      comment: careerFeedbackTable.comment,
      createdAt: careerFeedbackTable.createdAt,
      updatedAt: careerFeedbackTable.updatedAt,
    })
    .from(careerFeedbackTable)
    .where(
      and(
        eq(careerFeedbackTable.submissionId, id),
        eq(careerFeedbackTable.studentId, owned.studentId),
      ),
    )
    .limit(1);

  if (!row) {
    res.json({ feedback: null });
    return;
  }

  res.json({
    feedback: {
      id: row.id,
      submissionId: row.submissionId,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
});

router.post("/submissions/:id/feedback", async (req, res) => {
  const userId = getSignedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }

  const id = parseSubmissionId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Submission ID must be a valid UUID." });
    return;
  }

  await ensureFeedbackTable();

  const owned = await getOwnedStudentAndSubmission(userId, id);
  if (!owned) {
    res.status(404).json({ error: "Submission not found or does not belong to the signed-in student." });
    return;
  }

  const validation = validateFeedbackInput(req.body);
  if (!validation.ok) {
    res.status(validation.status).json({ error: validation.message });
    return;
  }
  const { rating, comment } = validation.data;

  const now = new Date();
  const [saved] = await db
    .insert(careerFeedbackTable)
    .values({
      submissionId: id,
      studentId: owned.studentId,
      rating,
      comment,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [careerFeedbackTable.submissionId, careerFeedbackTable.studentId],
      set: {
        rating,
        comment,
        updatedAt: now,
      },
    })
    .returning();

  res.json({
    feedback: {
      id: saved.id,
      submissionId: saved.submissionId,
      rating: saved.rating,
      comment: saved.comment,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    },
  });
});

router.get("/dashboard", async (req, res) => {
  const userId = getSignedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }

  const admin = await authorizeInstitutionAdmin(userId);
  if (!admin.ok) {
    if (admin.reason === "unavailable") {
      res.status(503).json({ error: "Institution access is not configured." });
      return;
    }
    res
      .status(403)
      .json({ error: "Institution administrator access required." });
    return;
  }

  const parsedFilters = GetInstitutionDashboardQueryParams.safeParse(req.query);
  if (!parsedFilters.success) {
    res.status(400).json({ error: "Dashboard filters are invalid." });
    return;
  }

  const filters = parsedFilters.data;
  if (
    Object.values(filters).some(
      (value) => value !== undefined && value.length > 120,
    )
  ) {
    res.status(400).json({ error: "Dashboard filters are too long." });
    return;
  }

  const dashboardFilters: CareerDashboardFilters = filters;
  const dashboard = await getCareerDashboard(
    admin.access.institutionId,
    admin.access.institutionName,
    dashboardFilters,
  );
  res.json(GetInstitutionDashboardResponse.parse(dashboard));
});

export default router;
