/**
 * Batch 5 — Hardening: adversarial robustness + invariant locks.
 *
 * Run: pnpm --filter @workspace/scripts run test:batch5
 * (node:test + tsx; no database, no network, no LLM calls)
 *
 * Covers: malformed answers/catalogs (no crash, no NaN, deterministic),
 * target-selection invariants (accessibility/degree/hours cannot move the
 * target), order independence, q13/saturation caps, and user-input safety.
 * Product policy (weights, formulas) is NOT changed here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswers, totalFitSignal } from "./careerStrategy/fitProfile";
import { normalizeDegreeFamily } from "./careerStrategy/degreeAlignment";
import { buildEntryStrategy } from "./careerStrategy/strategy";
import { CAREERS } from "./careerStrategy/catalog";
import {
  ALL_FIXTURES,
  fixtureAnalyticalTechnical,
} from "./careerStrategy/fixtures";
import type { CareerSubmissionInput } from "@workspace/api-zod";
import { validateStudentContext } from "./studentContext";

type Answers = CareerSubmissionInput["answers"];

const CONTEXT = { degree: "B.Tech CSE", graduationYear: 2027, availableHoursPerWeek: 10 };
const ANALYTICAL = fixtureAnalyticalTechnical.answers;

function run(answers: unknown, context = CONTEXT, catalog = CAREERS) {
  return buildEntryStrategy({
    answers: answers as Answers,
    context: { ...context } as typeof CONTEXT,
    catalog: catalog as typeof CAREERS,
  });
}

describe("malformed answers never crash", () => {
  it("null/undefined answers yield insufficient context instead of TypeError", () => {
    for (const answers of [null, undefined]) {
      let result;
      assert.doesNotThrow(() => {
        result = run(answers);
      });
      assert.equal(result!.insufficientContext, true);
      assert.equal(result!.targetCareer, null);
    }
  });

  it("wrong-typed answer values yield insufficient context", () => {
    for (const answers of [
      { q1: 42, q2: 7 },
      { q1: { nested: true } },
      { q1: true },
      {},
      [],
    ]) {
      const result = run(answers);
      assert.equal(result.insufficientContext, true, JSON.stringify(answers));
    }
  });

  it("extra keys and non-string items are ignored deterministically", () => {
    const baseline = JSON.stringify(run(ANALYTICAL));
    const withExtra = run({ ...ANALYTICAL, q99: "x", admin: true } as unknown as Answers);
    assert.equal(JSON.stringify(withExtra), baseline);
    const withJunk = run({ ...ANALYTICAL, q2: [1, null, {}, "Watching tech / coding videos"] } as unknown as Answers);
    assert.doesNotThrow(() => JSON.stringify(withJunk));
    assert.equal(withJunk.insufficientContext, false);
  });

  it("whitespace and casing variants normalize identically", () => {
    const variant = {
      ...ANALYTICAL,
      q1: "  SOLVING difficult PROBLEMS  ",
    } as Answers;
    assert.equal(JSON.stringify(run(variant)), JSON.stringify(run(ANALYTICAL)));
  });

  it("q13 contributes at most +1 per dimension", () => {
    const quiet = normalizeAnswers({ ...ANALYTICAL, q13: "" });
    const essayWords = [
      "data", "code", "design", "people", "talk", "plan", "startup", "business", "build", "money",
      "analy", "software", "creat", "team", "market", "system", "remote", "product", "ship", "logic",
    ];
    const loud = normalizeAnswers({ ...ANALYTICAL, q13: essayWords.join(" ") });
    for (const dim of Object.keys(quiet) as Array<keyof typeof quiet>) {
      assert.ok(loud[dim] - quiet[dim] <= 1 + 1e-9, dim);
      assert.ok(loud[dim] <= 1, dim);
    }
  });
});

describe("target-selection invariants", () => {
  it("catalog-wide accessibility changes cannot move the target", () => {
    const expected = run(ANALYTICAL).targetCareer?.id;
    const flipped = CAREERS.map((career) => ({
      ...career,
      accessibility: (career.accessibility === "VERY_HIGH" ? "VERY_LOW" : "VERY_HIGH") as typeof career.accessibility,
    }));
    assert.equal(run(ANALYTICAL, CONTEXT, flipped).targetCareer?.id, expected);
  });

  it("degree family cannot move the target", () => {
    const expected = run(ANALYTICAL).targetCareer?.id;
    for (const degree of [
      "B.Tech CSE",
      "B.Tech Mechanical",
      "BBA",
      "B.Des X",
      "BA History",
      "B.Sc Physics",
      "Underwater Basket Weaving",
    ]) {
      const result = run(ANALYTICAL, { ...CONTEXT, degree });
      assert.equal(result.targetCareer?.id, expected, degree);
    }
  });

  it("available hours cannot move the target", () => {
    const expected = run(ANALYTICAL).targetCareer?.id;
    for (const hours of [1, 4, 10, 20, 40, 100, 168]) {
      const result = run(ANALYTICAL, { ...CONTEXT, availableHoursPerWeek: hours });
      assert.equal(result.targetCareer?.id, expected, `hours=${hours}`);
    }
  });

  it("catalog order cannot change the outcome", () => {
    const baseline = JSON.stringify(run(ANALYTICAL));
    assert.equal(
      JSON.stringify(run(ANALYTICAL, CONTEXT, [...CAREERS].reverse())),
      baseline,
    );
  });
});

describe("degenerate catalogs stay finite and stable", () => {
  function check(name: string, catalog: typeof CAREERS) {
    const first = run(ANALYTICAL, CONTEXT, catalog);
    const serialized = JSON.stringify(first);
    assert.ok(!/NaN|Infinity/.test(serialized), `${name} leaked non-finite JSON`);
    assert.equal(JSON.stringify(run(ANALYTICAL, CONTEXT, catalog)), serialized, `${name} unstable`);
  }

  it("duplicate ids, dangling/self edges, and odd attributes", () => {
    const byId = Object.fromEntries(CAREERS.map((career) => [career.id, career]));
    const da = byId["data-analyst"];
    check("dup-ids", [da, { ...da, title: "Clone" }]);
    check("dangling-edge", [{ ...da, entryCandidates: ["nope"] }]);
    check("self-edge", [{ ...da, entryCandidates: ["data-analyst"], bridgeCandidates: ["data-analyst"] }]);
    check("empty-weights", [{ ...da, fitWeights: {} }]);
    check("zero-runway", [{ ...da, runwayHours: 0 }]);
    check("two-career", [da, byId["it-support"]]);
  });

  it("NaN/Infinity hours yield insufficient context, never NaN output", () => {
    for (const hours of [NaN, Infinity, -Infinity, 0, -5, 2.5]) {
      const result = run(ANALYTICAL, { ...CONTEXT, availableHoursPerWeek: hours });
      assert.equal(result.insufficientContext, true, `hours=${String(hours)}`);
      assert.ok(!/NaN|Infinity/.test(JSON.stringify(result)));
    }
  });
});

describe("user-controlled input safety", () => {
  it("accepts hostile-looking degrees verbatim without crashing", () => {
    const hostile = [
      "<script>alert(1)</script>",
      "'; DROP TABLE career_students; --",
      "😀🚀🎓".repeat(10),
      "B.Tech\nCSE\tAI",
      "Ünïcodé dégrée ok",
      'B.Tech (CSE) {"a":1}',
      "a".repeat(100),
    ];
    for (const degree of hostile) {
      const validated = validateStudentContext({
        degree,
        graduationYear: 2027,
        availableHoursPerWeek: 10,
      });
      assert.equal(validated.ok, true, degree.slice(0, 30));
      if (validated.ok) {
        assert.equal(validated.context.degree, degree.trim());
      }
      assert.doesNotThrow(() => normalizeDegreeFamily(degree));
      const first = normalizeDegreeFamily(degree);
      assert.equal(normalizeDegreeFamily(`  ${degree}  `), first);
    }
  });

  it("still rejects overlong degrees", () => {
    assert.equal(
      validateStudentContext({ degree: "a".repeat(101), graduationYear: 2027, availableHoursPerWeek: 10 }).ok,
      false,
    );
  });

  it("all fixtures produce finite, plain-object strategies", () => {
    for (const fixture of ALL_FIXTURES) {
      const result = buildEntryStrategy({
        answers: fixture.answers,
        context: fixture.context,
        catalog: CAREERS,
      });
      const serialized = JSON.stringify(result);
      assert.ok(!/NaN|Infinity/.test(serialized), fixture.name);
      assert.equal(totalFitSignal(normalizeAnswers(fixture.answers)) >= 0, true);
    }
  });
});
