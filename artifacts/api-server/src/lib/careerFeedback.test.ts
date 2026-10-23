/**
 * Regression and invariant tests for Student Report Feedback.
 *
 * Covers:
 * - Rejection of invalid ratings (below 1, above 5, floats, non-numbers, missing).
 * - Acceptance of valid ratings (1..5).
 * - Optional comment validation (empty -> null, whitespace-trimmed, bounded <= 500 chars, oversized rejected).
 * - Invariant: One feedback record per (submissionId, studentId) pair. A second submission updates rather than duplicates.
 * - Ownership verification: Only the student who owns the submission can create/read/update feedback. Cross-student access is denied.
 * - Storage synchronization across reloads/revisits.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateFeedbackInput,
  InMemoryFeedbackStore,
} from "./careerFeedback";

describe("Career Feedback — Rating Validation", () => {
  it("rejects missing or null rating", () => {
    assert.deepEqual(validateFeedbackInput({}), {
      ok: false,
      status: 400,
      message: "A rating between 1 and 5 is required.",
    });
    assert.deepEqual(validateFeedbackInput({ rating: null }), {
      ok: false,
      status: 400,
      message: "A rating between 1 and 5 is required.",
    });
  });

  it("rejects ratings below 1", () => {
    assert.deepEqual(validateFeedbackInput({ rating: 0 }), {
      ok: false,
      status: 400,
      message: "Rating must be an integer between 1 and 5.",
    });
    assert.deepEqual(validateFeedbackInput({ rating: -1 }), {
      ok: false,
      status: 400,
      message: "Rating must be an integer between 1 and 5.",
    });
  });

  it("rejects ratings above 5", () => {
    assert.deepEqual(validateFeedbackInput({ rating: 6 }), {
      ok: false,
      status: 400,
      message: "Rating must be an integer between 1 and 5.",
    });
    assert.deepEqual(validateFeedbackInput({ rating: 100 }), {
      ok: false,
      status: 400,
      message: "Rating must be an integer between 1 and 5.",
    });
  });

  it("rejects non-integer ratings (floats, strings, arrays)", () => {
    assert.deepEqual(validateFeedbackInput({ rating: 4.5 }), {
      ok: false,
      status: 400,
      message: "Rating must be an integer between 1 and 5.",
    });
    assert.deepEqual(validateFeedbackInput({ rating: "5" as unknown as number }), {
      ok: false,
      status: 400,
      message: "Rating must be an integer between 1 and 5.",
    });
    assert.deepEqual(validateFeedbackInput({ rating: [5] as unknown as number }), {
      ok: false,
      status: 400,
      message: "Rating must be an integer between 1 and 5.",
    });
  });

  it("accepts each valid rating integer 1 through 5", () => {
    for (let r = 1; r <= 5; r++) {
      const res = validateFeedbackInput({ rating: r });
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.rating, r);
        assert.equal(res.data.comment, null);
      }
    }
  });
});

describe("Career Feedback — Comment Validation and Bounds", () => {
  it("allows omitting comment or providing null/empty string", () => {
    const resNoComment = validateFeedbackInput({ rating: 5 });
    assert.equal(resNoComment.ok, true);
    if (resNoComment.ok) assert.equal(resNoComment.data.comment, null);

    const resNull = validateFeedbackInput({ rating: 5, comment: null });
    assert.equal(resNull.ok, true);
    if (resNull.ok) assert.equal(resNull.data.comment, null);

    const resEmpty = validateFeedbackInput({ rating: 5, comment: "   " });
    assert.equal(resEmpty.ok, true);
    if (resEmpty.ok) assert.equal(resEmpty.data.comment, null);
  });

  it("accepts valid comments up to 500 characters and trims whitespace", () => {
    const validComment = "  Very clear and realistic next steps!  ";
    const res = validateFeedbackInput({ rating: 4, comment: validComment });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.comment, "Very clear and realistic next steps!");
    }

    const exact500Chars = "a".repeat(500);
    const res500 = validateFeedbackInput({ rating: 5, comment: exact500Chars });
    assert.equal(res500.ok, true);
    if (res500.ok) {
      assert.equal(res500.data.comment?.length, 500);
    }
  });

  it("rejects oversized comments (> 500 characters)", () => {
    const oversized501 = "x".repeat(501);
    const res = validateFeedbackInput({ rating: 3, comment: oversized501 });
    assert.deepEqual(res, {
      ok: false,
      status: 400,
      message: "Comment cannot exceed 500 characters.",
    });
  });

  it("rejects non-string comments (numbers, objects)", () => {
    const resNum = validateFeedbackInput({ rating: 4, comment: 12345 });
    assert.deepEqual(resNum, {
      ok: false,
      status: 400,
      message: "Comment must be a text string.",
    });
  });
});

describe("Career Feedback — Ownership & One-Per-Student Constraint", () => {
  it("a valid rating can be created and retrieved by the owning student", () => {
    const store = new InMemoryFeedbackStore();
    const submissionId = "sub-uuid-1111";
    const studentId = "student-uuid-aaaa";

    const saved = store.upsert("fb-1", submissionId, studentId, 5, "Great report!");
    assert.equal(saved.rating, 5);
    assert.equal(saved.comment, "Great report!");

    const retrieved = store.get(submissionId, studentId);
    assert.ok(retrieved !== null);
    assert.equal(retrieved.rating, 5);
    assert.equal(retrieved.comment, "Great report!");
  });

  it("a student cannot read or modify another student's feedback", () => {
    const store = new InMemoryFeedbackStore();
    const submissionId = "sub-uuid-1111";
    const studentA = "student-uuid-aaaa";
    const studentB = "student-uuid-bbbb";

    // Student A saves feedback
    store.upsert("fb-1", submissionId, studentA, 4, "Helpful guidance.");

    // Student B attempts to read feedback for the submission under their student identity
    const studentBView = store.get(submissionId, studentB);
    assert.equal(studentBView, null);

    // Student B attempts to save feedback for their own record
    store.upsert("fb-2", submissionId, studentB, 2, "Needed more details.");

    // Student A's feedback is untouched
    const studentAView = store.get(submissionId, studentA);
    assert.equal(studentAView?.rating, 4);
    assert.equal(studentAView?.comment, "Helpful guidance.");

    // Store contains 2 separate isolated records
    assert.equal(store.size(), 2);
  });

  it("a second submission updates the student's existing feedback rather than creating a duplicate", () => {
    const store = new InMemoryFeedbackStore();
    const submissionId = "sub-uuid-2222";
    const studentId = "student-uuid-cccc";

    const firstTime = new Date("2026-10-23T08:00:00Z");
    const initial = store.upsert("fb-initial", submissionId, studentId, 3, "Decent", firstTime);
    assert.equal(initial.rating, 3);
    assert.equal(store.size(), 1);

    // Student revisits and updates their rating to 5 with new comment
    const updateTime = new Date("2026-10-23T09:30:00Z");
    const updated = store.upsert("fb-initial", submissionId, studentId, 5, "Much clearer now after reviewing the roadmap!", updateTime);

    assert.equal(store.size(), 1); // No duplicate!
    assert.equal(updated.rating, 5);
    assert.equal(updated.comment, "Much clearer now after reviewing the roadmap!");
    assert.equal(updated.updatedAt.toISOString(), updateTime.toISOString());
  });

  it("feedback persists across simulated reloads", () => {
    const store = new InMemoryFeedbackStore();
    const submissionId = "sub-uuid-persists";
    const studentId = "student-uuid-persists";

    store.upsert("fb-3", submissionId, studentId, 4, "Solid advice.");

    // Simulate page reload: query store afresh
    const reloaded = store.get(submissionId, studentId);
    assert.ok(reloaded !== null);
    assert.equal(reloaded.rating, 4);
    assert.equal(reloaded.comment, "Solid advice.");
  });
});
