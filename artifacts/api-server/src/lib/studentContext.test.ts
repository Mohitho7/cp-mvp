/**
 * Batch 1 tests — student context validation, persistence mapping,
 * submission-endpoint behaviour, worker prompt separation, and
 * retrieval-contract non-exposure.
 *
 * Run: pnpm --filter @workspace/scripts run test:batch1
 * (node:test + tsx; no database required, no queries are executed)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GetCareerSubmissionResponse,
  type CareerSubmissionInput,
} from "@workspace/api-zod";
import {
  graduationYearRange,
  studentContextPromptLines,
  toStudentContextColumns,
  validateStudentContext,
} from "./studentContext";
import { validateSubmissionInput } from "../routes/careerDiscovery";

const VALID_ANSWERS = {
  q1: "Solving difficult problems",
  q2: ["Watching tech / coding videos", "Exploring AI tools"],
  q3: ["Learning random stuff online"],
  q4: ["Writing code or working with tools"],
  q5: "I actually enjoy it",
  q6: ["Building real projects while learning"],
  q7: ["Too many meetings or people interactions"],
  q8: ["Learning random stuff online"],
  q9: ["Stable corporate structure"],
  q10: ["Working with AI or automation tools"],
  q11: ["Financial freedom — options and wealth"],
  q12: "I genuinely enjoy constantly learning new things",
  q13: "",
} satisfies CareerSubmissionInput["answers"];

function validPayload(): Record<string, unknown> {
  const range = graduationYearRange();
  return {
    answers: VALID_ANSWERS,
    department: "Computer Science & Engineering",
    year: "3rd Year",
    batch: "2023–2027",
    degree: "B.Tech Computer Science",
    graduationYear: range.min + 1,
    availableHoursPerWeek: 12,
    consent: true,
  };
}

describe("validateStudentContext", () => {
  it("accepts a valid degree + graduation year + hours (trims degree)", () => {
    const range = graduationYearRange();
    const result = validateStudentContext({
      degree: "  B.Tech CSE - Data Science  ",
      graduationYear: range.max,
      availableHoursPerWeek: 15,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.context : null, {
      degree: "B.Tech CSE - Data Science",
      graduationYear: range.max,
      availableHoursPerWeek: 15,
    });
  });

  it("accepts boundary years and boundary hours", () => {
    const range = graduationYearRange();
    for (const year of [range.min, range.max]) {
      for (const hours of [1, 60]) {
        const result = validateStudentContext({
          degree: "BCA",
          graduationYear: year,
          availableHoursPerWeek: hours,
        });
        assert.equal(result.ok, true, `year=${year} hours=${hours}`);
      }
    }
  });

  it("rejects an empty degree", () => {
    for (const degree of ["", "   "]) {
      const result = validateStudentContext({
        degree,
        graduationYear: graduationYearRange().min,
        availableHoursPerWeek: 10,
      });
      assert.equal(result.ok, false);
    }
  });

  it("rejects a degree longer than 100 characters", () => {
    const result = validateStudentContext({
      degree: "x".repeat(101),
      graduationYear: graduationYearRange().min,
      availableHoursPerWeek: 10,
    });
    assert.equal(result.ok, false);
  });

  it("rejects invalid graduation years", () => {
    const range = graduationYearRange();
    const badYears = [range.min - 1, range.max + 1, 1999, 2100, 2027.5, "soon", "", null, undefined, true];
    for (const graduationYear of badYears) {
      const result = validateStudentContext({
        degree: "B.Sc Mathematics",
        graduationYear,
        availableHoursPerWeek: 10,
      });
      assert.equal(result.ok, false, `year=${String(graduationYear)}`);
    }
  });

  it("rejects invalid weekly hours (zero, negative, decimal, out of range)", () => {
    const badHours = [0, -5, 2.5, 61, 101, 169, 1000, "lots", "", null, undefined, false];
    for (const availableHoursPerWeek of badHours) {
      const result = validateStudentContext({
        degree: "BA Economics",
        graduationYear: graduationYearRange().min,
        availableHoursPerWeek,
      });
      assert.equal(result.ok, false, `hours=${String(availableHoursPerWeek)}`);
    }
  });

  it("rejects non-object input without inventing defaults", () => {
    for (const value of [null, undefined, "degree", 42]) {
      const result = validateStudentContext(value);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.message, /required/i);
    }
  });
});

describe("toStudentContextColumns", () => {
  it("maps context to the student persistence shape", () => {
    assert.deepEqual(
      toStudentContextColumns({
        degree: "B.Tech Computer Science",
        graduationYear: 2027,
        availableHoursPerWeek: 10,
      }),
      {
        degree: "B.Tech Computer Science",
        graduationYear: 2027,
        availableHoursPerWeek: 10,
      },
    );
  });
});

describe("studentContextPromptLines", () => {
  it("labels context separately from answers and contains no strategy", () => {
    const lines = studentContextPromptLines({
      degree: "BCA",
      graduationYear: 2028,
      availableHoursPerWeek: 8,
    });
    assert.match(lines[0], /STUDENT CONTEXT/);
    assert.ok(lines.some((line) => line.includes("BCA")));
    assert.ok(lines.some((line) => line.includes("2028")));
    assert.ok(lines.some((line) => line.includes("8 hours/week")));
    for (const line of lines) {
      assert.doesNotMatch(line, /strateg/i);
      assert.doesNotMatch(line, /target career/i);
    }
  });
});

describe("validateSubmissionInput (endpoint)", () => {
  it("accepts a full payload including student context", () => {
    const result = validateSubmissionInput(validPayload());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.degree, "B.Tech Computer Science");
      assert.equal(typeof result.data.graduationYear, "number");
      assert.equal(result.data.availableHoursPerWeek, 12);
    }
  });

  it("rejects an empty degree with a specific message", () => {
    const result = validateSubmissionInput({ ...validPayload(), degree: "  " });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /degree/i);
  });

  it("rejects an out-of-window graduation year without defaults", () => {
    const result = validateSubmissionInput({ ...validPayload(), graduationYear: 1990 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /graduation year/i);
  });

  it("rejects zero weekly hours", () => {
    const result = validateSubmissionInput({ ...validPayload(), availableHoursPerWeek: 0 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /hours/i);
  });

  it("rejects legacy payloads without student context (no silent defaults)", () => {
    const legacy = validPayload();
    delete legacy.degree;
    delete legacy.graduationYear;
    delete legacy.availableHoursPerWeek;
    const result = validateSubmissionInput(legacy);
    assert.equal(result.ok, false);
  });
});

describe("retrieval contract (ownership-adjacent)", () => {
  it("strips student context from submission responses", () => {
    const parsed = GetCareerSubmissionResponse.parse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      status: "done",
      submittedAt: new Date("2026-01-01T00:00:00.000Z"),
      report: null,
      strategy: null,
      error: null,
      degree: "B.Tech Computer Science",
      graduationYear: 2027,
      availableHoursPerWeek: 10,
    });
    assert.ok(!("degree" in parsed));
    assert.ok(!("graduationYear" in parsed));
    assert.ok(!("availableHoursPerWeek" in parsed));
  });
});
