/**
 * Batch 1 — Student Context foundation.
 *
 * Pure helpers (no imports, no I/O) so they can be unit-tested without a
 * database. Covers the three context fields only:
 * - degree (free text, required, max 100 chars)
 * - graduationYear (integer, dynamic window: currentYear - 2 .. + 8)
 * - availableHoursPerWeek (integer, 1 .. 60)
 *
 * The 60-hour ceiling is deliberate: 60 focused hours/week is roughly 8.5
 * hours every single day — a generous upper bound for a student who is also
 * studying. Higher values are rejected (never clamped) so implausible input
 * gets corrected instead of silently entering reports and roadmaps.
 *
 * This module intentionally contains NO strategy logic. It must not grow
 * target/entry/bridge scoring — that belongs to a future batch.
 */

export interface StudentContext {
  degree: string;
  graduationYear: number;
  availableHoursPerWeek: number;
}

export const DEGREE_MAX_LENGTH = 100;
export const AVAILABLE_HOURS_MIN = 1;
export const AVAILABLE_HOURS_MAX = 60;
export const GRADUATION_YEAR_PAST_WINDOW = 2;
export const GRADUATION_YEAR_FUTURE_WINDOW = 8;

export interface GraduationYearRange {
  min: number;
  max: number;
}

/** Dynamic plausible graduation-year window derived from the server clock. */
export function graduationYearRange(now: Date = new Date()): GraduationYearRange {
  const currentYear = now.getFullYear();
  return {
    min: currentYear - GRADUATION_YEAR_PAST_WINDOW,
    max: currentYear + GRADUATION_YEAR_FUTURE_WINDOW,
  };
}

export type StudentContextValidation =
  | { ok: true; context: StudentContext }
  | { ok: false; message: string };

function parseIntegerField(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Validates the raw student-context portion of a submission payload.
 * Returns specific, user-facing messages (never invents defaults).
 */
export function validateStudentContext(
  value: unknown,
  now: Date = new Date(),
): StudentContextValidation {
  if (!value || typeof value !== "object") {
    return { ok: false, message: "Degree, graduation year, and weekly hours are required." };
  }
  const input = value as Record<string, unknown>;

  const rawDegree = input.degree;
  if (typeof rawDegree !== "string" || rawDegree.trim().length === 0) {
    return { ok: false, message: "Your degree is required." };
  }
  const degree = rawDegree.trim();
  if (degree.length > DEGREE_MAX_LENGTH) {
    return {
      ok: false,
      message: `Your degree must be ${DEGREE_MAX_LENGTH} characters or fewer.`,
    };
  }

  const graduationYear = parseIntegerField(input.graduationYear);
  const range = graduationYearRange(now);
  if (graduationYear === null || graduationYear < range.min || graduationYear > range.max) {
    return {
      ok: false,
      message: `Expected graduation year must be a whole year between ${range.min} and ${range.max}.`,
    };
  }

  const availableHoursPerWeek = parseIntegerField(input.availableHoursPerWeek);
  if (
    availableHoursPerWeek === null ||
    availableHoursPerWeek < AVAILABLE_HOURS_MIN ||
    availableHoursPerWeek > AVAILABLE_HOURS_MAX
  ) {
    return {
      ok: false,
      message: `Weekly hours must be a whole number between ${AVAILABLE_HOURS_MIN} and ${AVAILABLE_HOURS_MAX}.`,
    };
  }

  return { ok: true, context: { degree, graduationYear, availableHoursPerWeek } };
}

/**
 * Plain column mapping for the career_students row. Kept separate from the
 * route handler so persistence shape is unit-testable without a database.
 */
export function toStudentContextColumns(context: StudentContext): StudentContext {
  return {
    degree: context.degree,
    graduationYear: context.graduationYear,
    availableHoursPerWeek: context.availableHoursPerWeek,
  };
}

/**
 * Prompt lines that expose the context to the report model as labelled
 * STUDENT CONTEXT, kept separate from the 13 assessment answers. No strategy
 * instructions are included here by design.
 */
export function studentContextPromptLines(context: StudentContext): string[] {
  return [
    "STUDENT CONTEXT (objective background supplied by the student; use it only as background information, kept separate from the assessment answers):",
    `- Degree: ${context.degree}`,
    `- Expected graduation year: ${context.graduationYear}`,
    `- Realistic career-preparation availability: ${context.availableHoursPerWeek} hours/week`,
  ];
}
