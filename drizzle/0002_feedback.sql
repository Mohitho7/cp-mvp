--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "career_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "rating" smallint NOT NULL,
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "career_feedback" ADD CONSTRAINT "career_feedback_submission_id_career_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."career_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "career_feedback" ADD CONSTRAINT "career_feedback_student_id_career_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."career_students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "career_feedback_submission_student_unique" ON "career_feedback" ("submission_id", "student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_feedback_submission_idx" ON "career_feedback" ("submission_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_feedback_student_idx" ON "career_feedback" ("student_id");
