import {
  submissionInputSchema,
  type SubmissionAnswers,
  type SubmissionInput,
} from "./reportSchema.js";

const SINGLE_CHOICE_KEYS = new Set(["q1", "q5", "q12"]);

const MULTI_CHOICE_LIMITS: Record<string, number> = {
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

export const CONSENT_VERSION = "institution-aggregate-v1";

export interface ValidSubmission extends SubmissionInput {
  department: string;
  year: string;
  batch: string;
}

function isValidSingleChoice(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 300
  );
}

function isValidMultiChoice(value: unknown, limit: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= limit &&
    new Set(value).size === value.length &&
    value.every(
      (choice) =>
        typeof choice === "string" &&
        choice.trim().length > 0 &&
        choice.length <= 300,
    )
  );
}

/**
 * Validates the 13 structured answers plus cohort fields and consent.
 * q13 (free text) is optional; q1–q12 are required.
 */
export function validateSubmissionInput(
  value: unknown,
): { ok: true; data: ValidSubmission } | { ok: false; message: string } {
  const parsed = submissionInputSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: "The submitted answers are invalid." };
  }
  if (parsed.data.consent !== true) {
    return { ok: false, message: "Consent is required to create a report." };
  }

  const answers = parsed.data.answers as Record<string, unknown>;
  for (const [key, answer] of Object.entries(answers)) {
    if (key === "q13") continue;
    if (SINGLE_CHOICE_KEYS.has(key)) {
      if (!isValidSingleChoice(answer)) {
        return {
          ok: false,
          message: "Answer all required questions using valid selections.",
        };
      }
      continue;
    }
    const limit = MULTI_CHOICE_LIMITS[key];
    if (limit === undefined || !isValidMultiChoice(answer, limit)) {
      return {
        ok: false,
        message: "Answer all required questions using valid selections.",
      };
    }
  }

  const department = parsed.data.department.trim();
  const year = parsed.data.year.trim();
  const batch = parsed.data.batch.trim();
  if (!department || !year || !batch) {
    return {
      ok: false,
      message: "Department, academic year, and batch are required.",
    };
  }

  return {
    ok: true,
    data: {
      answers: parsed.data.answers as SubmissionAnswers,
      department,
      year,
      batch,
      consent: true,
    },
  };
}
