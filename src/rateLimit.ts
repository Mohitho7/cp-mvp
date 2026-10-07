export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_MAX_REQUESTS = 5;

export function rateLimitKey(userId: string): string {
  return `submit:${userId}`;
}

/** Window start (floored) for a given timestamp — pure, testable. */
export function rateLimitWindowStart(nowMs: number): number {
  return Math.floor(nowMs / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
}
