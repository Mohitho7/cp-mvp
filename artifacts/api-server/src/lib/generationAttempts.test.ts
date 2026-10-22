/**
 * Retry-collision + error-diagnostics regression tests.
 *
 * Run: pnpm --filter @workspace/scripts run test:retryfix
 * (node:test + tsx; no database, no network, no API keys.)
 *
 * Bug A: the UI retry resets submissions.attempt_count to 0 while
 * career_generation_attempts keeps UNIQUE(submission_id, attempt). Reusing
 * per-run numbers collides: it masks the real failure AND rolls back an
 * otherwise successful report transaction. Claimed jobs therefore carry a
 * globally increasing attemptNumber (max existing + 1) used by BOTH the
 * success and failure insert paths. These tests simulate two full runs
 * through the real numbering helper and assert the recorded keys stay
 * unique, ordered, and retry-safe.
 *
 * Bug B: pre-usage provider failures previously persisted/logged only a
 * generic error class. describeGenerationError captures a truncated,
 * secret-sanitized message for logs without a schema change.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_PROVIDER_ERROR_DETAIL_LENGTH,
  describeDatabaseCause,
  describeGenerationError,
  describeProviderError,
  nextAttemptNumber,
} from "./generationAttempts";

describe("attempt numbering across retries", () => {
  it("starts at 1 with no history", () => {
    assert.equal(nextAttemptNumber(null), 1);
  });

  it("increments from the stored maximum, ignoring per-run resets", () => {
    assert.equal(nextAttemptNumber(0), 1);
    assert.equal(nextAttemptNumber(1), 2);
    assert.equal(nextAttemptNumber(3), 4);
    assert.equal(nextAttemptNumber(41), 42);
  });

  it("keeps every recorded key unique across an initial failed run plus a retry", () => {
    // Simulates: run 1 records attempts 1-3 and goes terminal; the UI retry
    // resets the per-run counter to 0; run 2 must continue at 4-6.
    const recorded = new Set<string>();
    const claim = (existingMax: number | null, runCount: number) => {
      const n = nextAttemptNumber(existingMax);
      const key = `sub:${n}`;
      assert.ok(!recorded.has(key), `collision on attempt ${n} (run count ${runCount})`);
      recorded.add(key);
      return n;
    };

    let max: number | null = null;
    for (let run = 1; run <= 2; run += 1) {
      for (let perRun = 1; perRun <= 3; perRun += 1) {
        max = claim(max, perRun);
      }
      // UI retry resets the per-run counter; history is NOT reset.
    }
    assert.deepEqual([...recorded], ["sub:1", "sub:2", "sub:3", "sub:4", "sub:5", "sub:6"]);
  });

  it("lets a successful retry persist without conflicting with history", () => {
    // After terminal attempts 1-3, a retry's success must record under a
    // fresh number so the report transaction cannot roll back on conflict.
    const history = new Set([1, 2, 3]);
    const successNumber = nextAttemptNumber(3);
    assert.ok(!history.has(successNumber));
    assert.equal(successNumber, 4);
  });

  it("is deterministic for the same stored maximum", () => {
    assert.equal(nextAttemptNumber(7), nextAttemptNumber(7));
  });
});

describe("generation error description", () => {
  it("keeps the error class and message for plain errors", () => {
    const described = describeGenerationError(new Error("The report model returned no content."));
    assert.equal(described.errorType, "Error");
    assert.equal(described.errorMessage, "The report model returned no content.");
  });

  it("keeps SDK-style error names instead of collapsing them", () => {
    const failure = new Error("429 rate limited");
    failure.name = "RateLimitError";
    const described = describeGenerationError(failure);
    assert.equal(described.errorType, "RateLimitError");
    assert.match(described.errorMessage ?? "", /rate limited/);
  });

  it("handles non-Error thrown values without crashing", () => {
    assert.deepEqual(describeGenerationError("boom"), {
      errorType: "UnknownError",
      errorMessage: "boom",
    });
    assert.deepEqual(describeGenerationError(null), { errorType: "UnknownError", errorMessage: null });
    assert.deepEqual(describeGenerationError(undefined), {
      errorType: "UnknownError",
      errorMessage: null,
    });
    assert.deepEqual(describeGenerationError(42), { errorType: "UnknownError", errorMessage: null });
    assert.deepEqual(describeGenerationError(""), { errorType: "UnknownError", errorMessage: null });
  });

  it("redacts credential-like patterns", () => {
    const described = describeGenerationError(
      new Error('Auth failed for sk-abcdefghij123456 with Bearer abcdefghij123456 and api_key="sekret-value-here"'),
    );
    assert.ok(described.errorMessage);
    assert.doesNotMatch(described.errorMessage ?? "", /sk-abcdefghij/);
    assert.doesNotMatch(described.errorMessage ?? "", /Bearer abcdefghij/);
    assert.doesNotMatch(described.errorMessage ?? "", /sekret-value-here/);
    assert.match(described.errorMessage ?? "", /REDACTED/);
  });

  it("truncates long messages", () => {
    const described = describeGenerationError(new Error("x".repeat(5000)));
    assert.ok(described.errorMessage);
    assert.ok((described.errorMessage ?? "").length <= MAX_ERROR_MESSAGE_LENGTH);
    assert.equal(MAX_ERROR_MESSAGE_LENGTH, 500);
  });

  it("never throws, even for hostile inputs", () => {
    const hostile = [{ toString() { throw new Error("getter boom"); } }, Symbol("s"), 10n];
    for (const value of hostile) {
      assert.doesNotThrow(() => describeGenerationError(value));
    }
  });

  it("redacts Google API keys", () => {
    const described = describeGenerationError(
      new Error("request failed with key AIzaSyAbcdefghij1234567890123456789"),
    );
    assert.ok(described.errorMessage);
    assert.doesNotMatch(described.errorMessage ?? "", /AIzaSyAbcdefghij/);
    assert.match(described.errorMessage ?? "", /REDACTED/);
  });
});

describe("provider error detail", () => {
  function apiError(message: string, status: unknown): Error {
    const failure = new Error(message);
    failure.name = "ApiError";
    (failure as { status?: unknown }).status = status;
    return failure;
  }

  it("captures the sanitized server error body and HTTP status for ApiError only", () => {
    const body = JSON.stringify({
      error: { code: 400, message: "Request contains an invalid argument.", status: "INVALID_ARGUMENT" },
    });
    const detail = describeProviderError(apiError(body, 400));
    assert.equal(detail.providerErrorDetail, body);
    assert.equal(detail.providerErrorStatus, 400);
  });

  it("returns nulls for non-transport failures", () => {
    assert.deepEqual(describeProviderError(new Error("The report model returned no content.")), {
      providerErrorDetail: null,
      providerErrorStatus: null,
    });
    assert.deepEqual(describeProviderError("boom"), {
      providerErrorDetail: null,
      providerErrorStatus: null,
    });
    assert.deepEqual(describeProviderError(null), {
      providerErrorDetail: null,
      providerErrorStatus: null,
    });
  });

  it("truncates the diagnostic field and redacts keys", () => {
    const detail = describeProviderError(
      apiError(`{"error":{"message":"AIzaSyAbcdefghij1234567890123456789 ${"x".repeat(5000)}"}}`, 400),
    );
    assert.ok(detail.providerErrorDetail);
    assert.ok((detail.providerErrorDetail ?? "").length <= MAX_PROVIDER_ERROR_DETAIL_LENGTH);
    assert.equal(MAX_PROVIDER_ERROR_DETAIL_LENGTH, 2000);
    assert.doesNotMatch(detail.providerErrorDetail ?? "", /AIzaSyAbcdefghij/);
    assert.match(detail.providerErrorDetail ?? "", /REDACTED/);
    assert.equal(detail.providerErrorStatus, 400);
  });

  it("drops non-numeric status values and empty messages", () => {
    assert.deepEqual(describeProviderError(apiError("detail", "400")).providerErrorStatus, null);
    assert.deepEqual(describeProviderError(apiError("", 400)), {
      providerErrorDetail: null,
      providerErrorStatus: 400,
    });
  });

  it("never throws, even for hostile inputs", () => {
    const hostile = [{ toString() { throw new Error("getter boom"); } }, Symbol("s"), 10n, 42, ""];
    for (const value of hostile) {
      assert.doesNotThrow(() => describeProviderError(value));
    }
  });
});

describe("database cause description", () => {
  /** Mimics DrizzleQueryError: SQL + params in the wrapper message, pg error on cause. */
  function drizzleLikeWrapper(inner: unknown): Error {
    const wrapper = new Error(
      'Failed query: update "career_submissions" set "status" = $1\nparams: pending,secret-answer-payload',
    );
    (wrapper as { cause?: unknown }).cause = inner;
    return wrapper;
  }

  function pgError(message: string, code: unknown): Error {
    const failure = new Error(message);
    (failure as { code?: unknown }).code = code;
    return failure;
  }

  it("extracts a nested constraint error and never leaks SQL or params", () => {
    const inner = pgError('duplicate key value violates unique constraint "career_results_submission_unique"', "23505");
    const described = describeDatabaseCause(drizzleLikeWrapper(inner));
    assert.equal(described.dbErrorCode, "23505");
    assert.equal(described.dbErrorMessage, inner.message);
    assert.doesNotMatch(described.dbErrorMessage ?? "", /Failed query/);
    assert.doesNotMatch(described.dbErrorMessage ?? "", /secret-answer-payload/);
  });

  it("extracts a nested connectivity error", () => {
    const described = describeDatabaseCause(
      drizzleLikeWrapper(pgError("Connection terminated unexpectedly", "ECONNRESET")),
    );
    assert.equal(described.dbErrorCode, "ECONNRESET");
    assert.equal(described.dbErrorMessage, "Connection terminated unexpectedly");
  });

  it("handles missing, numeric, and non-string codes", () => {
    assert.equal(describeDatabaseCause(pgError("boom", undefined)).dbErrorCode, null);
    assert.equal(describeDatabaseCause(pgError("boom", 42)).dbErrorCode, "42");
    assert.equal(describeDatabaseCause(pgError("boom", { sqlstate: "XX000" })).dbErrorCode, null);
    assert.equal(describeDatabaseCause(pgError("plain failure", undefined)).dbErrorMessage, "plain failure");
  });

  it("sanitizes and truncates the underlying message", () => {
    const described = describeDatabaseCause(
      pgError(`key AIzaSyAbcdefghij1234567890123456789 ${"y".repeat(5000)}`, "XX000"),
    );
    assert.ok(described.dbErrorMessage);
    assert.ok((described.dbErrorMessage ?? "").length <= MAX_ERROR_MESSAGE_LENGTH);
    assert.doesNotMatch(described.dbErrorMessage ?? "", /AIzaSyAbcdefghij/);
    assert.match(described.dbErrorMessage ?? "", /REDACTED/);
  });

  it("returns nulls for non-Error inputs", () => {
    assert.deepEqual(describeDatabaseCause("boom"), { dbErrorCode: null, dbErrorMessage: null });
    assert.deepEqual(describeDatabaseCause(null), { dbErrorCode: null, dbErrorMessage: null });
  });

  it("never throws on cyclic or malformed cause chains", () => {
    const selfCycle = new Error("self");
    (selfCycle as { cause?: unknown }).cause = selfCycle;
    const first = new Error("first");
    const second = new Error("second");
    (first as { cause?: unknown }).cause = second;
    (second as { cause?: unknown }).cause = first;
    const stringCause = new Error("string cause");
    (stringCause as { cause?: unknown }).cause = "not-an-error";
    const throwingCause = new Error("throwing cause");
    Object.defineProperty(throwingCause, "cause", {
      get() { throw new Error("getter boom"); },
    });
    for (const value of [selfCycle, first, stringCause, throwingCause, Symbol("s"), 10n]) {
      assert.doesNotThrow(() => describeDatabaseCause(value));
    }
    // A self-cyclic error resolves to itself without hanging.
    assert.equal(describeDatabaseCause(selfCycle).dbErrorMessage, "self");
    // A non-Error cause stops the walk at the outer error.
    assert.equal(describeDatabaseCause(stringCause).dbErrorMessage, "string cause");
  });
});
