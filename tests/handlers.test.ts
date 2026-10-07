import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleCreateSubmission,
  handleGetSubmission,
  handleRetrySubmission,
  handleGetDashboard,
  type SubmissionStore,
  type SubmissionContext,
  type OwnedSubmission,
} from "../src/handlers.js";
import { demoAnswers } from "../src/seed.js";
import type { SubmissionAnswers } from "../src/reportSchema.js";

interface FakeDb {
  students: Map<string, { id: string; institutionId: string; clerkUserId: string; department: string; year: string; batch: string }>;
  submissions: Map<string, { id: string; studentId: string; status: "pending" | "processing" | "done" | "failed"; submittedAt: Date; report: null; error: string | null }>;
  rateLimitedKeys: Set<string>;
  raceOnCreate: boolean;
}

function makeStore(db: FakeDb): SubmissionStore {
  const uuid = (n: number) =>
    `123e4567-e89b-12d3-a456-426614174${String(n).padStart(3, "0")}`;
  let seq = db.students.size + db.submissions.size;
  return {
    findStudent: async (institutionId, clerkUserId) => {
      for (const s of db.students.values()) {
        if (s.institutionId === institutionId && s.clerkUserId === clerkUserId) return s;
      }
      return null;
    },
    createStudent: async (input) => {
      seq += 1;
      const id = uuid(seq);
      const row = { id, ...input };
      db.students.set(id, row);
      return row;
    },
    updateStudentCohort: async () => {},
    findSubmissionByStudent: async (studentId) => {
      for (const s of db.submissions.values()) {
        if (s.studentId === studentId) return { id: s.id };
      }
      return null;
    },
    createSubmission: async (studentId) => {
      if (db.raceOnCreate) return null;
      seq += 1;
      const id = uuid(100 + seq);
      db.submissions.set(id, {
        id, studentId, status: "pending", submittedAt: new Date(0), report: null, error: null,
      });
      return { id, createdAt: new Date(0) };
    },
    getOwnedSubmission: async (clerkUserId, submissionId) => {
      const student = [...db.students.values()].find((s) => s.clerkUserId === clerkUserId);
      if (!student) return null;
      const list = [...db.submissions.values()].filter((s) => s.studentId === student.id);
      const found = submissionId ? list.find((s) => s.id === submissionId) : list[0];
      if (!found) return null;
      const row: OwnedSubmission = {
        id: found.id, status: found.status, submittedAt: found.submittedAt, report: null, error: found.error,
      };
      return row;
    },
    requeueFailedSubmission: async (submissionId) => {
      const sub = db.submissions.get(submissionId);
      if (!sub || sub.status !== "failed") return null;
      sub.status = "pending";
      return { id: sub.id, createdAt: sub.submittedAt };
    },
    checkRateLimit: async (key) => {
      if (db.rateLimitedKeys.has(key)) return { allowed: false, retryAfterSec: 60 };
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}

function ctx(db: FakeDb, clerkUserId = "student-A"): SubmissionContext {
  return {
    store: makeStore(db),
    institution: { id: "inst-1", name: "Test Institute" },
    clerkUserId,
    now: new Date(1_000_000),
  };
}

function validBody() {
  return {
    answers: demoAnswers() as SubmissionAnswers,
    department: "CSE",
    year: "3rd Year",
    batch: "2023–2027",
    consent: true as const,
  };
}

describe("POST /api/submit", () => {
  it("creates a pending submission and returns 201", async () => {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(), raceOnCreate: false };
    const result = await handleCreateSubmission(ctx(db), validBody());
    assert.equal(result.status, 201);
    assert.equal((result.body as { status: string }).status, "pending");
  });

  it("rejects invalid input with 400", async () => {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(), raceOnCreate: false };
    const result = await handleCreateSubmission(ctx(db), { ...validBody(), consent: false });
    assert.equal(result.status, 400);
  });

  it("blocks a second submission with 409", async () => {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(), raceOnCreate: false };
    const first = await handleCreateSubmission(ctx(db), validBody());
    assert.equal(first.status, 201);
    const second = await handleCreateSubmission(ctx(db), validBody());
    assert.equal(second.status, 409);
  });

  it("maps a lost insert race to 409, not 500", async () => {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(), raceOnCreate: true };
    const result = await handleCreateSubmission(ctx(db), validBody());
    assert.equal(result.status, 409);
  });

  it("rate-limits with 429", async () => {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(["submit:student-A"]), raceOnCreate: false };
    const result = await handleCreateSubmission(ctx(db), validBody());
    assert.equal(result.status, 429);
    assert.equal(result.retryAfterSec, 60);
  });

  it("returns 503 when no institution is configured", async () => {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(), raceOnCreate: false };
    const result = await handleCreateSubmission({ ...ctx(db), institution: null }, validBody());
    assert.equal(result.status, 503);
  });
});

describe("GET /api/result/:id ownership", () => {
  async function seeded(): Promise<{ db: FakeDb; id: string }> {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(), raceOnCreate: false };
    const created = await handleCreateSubmission(ctx(db, "student-B"), validBody());
    assert.equal(created.status, 201);
    return { db, id: (created.body as { id: string }).id };
  }

  it("returns 200 for the owning student", async () => {
    const { db, id } = await seeded();
    const result = await handleGetSubmission(ctx(db, "student-B"), id);
    assert.equal(result.status, 200);
  });

  it("returns 404 for another student's submission", async () => {
    const { db, id } = await seeded();
    const result = await handleGetSubmission(ctx(db, "student-A"), id);
    assert.equal(result.status, 404);
  });

  it("returns 400 for a malformed UUID", async () => {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(), raceOnCreate: false };
    const result = await handleGetSubmission(ctx(db), "not-a-uuid");
    assert.equal(result.status, 400);
  });
});

describe("POST /api/result/:id/retry", () => {
  it("returns 409 when the report is not failed", async () => {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(), raceOnCreate: false };
    const created = await handleCreateSubmission(ctx(db), validBody());
    const id = (created.body as { id: string }).id;
    const result = await handleRetrySubmission(ctx(db), id);
    assert.equal(result.status, 409);
  });

  it("requeues a failed report with 202", async () => {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(), raceOnCreate: false };
    const created = await handleCreateSubmission(ctx(db), validBody());
    const id = (created.body as { id: string }).id;
    db.submissions.get(id)!.status = "failed";
    const result = await handleRetrySubmission(ctx(db), id);
    assert.equal(result.status, 202);
  });

  it("returns 404 for an unknown submission", async () => {
    const db: FakeDb = { students: new Map(), submissions: new Map(), rateLimitedKeys: new Set(), raceOnCreate: false };
    const result = await handleRetrySubmission(ctx(db), "123e4567-e89b-12d3-a456-426614174000");
    assert.equal(result.status, 404);
  });
});

describe("GET /api/dashboard authorization", () => {
  it("returns 403 for non-admin callers", async () => {
    const result = await handleGetDashboard(null, {}, async () => {
      throw new Error("must not be called");
    });
    assert.equal(result.status, 403);
  });

  it("returns 400 for invalid filters", async () => {
    const result = await handleGetDashboard(
      { institutionId: "inst-1", institutionName: "Test" },
      { department: 42 },
      async () => {
        throw new Error("must not be called");
      },
    );
    assert.equal(result.status, 400);
  });

  it("returns 200 with the aggregated dashboard", async () => {
    const result = await handleGetDashboard(
      { institutionId: "inst-1", institutionName: "Test" },
      { department: "CSE" },
      async (_id, _name, filters) => {
        assert.equal(filters.department, "CSE");
        return {
          institutionName: "Test",
          totalStudents: 6,
          statusCounts: { pending: 0, processing: 0, done: 6, failed: 0 },
          completedReports: 6,
          dataSuppressed: false,
          trackDistribution: [],
          clarityDistribution: [],
          workerTypeDistribution: [],
          traitAverages: { technical: 3, creative: 3, people: 3, risk: 3, learning: 3 },
          topSkills: [],
          topCareers: [],
          entryRoles: [],
          marketBarrierDistribution: [],
          longTermCaliberDistribution: [],
          careersToAvoid: [],
          commonConflicts: [],
          departmentOptions: ["CSE"],
          yearOptions: [],
          batchOptions: [],
        };
      },
    );
    assert.equal(result.status, 200);
  });
});
