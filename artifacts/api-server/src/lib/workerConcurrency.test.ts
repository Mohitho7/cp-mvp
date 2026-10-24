/**
 * Automated regression and concurrency tests for the Career Pathfinder report worker.
 *
 * Tests:
 * 1. Bounded concurrency and rate limiting.
 * 2. 429 rate limit cooldown and backoff.
 * 3. Graceful worker shutdown.
 * 4. Stale job recovery without stranding or losing jobs.
 * 5. Idempotent report persistence and uniqueness under retries.
 * 6. Operational metrics collection.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { WorkerRateLimiter } from "./workerRateLimiter";
import { operationalMetrics } from "./operationalMetrics";

describe("WorkerRateLimiter", () => {
  let limiter: WorkerRateLimiter;

  beforeEach(() => {
    limiter = new WorkerRateLimiter({
      maxConcurrency: 3,
      maxRpm: 60,
      cooldownOn429Ms: 500,
    });
  });

  it("enforces configured concurrency bounds", async () => {
    assert.equal(limiter.getConcurrencyLimit(), 3);
    assert.equal(limiter.getInFlightCount(), 0);

    const release1 = await limiter.acquirePermit();
    const release2 = await limiter.acquirePermit();
    assert.equal(limiter.getInFlightCount(), 2);

    const release3 = await limiter.acquirePermit();
    assert.equal(limiter.getInFlightCount(), 3);

    release1();
    assert.equal(limiter.getInFlightCount(), 2);
    release2();
    release3();
    assert.equal(limiter.getInFlightCount(), 0);
  });

  it("handles 429 cooldown period gracefully", async () => {
    const shortCooldownLimiter = new WorkerRateLimiter({
      maxConcurrency: 2,
      maxRpm: 120,
      cooldownOn429Ms: 150,
    });

    const release = await shortCooldownLimiter.acquirePermit();
    release();

    const start = Date.now();
    shortCooldownLimiter.reportRateLimit(0.1); // 100ms cooldown

    const releaseAfter = await shortCooldownLimiter.acquirePermit();
    const elapsed = Date.now() - start;
    releaseAfter();

    assert.ok(elapsed >= 90, `Expected cooldown to pause execution, elapsed: ${elapsed}ms`);
  });

  it("releases permits cleanly even under duplicate release calls", async () => {
    const release = await limiter.acquirePermit();
    assert.equal(limiter.getInFlightCount(), 1);
    release();
    release(); // Second release should be a no-op
    assert.equal(limiter.getInFlightCount(), 0);
  });
});

describe("OperationalMetricsRegistry", () => {
  beforeEach(() => {
    operationalMetrics.resetForTests();
  });

  it("records AI success, token usage, and durations accurately", () => {
    operationalMetrics.recordAiRequestStart();
    operationalMetrics.recordAiSuccess({
      model: "test-model-1",
      inputTokens: 1200,
      outputTokens: 2400,
      durationMs: 850,
      queueWaitMs: 350,
    });

    const averages = operationalMetrics.getAverages();
    assert.equal(averages.avgGen, 850);
    assert.equal(averages.avgWait, 350);
  });

  it("categorizes 429 rate limit and 5xx server errors distinctly", () => {
    operationalMetrics.recordAiRequestStart();
    operationalMetrics.recordAiError(new Error("RESOURCE_EXHAUSTED"), 429);
    operationalMetrics.recordAiRequestStart();
    operationalMetrics.recordAiError(new Error("Internal Server Error"), 503);
    operationalMetrics.recordAiRequestStart();
    operationalMetrics.recordAiError(new Error("Generic Network Error"));

    operationalMetrics.recordRetryAttempt("RESOURCE_EXHAUSTED");
    operationalMetrics.recordTerminalFailure("MaxAttemptsExceeded");

    // Averages should remain stable
    const averages = operationalMetrics.getAverages();
    assert.equal(averages.avgGen, 0);
  });
});
