import {
  dashboardFiltersSchema,
  type CareerReport,
  type DashboardFilters,
  type InstitutionDashboard,
  type SubmissionAnswers,
} from "./reportSchema.js";
import {
  CONSENT_VERSION,
  validateSubmissionInput,
  type ValidSubmission,
} from "./validation.js";
import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  rateLimitKey,
  rateLimitWindowStart,
} from "./rateLimit.js";
import type { CareerSubmissionStatus } from "./schema.js";

export interface StudentRow {
  id: string;
  institutionId: string;
  department: string;
  year: string;
  batch: string;
}

export interface OwnedSubmission {
  id: string;
  status: CareerSubmissionStatus;
  submittedAt: Date;
  report: CareerReport | null;
  error: string | null;
}

export interface SubmissionStore {
  findStudent(
    institutionId: string,
    clerkUserId: string,
  ): Promise<StudentRow | null>;
  createStudent(input: {
    institutionId: string;
    clerkUserId: string;
    department: string;
    year: string;
    batch: string;
  }): Promise<StudentRow | null>;
  updateStudentCohort(
    studentId: string,
    cohort: { department: string; year: string; batch: string },
  ): Promise<void>;
  findSubmissionByStudent(
    studentId: string,
  ): Promise<{ id: string } | null>;
  createSubmission(
    studentId: string,
    answers: SubmissionAnswers,
    consentVersion: string,
  ): Promise<{ id: string; createdAt: Date } | null>;
  getOwnedSubmission(
    clerkUserId: string,
    submissionId?: string,
  ): Promise<OwnedSubmission | null>;
  requeueFailedSubmission(
    submissionId: string,
  ): Promise<{ id: string; createdAt: Date } | null>;
  checkRateLimit(
    key: string,
    windowStartMs: number,
    windowMs: number,
    max: number,
    now: Date,
  ): Promise<{ allowed: boolean; retryAfterSec: number }>;
}

export interface HandlerResult {
  status: number;
  body: unknown;
  retryAfterSec?: number;
}

export interface InstitutionRef {
  id: string;
  name: string;
}

export interface SubmissionContext {
  store: SubmissionStore;
  institution: InstitutionRef | null;
  clerkUserId: string;
  now: Date;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function serializeSubmission(row: OwnedSubmission) {
  return {
    id: row.id,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    report: row.report,
    error: row.status === "failed" ? row.error : null,
  };
}

// ---------------------------------------------------------------------------
// POST /api/submit — validate, save answers as pending, return immediately.
// Never generates the report inline.
// ---------------------------------------------------------------------------

export async function handleCreateSubmission(
  ctx: SubmissionContext,
  rawBody: unknown,
): Promise<HandlerResult> {
  const validation = validateSubmissionInput(rawBody);
  if (!validation.ok) {
    return { status: 400, body: { error: validation.message } };
  }
  if (!ctx.institution) {
    return { status: 503, body: { error: "Institution setup is incomplete." } };
  }

  const rate = await ctx.store.checkRateLimit(
    rateLimitKey(ctx.clerkUserId),
    rateLimitWindowStart(ctx.now.getTime()),
    RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS,
    ctx.now,
  );
  if (!rate.allowed) {
    return {
      status: 429,
      body: { error: "Too many submission attempts. Please try again later." },
      retryAfterSec: rate.retryAfterSec,
    };
  }

  const data: ValidSubmission = validation.data;
  let student = await ctx.store.findStudent(
    ctx.institution.id,
    ctx.clerkUserId,
  );
  if (!student) {
    student =
      (await ctx.store.createStudent({
        institutionId: ctx.institution.id,
        clerkUserId: ctx.clerkUserId,
        department: data.department,
        year: data.year,
        batch: data.batch,
      })) ??
      (await ctx.store.findStudent(ctx.institution.id, ctx.clerkUserId));
    if (!student) {
      return {
        status: 500,
        body: { error: "Could not create the student record." },
      };
    }
  } else {
    await ctx.store.updateStudentCohort(student.id, {
      department: data.department,
      year: data.year,
      batch: data.batch,
    });
  }

  const existing = await ctx.store.findSubmissionByStudent(student.id);
  if (existing) {
    return {
      status: 409,
      body: { error: "This student already has a submission." },
    };
  }

  const created = await ctx.store.createSubmission(
    student.id,
    data.answers,
    CONSENT_VERSION,
  );
  if (!created) {
    // Lost a race with a concurrent insert: the unique constraint won.
    return {
      status: 409,
      body: { error: "This student already has a submission." },
    };
  }

  return {
    status: 201,
    body: {
      id: created.id,
      status: "pending",
      submittedAt: created.createdAt.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/result/:id — the owning student's status + report (if done)
// ---------------------------------------------------------------------------

export async function handleGetSubmission(
  ctx: SubmissionContext,
  submissionId: string | undefined,
): Promise<HandlerResult> {
  if (submissionId !== undefined && !isUuid(submissionId)) {
    return {
      status: 400,
      body: { error: "Submission ID must be a valid UUID." },
    };
  }
  const submission = await ctx.store.getOwnedSubmission(
    ctx.clerkUserId,
    submissionId,
  );
  if (!submission) {
    return {
      status: 404,
      body: { error: "Submission not found." },
    };
  }
  return { status: 200, body: serializeSubmission(submission) };
}

// ---------------------------------------------------------------------------
// POST /api/result/:id/retry — requeue a failed report
// ---------------------------------------------------------------------------

export async function handleRetrySubmission(
  ctx: SubmissionContext,
  submissionId: string | undefined,
): Promise<HandlerResult> {
  if (!isUuid(submissionId)) {
    return {
      status: 400,
      body: { error: "Submission ID must be a valid UUID." },
    };
  }
  const rate = await ctx.store.checkRateLimit(
    rateLimitKey(ctx.clerkUserId),
    rateLimitWindowStart(ctx.now.getTime()),
    RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS,
    ctx.now,
  );
  if (!rate.allowed) {
    return {
      status: 429,
      body: { error: "Too many submission attempts. Please try again later." },
      retryAfterSec: rate.retryAfterSec,
    };
  }
  const submission = await ctx.store.getOwnedSubmission(
    ctx.clerkUserId,
    submissionId,
  );
  if (!submission) {
    return { status: 404, body: { error: "Submission not found." } };
  }
  if (submission.status !== "failed") {
    return {
      status: 409,
      body: { error: "Only failed reports can be retried." },
    };
  }
  const requeued = await ctx.store.requeueFailedSubmission(submissionId);
  if (!requeued) {
    return {
      status: 409,
      body: { error: "This report is already being retried." },
    };
  }
  return {
    status: 202,
    body: {
      id: requeued.id,
      status: "pending",
      submittedAt: requeued.createdAt.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard — institution admins only, aggregates never individuals
// ---------------------------------------------------------------------------

export type FetchDashboard = (
  institutionId: string,
  institutionName: string,
  filters: DashboardFilters,
) => Promise<InstitutionDashboard>;

export async function handleGetDashboard(
  admin: { institutionId: string; institutionName: string } | null,
  rawFilters: unknown,
  fetchDashboard: FetchDashboard,
): Promise<HandlerResult> {
  if (!admin) {
    return {
      status: 403,
      body: { error: "Institution administrator access required." },
    };
  }
  const parsed = dashboardFiltersSchema.safeParse(rawFilters ?? {});
  if (!parsed.success) {
    return { status: 400, body: { error: "Dashboard filters are invalid." } };
  }
  const dashboard = await fetchDashboard(
    admin.institutionId,
    admin.institutionName,
    parsed.data,
  );
  return { status: 200, body: dashboard };
}
