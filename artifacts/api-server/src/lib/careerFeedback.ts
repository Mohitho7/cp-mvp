/**
 * Validation and business logic helpers for student report feedback.
 *
 * Rules:
 * - Rating: integer between 1 and 5 inclusive.
 * - Comment: optional text bounded to <= 500 characters after trimming. Empty becomes null.
 * - Ownership: student ID is never trusted from client payloads. Only authenticated Clerk identity is used.
 */

export interface ValidatedFeedback {
  rating: number;
  comment: string | null;
}

export type FeedbackValidationResult =
  | { ok: true; data: ValidatedFeedback }
  | { ok: false; status: 400; message: string };

export function validateFeedbackInput(input: unknown): FeedbackValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, status: 400, message: "Feedback payload must be a JSON object." };
  }

  const raw = input as Record<string, unknown>;
  const { rating, comment } = raw;

  if (rating === undefined || rating === null) {
    return { ok: false, status: 400, message: "A rating between 1 and 5 is required." };
  }

  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, status: 400, message: "Rating must be an integer between 1 and 5." };
  }

  let sanitizedComment: string | null = null;
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== "string") {
      return { ok: false, status: 400, message: "Comment must be a text string." };
    }
    const trimmed = comment.trim();
    if (trimmed.length > 500) {
      return { ok: false, status: 400, message: "Comment cannot exceed 500 characters." };
    }
    sanitizedComment = trimmed.length > 0 ? trimmed : null;
  }

  return {
    ok: true,
    data: {
      rating,
      comment: sanitizedComment,
    },
  };
}

export interface FeedbackRecord {
  id: string;
  submissionId: string;
  studentId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * In-memory simulation of the Drizzle unique constraint on (submission_id, student_id)
 * used for unit and regression testing without an active database connection.
 */
export class InMemoryFeedbackStore {
  private records = new Map<string, FeedbackRecord>();

  private makeKey(submissionId: string, studentId: string): string {
    return `${submissionId}::${studentId}`;
  }

  get(submissionId: string, studentId: string): FeedbackRecord | null {
    const key = this.makeKey(submissionId, studentId);
    return this.records.get(key) ?? null;
  }

  upsert(
    id: string,
    submissionId: string,
    studentId: string,
    rating: number,
    comment: string | null,
    now: Date = new Date(),
  ): FeedbackRecord {
    const key = this.makeKey(submissionId, studentId);
    const existing = this.records.get(key);

    if (existing) {
      existing.rating = rating;
      existing.comment = comment;
      existing.updatedAt = now;
      return { ...existing };
    }

    const created: FeedbackRecord = {
      id,
      submissionId,
      studentId,
      rating,
      comment,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(key, created);
    return { ...created };
  }

  size(): number {
    return this.records.size;
  }
}
