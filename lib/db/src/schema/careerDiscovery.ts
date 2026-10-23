import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const careerSubmissionStatusEnum = pgEnum("career_submission_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);

export const institutionsTable = pgTable(
  "institutions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("institutions_name_unique").on(table.name)],
);

export const institutionAdminsTable = pgTable(
  "institution_admins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutionsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("institution_admins_institution_email_unique").on(
      table.institutionId,
      table.email,
    ),
  ],
);

export const studentsTable = pgTable(
  "career_students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutionsTable.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    department: text("department").notNull(),
    year: text("year").notNull(),
    batch: text("batch").notNull(),
    degree: text("degree").notNull(),
    graduationYear: integer("graduation_year").notNull(),
    availableHoursPerWeek: integer("available_hours_per_week").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("career_students_institution_clerk_user_unique").on(
      table.institutionId,
      table.clerkUserId,
    ),
    index("career_students_institution_department_idx").on(
      table.institutionId,
      table.department,
    ),
    index("career_students_institution_year_idx").on(
      table.institutionId,
      table.year,
    ),
    index("career_students_institution_batch_idx").on(
      table.institutionId,
      table.batch,
    ),
  ],
);

export const careerSubmissionsTable = pgTable(
  "career_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    answers: jsonb("answers").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    consentVersion: text("consent_version").notNull(),
    status: careerSubmissionStatusEnum("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("career_submissions_student_unique").on(table.studentId),
    index("career_submissions_queue_idx").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt,
    ),
  ],
);

export const careerResultsTable = pgTable(
  "career_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => careerSubmissionsTable.id, { onDelete: "cascade" }),
    report: jsonb("report").notNull(),
    archetype: text("archetype").notNull(),
    workerType: text("worker_type").notNull(),
    clarityLevel: text("clarity_level").notNull(),
    recommendedTrack: text("recommended_track").notNull(),
    technicalScore: smallint("technical_score").notNull(),
    creativeScore: smallint("creative_score").notNull(),
    peopleScore: smallint("people_score").notNull(),
    riskScore: smallint("risk_score").notNull(),
    learningScore: smallint("learning_score").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("career_results_submission_unique").on(table.submissionId),
    index("career_results_recommended_track_idx").on(table.recommendedTrack),
    index("career_results_clarity_level_idx").on(table.clarityLevel),
  ],
);

export const careerGenerationAttemptsTable = pgTable(
  "career_generation_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => careerSubmissionsTable.id, { onDelete: "cascade" }),
    attempt: smallint("attempt").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    succeeded: boolean("succeeded").notNull(),
    errorType: text("error_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("career_generation_attempts_submission_attempt_unique").on(
      table.submissionId,
      table.attempt,
    ),
    index("career_generation_attempts_submission_idx").on(table.submissionId),
  ],
);

/**
 * Batch 4 — Persisted deterministic career strategy + explanation.
 *
 * One row per submission (unique submissionId, idempotent upsert on retry).
 * Normalized columns (no JSON blobs) so nulls stay null and versions are
 * queryable. Route type stays plain text (validated at the API layer) so
 * future route types never require an enum migration.
 */
export const careerStrategiesTable = pgTable(
  "career_strategies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => careerSubmissionsTable.id, { onDelete: "cascade" }),
    strategyVersion: text("strategy_version").notNull(),
    explanationVersion: text("explanation_version").notNull(),
    targetCareerId: text("target_career_id"),
    targetCareerTitle: text("target_career_title"),
    entryCareerId: text("entry_career_id"),
    entryCareerTitle: text("entry_career_title"),
    bridgeCareerId: text("bridge_career_id"),
    bridgeCareerTitle: text("bridge_career_title"),
    alternativeCareerId: text("alternative_career_id"),
    alternativeCareerTitle: text("alternative_career_title"),
    routeType: text("route_type"),
    insufficientContext: boolean("insufficient_context").notNull(),
    rationaleTarget: text("rationale_target").notNull(),
    rationaleEntry: text("rationale_entry").notNull(),
    rationaleBridge: text("rationale_bridge"),
    rationaleAcademic: text("rationale_academic").notNull(),
    rationaleTime: text("rationale_time").notNull(),
    explanationTarget: text("explanation_target").notNull(),
    explanationEntry: text("explanation_entry").notNull(),
    explanationRoute: text("explanation_route").notNull(),
    explanationAcademic: text("explanation_academic").notNull(),
    explanationTime: text("explanation_time").notNull(),
    explanationBridge: text("explanation_bridge"),
    explanationAlternative: text("explanation_alternative"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("career_strategies_submission_unique").on(table.submissionId),
    index("career_strategies_submission_idx").on(table.submissionId),
  ],
);

/**
 * Persisted student report feedback (1-5 star rating and optional comment).
 *
 * Enforces one feedback record per student/submission pair (uniqueIndex).
 * Edits update the existing record rather than creating duplicates.
 */
export const careerFeedbackTable = pgTable(
  "career_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => careerSubmissionsTable.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("career_feedback_submission_student_unique").on(
      table.submissionId,
      table.studentId,
    ),
    index("career_feedback_submission_idx").on(table.submissionId),
    index("career_feedback_student_idx").on(table.studentId),
  ],
);

