--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."career_submission_status" AS ENUM('pending', 'processing', 'done', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institutions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "institutions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institution_admins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "clerk_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "institution_admins_institution_user_unique" UNIQUE("institution_id", "clerk_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "institution_admins" ADD CONSTRAINT "institution_admins_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "career_students" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "clerk_user_id" text NOT NULL,
  "department" text NOT NULL,
  "year" text NOT NULL,
  "batch" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "career_students_institution_clerk_user_unique" UNIQUE("institution_id", "clerk_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "career_students" ADD CONSTRAINT "career_students_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "career_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL,
  "answers" jsonb NOT NULL,
  "consented_at" timestamp with time zone NOT NULL,
  "consent_version" text NOT NULL,
  "status" "career_submission_status" DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processing_started_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "career_submissions_student_unique" UNIQUE("student_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "career_submissions" ADD CONSTRAINT "career_submissions_student_id_career_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."career_students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "career_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "report" jsonb NOT NULL,
  "archetype" text NOT NULL,
  "worker_type" text NOT NULL,
  "clarity_level" text NOT NULL,
  "recommended_track" text NOT NULL,
  "technical_score" smallint NOT NULL,
  "creative_score" smallint NOT NULL,
  "people_score" smallint NOT NULL,
  "risk_score" smallint NOT NULL,
  "learning_score" smallint NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "career_results_submission_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "career_results" ADD CONSTRAINT "career_results_submission_id_career_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."career_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "career_generation_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "attempt" smallint NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "succeeded" boolean NOT NULL,
  "error_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "career_generation_attempts_submission_attempt_unique" UNIQUE("submission_id", "attempt")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "career_generation_attempts" ADD CONSTRAINT "career_generation_attempts_submission_id_career_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."career_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submission_rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_students_institution_department_idx" ON "career_students" USING btree ("institution_id", "department");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_students_institution_year_idx" ON "career_students" USING btree ("institution_id", "year");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_students_institution_batch_idx" ON "career_students" USING btree ("institution_id", "batch");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_submissions_queue_idx" ON "career_submissions" USING btree ("status", "next_attempt_at", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_results_recommended_track_idx" ON "career_results" USING btree ("recommended_track");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_results_clarity_level_idx" ON "career_results" USING btree ("clarity_level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_generation_attempts_submission_idx" ON "career_generation_attempts" USING btree ("submission_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submission_rate_limits_window_idx" ON "submission_rate_limits" USING btree ("window_start");
