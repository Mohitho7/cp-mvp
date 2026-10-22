/**
 * Batch 4 tests — strategy persistence mapping and retrieval shape.
 *
 * Run: pnpm --filter @workspace/scripts run test:batch4
 * (node:test + tsx; no database required, no queries are executed)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GetCareerSubmissionResponse,
  type CareerSubmissionResult,
} from "@workspace/api-zod";
import { normalizeAnswers } from "./careerStrategy/fitProfile";
import { buildEntryStrategy } from "./careerStrategy/strategy";
import { buildStrategyExplanation } from "./careerStrategy/explanation";
import { CAREERS, CATALOG_VERSION } from "./careerStrategy/catalog";
import { EXPLANATION_VERSION } from "./careerStrategy/explanation";
import {
  ALL_FIXTURES,
  BRIDGE_CATALOG,
} from "./careerStrategy/fixtures";
import type { CareerStrategy } from "./careerStrategy/types";
import {
  toStrategyRecord,
  toStrategyResponse,
} from "./strategyRecord";
import { serializeSubmission } from "../routes/careerDiscovery";

const VERSIONS = {
  strategyVersion: CATALOG_VERSION,
  explanationVersion: EXPLANATION_VERSION,
};

function engineOutput(name: string) {
  const fixture = ALL_FIXTURES.find((item) => item.name === name);
  assert.ok(fixture, `missing fixture ${name}`);
  const strategy = buildEntryStrategy({
    answers: fixture.answers,
    context: fixture.context,
    catalog: CAREERS,
  });
  const explanation = buildStrategyExplanation({
    strategy,
    profile: normalizeAnswers(fixture.answers),
    context: fixture.context,
    catalog: CAREERS,
  });
  return { fixture, strategy, explanation };
}

const SUBMISSION_ID = "123e4567-e89b-12d3-a456-426614174000";

describe("strategy persistence mapping", () => {
  for (const name of [
    "analytical-technical-cse-20h",
    "product-oriented-bba-10h",
    "design-oriented-bdes-12h",
    "empty-answers",
  ]) {
    it(`round-trips ${name} through record and response shapes`, () => {
      const { strategy, explanation } = engineOutput(name);
      const record = toStrategyRecord(SUBMISSION_ID, strategy, explanation, VERSIONS);
      assert.equal(record.submissionId, SUBMISSION_ID);
      assert.equal(record.strategyVersion, CATALOG_VERSION);
      assert.equal(record.explanationVersion, EXPLANATION_VERSION);

      const response = toStrategyResponse(record);
      assert.equal(response.strategyVersion, CATALOG_VERSION);
      assert.equal(response.explanationVersion, EXPLANATION_VERSION);
      assert.deepEqual(response.targetCareer, strategy.targetCareer);
      assert.deepEqual(response.bestEntryCareer, strategy.bestEntryCareer);
      assert.deepEqual(response.bridgeCareer, strategy.bridgeCareer);
      assert.deepEqual(response.alternativeRoute, strategy.alternativeRoute);
      assert.equal(response.routeType, strategy.routeType);
      assert.equal(response.insufficientContext, strategy.insufficientContext);
      assert.deepEqual(response.rationale, strategy.rationale);
      assert.deepEqual(response.explanation, explanation);
    });
  }

  it("preserves BRIDGE chains with all distinct roles", () => {
    const answers = {
      q1: "Solving difficult problems",
      q2: null,
      q3: null,
      q4: ["Researching and learning new things"],
      q5: null,
      q6: null,
      q7: null,
      q8: null,
      q9: null,
      q10: ["Working with data or solving analytical problems"],
      q11: null,
      q12: "I genuinely enjoy constantly learning new things",
      q13: "",
    };
    const context = { degree: "B.Tech Computer Science", graduationYear: 2027, availableHoursPerWeek: 10 };
    const strategy = buildEntryStrategy({ answers, context, catalog: BRIDGE_CATALOG });
    assert.equal(strategy.routeType, "BRIDGE");
    const explanation = buildStrategyExplanation({
      strategy,
      profile: normalizeAnswers(answers),
      context,
      catalog: BRIDGE_CATALOG,
    });
    const response = toStrategyResponse(toStrategyRecord(SUBMISSION_ID, strategy, explanation, VERSIONS));
    const ids = [response.targetCareer?.id, response.bestEntryCareer?.id, response.bridgeCareer?.id];
    assert.equal(new Set(ids).size, 3);
    assert.equal(response.routeType, "BRIDGE");
  });

  it("keeps nulls null for insufficient strategies", () => {
    const { strategy, explanation } = engineOutput("empty-answers");
    assert.equal(strategy.insufficientContext, true);
    const record = toStrategyRecord(SUBMISSION_ID, strategy, explanation, VERSIONS);
    assert.equal(record.targetCareerId, null);
    assert.equal(record.routeType, null);
    const response = toStrategyResponse(record);
    assert.equal(response.targetCareer, null);
    assert.equal(response.bestEntryCareer, null);
    assert.equal(response.bridgeCareer, null);
    assert.equal(response.alternativeRoute, null);
    assert.equal(response.routeType, null);
    assert.equal(response.insufficientContext, true);
  });

  it("rejects non-contract route values instead of persisting them", () => {
    const { strategy, explanation } = engineOutput("product-oriented-bba-10h");
    const record = toStrategyRecord(SUBMISSION_ID, strategy, explanation, VERSIONS);
    const tampered = { ...record, routeType: "EXPRESS" };
    assert.equal(toStrategyResponse(tampered).routeType, null);
  });

  it("treats half-present career pairs as absent", () => {
    const { strategy, explanation } = engineOutput("product-oriented-bba-10h");
    const record = toStrategyRecord(SUBMISSION_ID, strategy, explanation, VERSIONS);
    const response = toStrategyResponse({ ...record, bridgeCareerId: "ghost", bridgeCareerTitle: null });
    assert.equal(response.bridgeCareer, null);
  });
});

describe("strategy API contract", () => {
  function parsedResponse(strategy: CareerStrategy | null): CareerSubmissionResult {
    return GetCareerSubmissionResponse.parse({
      id: SUBMISSION_ID,
      status: "done",
      submittedAt: new Date("2026-01-01T00:00:00.000Z"),
      report: null,
      strategy: strategy
        ? toStrategyResponse(
            toStrategyRecord(
              SUBMISSION_ID,
              strategy,
              buildStrategyExplanation({
                strategy,
                profile: normalizeAnswers(engineOutput("product-oriented-bba-10h").fixture.answers),
                context: engineOutput("product-oriented-bba-10h").fixture.context,
                catalog: CAREERS,
              }),
              VERSIONS,
            ),
          )
        : null,
      error: null,
    });
  }

  it("accepts a full ADJACENT strategy with versions and explanation", () => {
    const { strategy } = engineOutput("product-oriented-bba-10h");
    const parsed = parsedResponse(strategy);
    assert.ok(parsed.strategy);
    assert.equal(parsed.strategy.routeType, "ADJACENT");
    assert.equal(parsed.strategy.strategyVersion, CATALOG_VERSION);
    assert.equal(parsed.strategy.explanationVersion, EXPLANATION_VERSION);
    assert.match(parsed.strategy.explanation.target, /Product Manager/);
    assert.equal(parsed.strategy.bridgeCareer, null);
  });

  it("accepts a DIRECT strategy", () => {
    const { strategy } = engineOutput("design-oriented-bdes-12h");
    const parsed = parsedResponse(strategy);
    assert.equal(parsed.strategy?.routeType, "DIRECT");
    assert.equal(parsed.strategy?.targetCareer?.id, parsed.strategy?.bestEntryCareer?.id);
  });

  it("accepts legacy null strategy (pre-Batch-4 reports)", () => {
    const parsed = parsedResponse(null);
    assert.equal(parsed.strategy, null);
  });

  it("represents insufficient context without careers", () => {
    const { strategy } = engineOutput("empty-answers");
    const parsed = parsedResponse(strategy);
    assert.equal(parsed.strategy?.insufficientContext, true);
    assert.equal(parsed.strategy?.targetCareer, null);
    assert.equal(parsed.strategy?.routeType, null);
  });
});

describe("serializeSubmission retrieval mapping", () => {
  function ownedRow(strategy: CareerStrategy | null) {
    const { fixture } = engineOutput("product-oriented-bba-10h");
    const explanation = buildStrategyExplanation({
      strategy: strategy ?? engineOutput("product-oriented-bba-10h").strategy,
      profile: normalizeAnswers(fixture.answers),
      context: fixture.context,
      catalog: CAREERS,
    });
    const record = strategy
      ? toStrategyRecord(SUBMISSION_ID, strategy, explanation, VERSIONS)
      : null;
    return {
      id: SUBMISSION_ID,
      status: "done" as const,
      submittedAt: new Date("2026-01-01T00:00:00.000Z"),
      error: null,
      report: null,
      strategyVersion: record?.strategyVersion ?? null,
      explanationVersion: record?.explanationVersion ?? null,
      targetCareerId: record?.targetCareerId ?? null,
      targetCareerTitle: record?.targetCareerTitle ?? null,
      entryCareerId: record?.entryCareerId ?? null,
      entryCareerTitle: record?.entryCareerTitle ?? null,
      bridgeCareerId: record?.bridgeCareerId ?? null,
      bridgeCareerTitle: record?.bridgeCareerTitle ?? null,
      alternativeCareerId: record?.alternativeCareerId ?? null,
      alternativeCareerTitle: record?.alternativeCareerTitle ?? null,
      routeType: record?.routeType ?? null,
      insufficientContext: record?.insufficientContext ?? null,
      rationaleTarget: record?.rationaleTarget ?? null,
      rationaleEntry: record?.rationaleEntry ?? null,
      rationaleBridge: record?.rationaleBridge ?? null,
      rationaleAcademic: record?.rationaleAcademic ?? null,
      rationaleTime: record?.rationaleTime ?? null,
      explanationTarget: record?.explanationTarget ?? null,
      explanationEntry: record?.explanationEntry ?? null,
      explanationRoute: record?.explanationRoute ?? null,
      explanationAcademic: record?.explanationAcademic ?? null,
      explanationTime: record?.explanationTime ?? null,
      explanationBridge: record?.explanationBridge ?? null,
      explanationAlternative: record?.explanationAlternative ?? null,
    };
  }

  it("assembles the persisted strategy into the owned response", () => {
    const { strategy } = engineOutput("product-oriented-bba-10h");
    const serialized = serializeSubmission(ownedRow(strategy));
    const parsed = GetCareerSubmissionResponse.parse(serialized);
    assert.equal(parsed.strategy?.bestEntryCareer?.title, "Project Coordinator");
    assert.equal(parsed.strategy?.strategyVersion, CATALOG_VERSION);
  });

  it("returns null strategy when no strategy row exists (legacy)", () => {
    const serialized = serializeSubmission(ownedRow(null));
    assert.equal(serialized.strategy, null);
    assert.equal(GetCareerSubmissionResponse.parse(serialized).strategy, null);
  });
});
