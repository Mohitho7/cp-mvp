/**
 * Batch 1 tests — assessment draft persistence with student context.
 *
 * Run: pnpm --filter @workspace/scripts run test:batch1
 * (node:test + tsx; browser-free via an in-memory storage double)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_STORAGE_KEY,
  graduationYearOptions,
  readAssessmentDraft,
  writeAssessmentDraft,
  type AssessmentDraft,
  type DraftStorage,
} from "./assessmentDraft";

const QUESTION_COUNT = 13;

function memoryStorage(initial?: Record<string, string>): DraftStorage {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function fullDraft(): AssessmentDraft {
  return {
    version: 1,
    screen: "quiz",
    currentQ: 4,
    answers: Array<string | null>(QUESTION_COUNT).fill(null),
    textInput: "",
    userType: "student",
    department: "Computer Science & Engineering",
    year: "3rd Year",
    batch: "2023–2027",
    degree: "B.Tech Computer Science",
    graduationYear: 2027,
    availableHoursPerWeek: 12,
    consent: true,
  };
}

describe("assessment draft persistence", () => {
  it("round-trips the new student-context fields", () => {
    const storage = memoryStorage();
    assert.equal(writeAssessmentDraft(storage, fullDraft()), true);
    const restored = readAssessmentDraft(storage, QUESTION_COUNT);
    assert.deepEqual(restored, fullDraft());
  });

  it("reads pre-Batch-1 drafts without crashing and fills defaults", () => {
    const oldDraft = fullDraft();
    const raw = JSON.parse(JSON.stringify(oldDraft)) as Record<string, unknown>;
    delete raw.degree;
    delete raw.graduationYear;
    delete raw.availableHoursPerWeek;
    const storage = memoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(raw) });

    const restored = readAssessmentDraft(storage, QUESTION_COUNT);
    assert.ok(restored !== null);
    assert.equal(restored?.degree, "");
    assert.equal(restored?.graduationYear, null);
    assert.equal(restored?.availableHoursPerWeek, null);
    // The old draft is preserved (not discarded) so answers survive.
    assert.equal(storage.getItem(DRAFT_STORAGE_KEY), JSON.stringify(raw));
  });

  it("returns null for corrupt or versioned-out drafts", () => {
    const corrupt = memoryStorage({ [DRAFT_STORAGE_KEY]: "{not json" });
    assert.equal(readAssessmentDraft(corrupt, QUESTION_COUNT), null);

    const wrongVersion = memoryStorage({
      [DRAFT_STORAGE_KEY]: JSON.stringify({ ...fullDraft(), version: 99 }),
    });
    assert.equal(readAssessmentDraft(wrongVersion, QUESTION_COUNT), null);
    assert.equal(wrongVersion.getItem(DRAFT_STORAGE_KEY), null);
  });

  it("exposes a dynamic graduation-year window", () => {
    const options = graduationYearOptions(new Date("2026-06-01T00:00:00Z"));
    assert.deepEqual(options[0], 2024);
    assert.deepEqual(options[options.length - 1], 2034);
    assert.equal(options.length, 11);
  });
});
