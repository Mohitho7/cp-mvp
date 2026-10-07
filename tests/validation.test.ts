import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateSubmissionInput } from "../src/validation.js";
import { demoAnswers } from "../src/seed.js";

function validBody() {
  return {
    answers: demoAnswers(),
    department: " Computer Science & Engineering ",
    year: "3rd Year",
    batch: "2023–2027",
    consent: true as const,
  };
}

describe("submission input validation", () => {
  it("accepts 13 structured answers and trims cohort fields", () => {
    const result = validateSubmissionInput(validBody());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.department, "Computer Science & Engineering");
      assert.deepEqual(result.data.answers.q2, ["Synthetic demo answer"]);
    }
  });

  it("rejects missing consent", () => {
    const result = validateSubmissionInput({ ...validBody(), consent: false });
    assert.equal(result.ok, false);
  });

  it("rejects an empty single-choice answer", () => {
    const body = validBody();
    const result = validateSubmissionInput({
      ...body,
      answers: { ...body.answers, q1: "   " },
    });
    assert.equal(result.ok, false);
  });

  it("rejects an empty multi-choice answer", () => {
    const body = validBody();
    const result = validateSubmissionInput({
      ...body,
      answers: { ...body.answers, q2: [] },
    });
    assert.equal(result.ok, false);
  });

  it("rejects more than 3 selections where the limit is 3", () => {
    const body = validBody();
    const result = validateSubmissionInput({
      ...body,
      answers: { ...body.answers, q7: ["a", "b", "c", "d"] },
    });
    assert.equal(result.ok, false);
  });

  it("rejects duplicated selections", () => {
    const body = validBody();
    const result = validateSubmissionInput({
      ...body,
      answers: { ...body.answers, q2: ["a", "a"] },
    });
    assert.equal(result.ok, false);
  });

  it("rejects missing cohort fields", () => {
    const result = validateSubmissionInput({ ...validBody(), department: "  " });
    assert.equal(result.ok, false);
  });

  it("rejects unknown top-level properties", () => {
    const result = validateSubmissionInput({ ...validBody(), extra: 1 });
    assert.equal(result.ok, false);
  });
});
