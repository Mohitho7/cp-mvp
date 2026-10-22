/**
 * Generation-attempt bookkeeping helpers (pure, no I/O).
 *
 * Two hardened behaviors live here:
 *
 * 1. Attempt numbering: the submissions.attempt_count column is a PER-RUN
 *    counter (reset to 0 by the UI retry endpoint, driving the 3-attempt
 *    terminal rule and backoff). The career_generation_attempts table has a
 *    UNIQUE(submission_id, attempt) constraint, so reusing per-run numbers
 *    across retries collides: it masks the real failure AND rolls back an
 *    otherwise successful report transaction. Claimed jobs therefore carry a
 *    globally increasing attemptNumber (max existing + 1), used by BOTH the
 *    success and failure insert paths.
 *
 * 2. Error description: the worker persists/logs only an error class by
 *    default, which previously made pre-usage provider failures
 *    undiagnosable. describeGenerationError captures the class plus a
 *    truncated, sanitized message. Only the error value is inspected — call
 *    sites must never pass answers, reports, or credentials in.
 *
 * 3. Provider error detail (temporary diagnostic): provider SDK transport
 *    errors (ApiError) carry the full server error body in `message`.
 *    describeProviderError captures a sanitized, truncated copy plus the HTTP
 *    status for logging only. Call sites must restrict it to transport
 *    errors — never prompts, answers, reports, or request payloads.
 */

export const MAX_ERROR_MESSAGE_LENGTH = 500;
export const MAX_PROVIDER_ERROR_DETAIL_LENGTH = 2000;

export interface GenerationErrorDescription {
  errorType: string;
  errorMessage: string | null;
}

/** Next globally-unique attempt number given the current stored maximum. */
export function nextAttemptNumber(maxExistingAttempt: number | null): number {
  return (maxExistingAttempt ?? 0) + 1;
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /sk-[A-Za-z0-9\-_]{8,}/g, replacement: "sk-[REDACTED]" },
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/=]{8,}/g, replacement: "Bearer [REDACTED]" },
  { pattern: /AIza[A-Za-z0-9\-_]{10,}/g, replacement: "AIza[REDACTED]" },
  {
    pattern: /api[_-]?key\s*[:=]\s*['"]?[^'"\s,}]{4,}/gi,
    replacement: "api_key=[REDACTED]",
  },
];

function sanitizeMessage(message: string): string {
  let result = message;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Safely describes any thrown value for structured logging. Never throws,
 * never includes credentials, and never inspects anything but the error.
 */
export function describeGenerationError(error: unknown): GenerationErrorDescription {
  if (error instanceof Error) {
    const raw = error.message ?? "";
    const message = sanitizeMessage(raw).slice(0, MAX_ERROR_MESSAGE_LENGTH);
    return { errorType: error.name || "Error", errorMessage: message === "" ? null : message };
  }
  if (typeof error === "string") {
    const message = sanitizeMessage(error).slice(0, MAX_ERROR_MESSAGE_LENGTH);
    return { errorType: "UnknownError", errorMessage: message === "" ? null : message };
  }
  return { errorType: "UnknownError", errorMessage: null };
}

export interface ProviderErrorDetail {
  providerErrorDetail: string | null;
  providerErrorStatus: number | null;
}

/**
 * Captures a sanitized, truncated copy of a provider SDK transport error for
 * logging only. Only ApiError values qualify: their message is the
 * server-generated error body (code/message/status/details metadata), never
 * prompts, answers, reports, or credentials. Everything else yields nulls so
 * non-transport failures (validation, empty content) stay out of the
 * diagnostic field. Never throws and never inspects anything but the error.
 */
export function describeProviderError(error: unknown): ProviderErrorDetail {
  const none: ProviderErrorDetail = {
    providerErrorDetail: null,
    providerErrorStatus: null,
  };
  if (!(error instanceof Error) || error.name !== "ApiError") {
    return none;
  }
  const raw = error.message ?? "";
  const detail = sanitizeMessage(raw).slice(0, MAX_PROVIDER_ERROR_DETAIL_LENGTH);
  const status = (error as { status?: unknown }).status;
  return {
    providerErrorDetail: detail === "" ? null : detail,
    providerErrorStatus: typeof status === "number" ? status : null,
  };
}

export interface DatabaseCauseDescription {
  dbErrorCode: string | null;
  dbErrorMessage: string | null;
}

/** Walks nested `.cause` values to the innermost error. Cycle-safe. */
function innermostCause(error: Error): Error {
  const seen = new Set<unknown>([error]);
  let current = error;
  while (current.cause instanceof Error && !seen.has(current.cause)) {
    seen.add(current.cause);
    current = current.cause;
  }
  return current;
}

/**
 * Describes the underlying driver error behind a wrapper such as
 * DrizzleQueryError, whose own message embeds SQL text and parameter values
 * and must never be logged. Only the innermost error's sanitized message
 * (truncated) and code (string/number only) are returned. Never throws, even
 * for malformed or cyclic cause chains, and never inspects anything but the
 * error chain.
 */
export function describeDatabaseCause(error: unknown): DatabaseCauseDescription {
  const none: DatabaseCauseDescription = {
    dbErrorCode: null,
    dbErrorMessage: null,
  };
  try {
    if (!(error instanceof Error)) {
      return none;
    }
    const root = innermostCause(error);
    const raw = root.message ?? "";
    const message = sanitizeMessage(raw).slice(0, MAX_ERROR_MESSAGE_LENGTH);
    const code = (root as { code?: unknown }).code;
    return {
      dbErrorCode: typeof code === "string" || typeof code === "number" ? String(code) : null,
      dbErrorMessage: message === "" ? null : message,
    };
  } catch {
    return none;
  }
}
