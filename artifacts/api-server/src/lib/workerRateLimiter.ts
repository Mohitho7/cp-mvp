/**
 * Provider-Safe Rate and Concurrency Limiter for Career Report Workers.
 *
 * Coordinates throughput across concurrent workers and protects AI providers
 * from 429 rate limit errors and synchronized traffic spikes.
 */
import { logger } from "./logger";

export interface RateLimiterOptions {
  /** Maximum requests per minute allowed (default: 15) */
  maxRpm?: number;
  /** Maximum concurrent in-flight requests (default: 3) */
  maxConcurrency?: number;
  /** Cooldown duration in milliseconds after receiving a 429 (default: 30,000) */
  cooldownOn429Ms?: number;
}

export class WorkerRateLimiter {
  private maxRpm: number;
  private maxConcurrency: number;
  private cooldownOn429Ms: number;
  private inFlight = 0;
  private requestTimestamps: number[] = [];
  private cooldownUntil = 0;

  constructor(options: RateLimiterOptions = {}) {
    const envRpm = process.env.REPORT_WORKER_RPM
      ? parseInt(process.env.REPORT_WORKER_RPM, 10)
      : undefined;
    const envConcurrency = process.env.REPORT_WORKER_CONCURRENCY
      ? parseInt(process.env.REPORT_WORKER_CONCURRENCY, 10)
      : undefined;

    this.maxRpm = Math.max(1, options.maxRpm ?? envRpm ?? 15);
    this.maxConcurrency = Math.max(1, options.maxConcurrency ?? envConcurrency ?? 3);
    this.cooldownOn429Ms = Math.max(5000, options.cooldownOn429Ms ?? 30_000);
  }

  getConcurrencyLimit(): number {
    if (process.env.REPORT_WORKER_CONCURRENCY) {
      const parsed = parseInt(process.env.REPORT_WORKER_CONCURRENCY, 10);
      if (parsed > 0) return parsed;
    }
    return this.maxConcurrency;
  }

  setConcurrencyLimit(limit: number): void {
    if (limit > 0) {
      this.maxConcurrency = limit;
    }
  }

  getRpmLimit(): number {
    if (process.env.REPORT_WORKER_RPM) {
      const parsed = parseInt(process.env.REPORT_WORKER_RPM, 10);
      if (parsed > 0) return parsed;
    }
    return this.maxRpm;
  }

  setRpmLimit(limit: number): void {
    if (limit > 0) {
      this.maxRpm = limit;
    }
  }

  getInFlightCount(): number {
    return this.inFlight;
  }

  /**
   * Registers a 429 rate-limit event, setting a global cooldown across this process.
   * If retryAfterSeconds is provided by the provider header, respects it.
   */
  reportRateLimit(retryAfterSeconds?: number): void {
    const durationMs = retryAfterSeconds && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : this.cooldownOn429Ms;
    // Add 10% jitter to prevent synchronized retry spikes
    const jitter = Math.floor(Math.random() * 2000);
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + durationMs + jitter);
    logger.warn(
      { cooldownUntil: new Date(this.cooldownUntil).toISOString(), durationMs },
      "AI provider rate limit encountered: worker entering rate-limit cooldown",
    );
  }

  /**
   * Waits for an available execution permit conforming to RPM and concurrency limits.
   */
  async acquirePermit(): Promise<() => void> {
    while (true) {
      const now = Date.now();

      // Check if currently under 429 cooldown
      if (now < this.cooldownUntil) {
        const sleepMs = this.cooldownUntil - now + 100;
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }

      // Check concurrency
      if (this.inFlight >= this.maxConcurrency) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }

      // Clean up old timestamps (older than 60s)
      const windowStart = now - 60_000;
      while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < windowStart) {
        this.requestTimestamps.shift();
      }

      // Check RPM window
      if (this.requestTimestamps.length >= this.maxRpm) {
        const oldest = this.requestTimestamps[0];
        const waitMs = Math.max(100, oldest + 60_000 - now + 50);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // Permit granted
      this.inFlight += 1;
      this.requestTimestamps.push(Date.now());
      break;
    }

    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.inFlight = Math.max(0, this.inFlight - 1);
      }
    };
  }

  reset(): void {
    this.inFlight = 0;
    this.requestTimestamps = [];
    this.cooldownUntil = 0;
  }
}

export const globalWorkerRateLimiter = new WorkerRateLimiter();
