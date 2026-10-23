import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RATING_LEVELS } from "./ReportFeedback";

describe("ReportFeedback — UI Definitions and Contract", () => {
  it("defines exactly 5 distinct star rating levels", () => {
    assert.equal(RATING_LEVELS.length, 5);
    const values = RATING_LEVELS.map((l) => l.value);
    assert.deepEqual(values, [1, 2, 3, 4, 5]);
  });

  it("assigns the exact required labels and descriptions to each star", () => {
    assert.deepEqual(RATING_LEVELS[0], {
      value: 1,
      label: "Not useful",
      description: "1 star — Not useful",
    });
    assert.deepEqual(RATING_LEVELS[1], {
      value: 2,
      label: "Slightly useful",
      description: "2 stars — Slightly useful",
    });
    assert.deepEqual(RATING_LEVELS[2], {
      value: 3,
      label: "Somewhat useful",
      description: "3 stars — Somewhat useful",
    });
    assert.deepEqual(RATING_LEVELS[3], {
      value: 4,
      label: "Very useful",
      description: "4 stars — Very useful",
    });
    assert.deepEqual(RATING_LEVELS[4], {
      value: 5,
      label: "Extremely useful",
      description: "5 stars — Extremely useful",
    });
  });

  it("enforces unique and sequential values", () => {
    const set = new Set(RATING_LEVELS.map((l) => l.value));
    assert.equal(set.size, 5);
  });
});
