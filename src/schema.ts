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

export type CareerSubmissionStatus =
  (typeof careerSubmissionStatusEnum.enumValues)[number];

export const institutionsTable = pgTable(
  "institutions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    clerkUserId: text("clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("institution_admins_institution_user_unique").on(
      table.institutionId,
      table.clerkUserId,
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const submissionRateLimitsTable = pgTable(
  "submission_rate_limits",
  {
    key: text("key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").default(1).notNull(),
  },
  (table) => [index("submission_rate_limits_window_idx").on(table.windowStart)],
);
