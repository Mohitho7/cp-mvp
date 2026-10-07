import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isTerminalAttempt,
  retryDelayMs,
  nextAttemptAt,
  processOneDueJob,
  type ClaimedJob,
  type WorkerStore,
} from "../src/worker.js";
import { isDataSuppressed, PRIVACY_THRESHOLD } from "../src/dashboard.js";
import {
  rateLimitWindowStart,
  RATE_LIMIT_WINDOW_MS,
} from "../src/rateLimit.js";
import { createDemoReport } from "../src/seed.js";

describe("retry policy", () => {
  it("retries twice, then terminates on the third attempt", () => {
    assert.equal(isTerminalAttempt(1), false);
    assert.equal(isTerminalAttempt(2), false);
    assert.equal(isTerminalAttempt(3), true);
    assert.equal(isTerminalAttempt(4), true);
  });

  it("backs off 30s then 120s, with no delay once terminal", () => {
    assert.equal(retryDelayMs(1), 30_000);
    assert.equal(retryDelayMs(2), 120_000);
    assert.equal(retryDelayMs(3), 0);
  });

  it("computes absolute retry timestamps", () => {
    const at = nextAttemptAt(1, 1_000_000).getTime();
    assert.equal(at, 1_030_000);
  });
});

describe("privacy threshold", () => {
  it("suppresses below 5 and reveals at 5+", () => {
    assert.equal(PRIVACY_THRESHOLD, 5);
    assert.equal(isDataSuppressed(0), true);
    assert.equal(isDataSuppressed(4), true);
    assert.equal(isDataSuppressed(5), false);
    assert.equal(isDataSuppressed(120), false);
  });
});

describe("rate-limit window", () => {
  it("floors timestamps to 15-minute windows", () => {
    assert.equal(RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
    assert.equal(rateLimitWindowStart(1_800_001), 1_800_000);
    assert.equal(rateLimitWindowStart(900_000), 900_000);
  });
});

interface FakeState {
  claimed: ClaimedJob | null;
  completed: string[];
  failures: Array<{ attempt: number; terminal: boolean }>;
}

function fakeStore(state: FakeState, attemptCount: number): WorkerStore {
  return {
    recoverStaleJobs: async () => {},
    claimNextJob: async () => {
      if (!state.claimed) return null;
      return { ...state.claimed, attemptCount };
    },
    completeJob: async (jobId) => {
      state.completed.push(jobId);
    },
    failJob: async (_jobId, attempt) => {
      const terminal = attempt >= 3;
      state.failures.push({ attempt, terminal });
      return { terminal };
    },
  };
}

function fakeJob(): ClaimedJob {
  return {
    id: "job-1",
    attemptCount: 1,
    answers: {
      q1: "a", q2: ["a"], q3: ["a"], q4: ["a"], q5: "a", q6: ["a"],
      q7: ["a"], q8: ["a"], q9: ["a"], q10: ["a"], q11: ["a"], q12: "a", q13: "",
    },
    department: "CSE",
    year: "3rd Year",
    batch: "2023–2027",
    institutionName: "Test Institute",
  };
}

describe("durable queue worker", () => {
  it("completes a job when the model succeeds", async () => {
    const state: FakeState = { claimed: fakeJob(), completed: [], failures: [] };
    const didWork = await processOneDueJob(fakeStore(state, 1), async () => ({
      report: createDemoReport(0),
      model: "test-model",
      inputTokens: 10,
      outputTokens: 20,
    }));
    assert.equal(didWork, true);
    assert.deepEqual(state.completed, ["job-1"]);
    assert.deepEqual(state.failures, []);
  });

  it("returns false when no job is due", async () => {
    const state: FakeState = { claimed: null, completed: [], failures: [] };
    const didWork = await processOneDueJob(fakeStore(state, 1), async () => {
      throw new Error("must not be called");
    });
    assert.equal(didWork, false);
  });

  it("fails terminally on the third attempt and never schedules a fourth", async () => {
    for (const attempt of [1, 2, 3]) {
      const state: FakeState = { claimed: fakeJob(), completed: [], failures: [] };
      await processOneDueJob(fakeStore(state, attempt), async () => {
        throw new Error("LLM outage");
      });
      assert.equal(state.completed.length, 0);
      assert.equal(state.failures.length, 1);
      assert.equal(state.failures[0].attempt, attempt);
      assert.equal(state.failures[0].terminal, attempt >= 3);
    }
  });
});
