/**
 * Batch 1 — assessment draft persistence (extended with student context).
 *
 * Pure helpers over an injectable storage so old drafts can be unit-tested
 * without a browser. Drafts written before Batch 1 lack the student-context
 * fields: they are treated as missing (defaults) and must NOT crash or be
 * discarded — the student is asked to provide them before submission.
 */

export const DRAFT_STORAGE_KEY = "careerDiscoveryDraftV1";
export const DRAFT_VERSION = 1;

/** Dynamic graduation-year window; mirrors the server-side rule. */
export const GRADUATION_YEAR_PAST_WINDOW = 2;
export const GRADUATION_YEAR_FUTURE_WINDOW = 8;

export function graduationYearOptions(now: Date = new Date()): number[] {
  const currentYear = now.getFullYear();
  const options: number[] = [];
  for (
    let year = currentYear - GRADUATION_YEAR_PAST_WINDOW;
    year <= currentYear + GRADUATION_YEAR_FUTURE_WINDOW;
    year += 1
  ) {
    options.push(year);
  }
  return options;
}

export interface AssessmentDraft {
  version: 1;
  screen: "quiz" | "result";
  currentQ: number;
  answers: (string | string[] | null)[];
  textInput: string;
  userType: string | null;
  department: string;
  year: string;
  batch: string;
  degree: string;
  graduationYear: number | null;
  availableHoursPerWeek: number | null;
  consent: boolean;
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isValidAnswerValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    (Array.isArray(value) &&
      value.every((choice) => typeof choice === "string"))
  );
}

/**
 * Reads a draft. Returns null for missing/corrupt drafts (removing the
 * stored value so a fresh start is possible), but tolerates pre-Batch-1
 * drafts that lack student-context fields by filling defaults.
 */
export function readAssessmentDraft(
  storage: DraftStorage,
  questionCount: number,
): AssessmentDraft | null {
  let saved: string | null;
  try {
    saved = storage.getItem(DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!saved) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const value = parsed as Partial<AssessmentDraft>;
  if (
    value.version !== DRAFT_VERSION ||
    (value.screen !== "quiz" && value.screen !== "result") ||
    !Number.isInteger(value.currentQ) ||
    (value.currentQ ?? -1) < 0 ||
    (value.currentQ ?? questionCount) >= questionCount ||
    !Array.isArray(value.answers) ||
    value.answers.length !== questionCount ||
    !value.answers.every(isValidAnswerValue) ||
    typeof value.textInput !== "string" ||
    (value.userType !== null && typeof value.userType !== "string") ||
    typeof value.department !== "string" ||
    typeof value.year !== "string" ||
    typeof value.batch !== "string" ||
    typeof value.consent !== "boolean"
  ) {
    try {
      storage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Ignore storage failures on cleanup.
    }
    return null;
  }

  // Batch 1 fields are optional on read so old drafts keep working.
  const degree = typeof value.degree === "string" ? value.degree : "";
  const graduationYear =
    typeof value.graduationYear === "number" &&
    Number.isInteger(value.graduationYear)
      ? value.graduationYear
      : null;
  const availableHoursPerWeek =
    typeof value.availableHoursPerWeek === "number" &&
    Number.isInteger(value.availableHoursPerWeek)
      ? value.availableHoursPerWeek
      : null;

  return {
    version: DRAFT_VERSION,
    screen: value.screen,
    currentQ: value.currentQ ?? 0,
    answers: value.answers as (string | string[] | null)[],
    textInput: value.textInput ?? "",
    userType: value.userType ?? null,
    department: value.department ?? "",
    year: value.year ?? "",
    batch: value.batch ?? "",
    degree,
    graduationYear,
    availableHoursPerWeek,
    consent: value.consent ?? false,
  };
}

/** Persists a draft. Returns false when storage is unavailable. */
export function writeAssessmentDraft(
  storage: DraftStorage,
  draft: AssessmentDraft,
): boolean {
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
