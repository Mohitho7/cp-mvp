/**
 * Deterministic career-direction composer tests.
 *
 * Run: pnpm --filter @workspace/scripts run test:direction
 * (node:test + tsx; no database, no network, no LLM calls.)
 *
 * The composer turns the authoritative strategy + explanation into the
 * report's careerDirection object. The model never authors it: the worker
 * overwrites whatever was parsed with these exact values.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswers } from "./fitProfile";
import { buildEntryStrategy } from "./strategy";
import { buildStrategyExplanation } from "./explanation";
import { buildReportParts } from "../careerReportWorker";
import { CAREERS } from "./catalog";
import {
  attachDeterministicReportFields,
  composeCareerDirection,
  deriveBarriers,
  mergeDeterministicReport,
} from "./careerDirection";
import { normalizeDegreeFamily } from "./degreeAlignment";
import {
  ALL_FIXTURES,
  fixtureAnalyticalTechnical,
  fixtureDesignOriented,
  fixtureEmptyAnswers,
  fixtureProductOriented,
} from "./fixtures";
import type { CareerStrategy } from "./types";

function composed(name: string) {
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
  const direction = composeCareerDirection(
    strategy,
    explanation,
    CAREERS,
    fixture.context,
  );
  return { fixture, strategy, explanation, direction };
}

describe("career direction composition", () => {
  it("mirrors the authoritative strategy fields exactly", () => {
    const { strategy, explanation, direction } = composed("product-oriented-bba-10h");
    assert.ok(direction);
    assert.equal(direction?.target.title, strategy.targetCareer?.title);
    assert.equal(direction?.entry.title, strategy.bestEntryCareer?.title);
    assert.equal(direction?.route, strategy.routeType);
    assert.equal(direction?.target.why, explanation.target);
    assert.equal(direction?.entry.why, explanation.entry);
    assert.equal(direction?.routeWhy, explanation.route);
  });

  it("derives entry barriers from catalog attributes and hours", () => {
    const byId = new Map(CAREERS.map((career) => [career.id, career]));
    const dataScientist = byId.get("data-scientist");
    assert.ok(dataScientist);
    const barriers = deriveBarriers(dataScientist, 10, "CS_IT_DATA");
    assert.ok(barriers.length >= 2, JSON.stringify(barriers));
    assert.match(barriers.join(" "), /staged entry route/);
    const support = byId.get("it-support");
    assert.ok(support);
    assert.deepEqual(deriveBarriers(support, 20, "CS_IT_DATA"), []);
  });

  it("notes ranked-below alternatives without inventing any", () => {
    const withAlt = composed("product-oriented-bba-10h");
    assert.ok(withAlt.direction?.alternativesNote);
    assert.match(withAlt.direction?.alternativesNote ?? "", /ranked below/);
    const direct = composed("design-oriented-bdes-12h");
    assert.equal(direct.strategy.alternativeRoute?.id, "digital-marketer");
    assert.match(direct.direction?.alternativesNote ?? "", /Digital Marketer/);
  });

  it("returns null for insufficient strategies", () => {
    const { strategy, explanation, fixture } = (() => {
      const found = ALL_FIXTURES.find((item) => item.name === "empty-answers");
      assert.ok(found);
      const strat = buildEntryStrategy({
        answers: found.answers,
        context: found.context,
        catalog: CAREERS,
      });
      return {
        strategy: strat,
        explanation: buildStrategyExplanation({
          strategy: strat,
          profile: normalizeAnswers(found.answers),
          context: found.context,
          catalog: CAREERS,
        }),
        fixture: found,
      };
    })();
    assert.equal(
      composeCareerDirection(strategy, explanation, CAREERS, fixture.context),
      null,
    );
  });

  it("returns null when catalog references cannot be resolved", () => {
    const { strategy, explanation } = composed("design-oriented-bdes-12h");
    assert.equal(
      composeCareerDirection(strategy, explanation, [], fixtureDesignOriented.context),
      null,
    );
  });
});

describe("deterministic report field attachment", () => {
  it("sets code-owned archetype and direction on parsed reports", () => {
    const { strategy, explanation } = composed("analytical-technical-cse-20h");
    const fields = attachDeterministicReportFields(
      fixtureAnalyticalTechnical.answers,
      strategy,
      explanation,
      fixtureAnalyticalTechnical.context,
      CAREERS,
    );
    assert.ok(fields.workArchetype);
    assert.ok(
      [
        "The Practical Builder",
        "The Analytical Solver",
        "The Creative Designer",
        "The People Connector",
        "The Entrepreneurial Operator",
      ].includes(fields.workArchetype?.name ?? ""),
    );
    assert.ok(fields.careerDirection);
    assert.equal(fields.careerDirection?.target.title, strategy.targetCareer?.title);
    assert.equal(fields.careerDirection?.entry.title, strategy.bestEntryCareer?.title);
  });

  it("attaches nulls for empty-signal assessments without crashing", () => {
    const found = fixtureEmptyAnswers;
    const strategy = buildEntryStrategy({
      answers: found.answers,
      context: found.context,
      catalog: CAREERS,
    });
    const explanation = buildStrategyExplanation({
      strategy,
      profile: normalizeAnswers(found.answers),
      context: found.context,
      catalog: CAREERS,
    });
    const fields = attachDeterministicReportFields(
      found.answers,
      strategy,
      explanation,
      found.context,
      CAREERS,
    );
    assert.equal(fields.workArchetype, null);
    assert.equal(fields.careerDirection, null);
  });

  it("overwrites any model-written archetype or direction", () => {
    const { strategy, explanation } = composed("product-oriented-bba-10h");
    const fields = attachDeterministicReportFields(
      fixtureProductOriented.answers,
      strategy,
      explanation,
      fixtureProductOriented.context,
      CAREERS,
    );
    // Even if the model invented its own names, the persisted values below
    // come from the classifier and strategy — never from model output.
    // (The people-heavy product fixture classifies as People Connector.)
    assert.equal(fields.workArchetype?.name, "The People Connector");
    assert.equal(fields.careerDirection?.target.title, "Product Manager");
  });
});

describe("prompt carries the authoritative archetype", () => {
  it("embeds the exact archetype name and definition for the model", () => {
    const { strategy, explanation, fixture } = composed("design-oriented-bdes-12h");
    const job = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      attemptCount: 1,
      attemptNumber: 1,
      answers: fixture.answers,
      department: "d",
      year: "y",
      batch: "b",
      studentContext: fixture.context,
      institutionName: "Test Institution",
      strategy,
      explanation,
    };
    const parts = buildReportParts(job);
    assert.match(parts.systemText, /The Creative Designer/);
    assert.match(parts.systemText, /AUTHORITATIVE/);
    const payload = parts.userPayload as { studentContext: { availableHoursPerWeek: number } };
    assert.equal(payload.studentContext.availableHoursPerWeek, 12);
  });

  it("lists the eight canonical display sections in requirements", () => {
    const { strategy, explanation, fixture } = composed("design-oriented-bdes-12h");
    const parts = buildReportParts({
      id: "123e4567-e89b-12d3-a456-426614174000",
      attemptCount: 1,
      attemptNumber: 1,
      answers: fixture.answers,
      department: "d",
      year: "y",
      batch: "b",
      studentContext: fixture.context,
      institutionName: "Test Institution",
      strategy,
      explanation,
    });
    const requirements = (
      parts.userPayload as {
        reportRequirements: { sections: string[] };
      }
    ).reportRequirements;
    assert.deepEqual(requirements.sections, [
      "section1_profile",
      "section2_strengthsAndWorkingStyle",
      "section3_currentReadiness",
      "section4_longTermAndEntryCareers",
      "section5_careerOptionsCompared",
      "section6_bestFitWorkLane",
      "section7_practicalYearRoadmap",
      "section8_candidMentorNote",
    ]);
  });
});

describe("mergeDeterministicReport cross-section role consistency", () => {
  it("synchronizes Section 3 firstEntryRoles with Section 4 and Section 5 entry roles", () => {
    const { strategy, explanation, fixture } = composed("analytical-technical-cse-20h");
    const mockModelReport = {
      profile: {
        archetype: "Some Arbitrary Model Persona",
        summary: "Analytical student with software inclination.",
        workerType: "Builder",
        clarityLevel: "Clear",
        strengths: ["Coding"],
        risks: ["Perfectionism"],
      },
      caliberVsEntry: {
        longTermCaliber: "High systems acumen.",
        marketBarrierLevel: "Moderate",
        marketBarrier: "High fresher competition.",
        firstEntryRoles: ["Arbitrary Out-of-Sync Role A", "Arbitrary Out-of-Sync Role B"],
        bridgePath: "Transition through systems testing.",
      },
      longTermOptions: [],
      entryOptions: [],
      careerComparison: {
        longTerm: [],
        entryLevel: [],
      },
    };

    const merged = mergeDeterministicReport(
      mockModelReport,
      strategy,
      explanation,
      fixture.answers,
      fixture.context,
      CAREERS,
    );

    // Section 4 entry options:
    assert.ok(merged.entryOptions.length >= 3, "Must have at least 3 entry options in Section 4");
    const top3Titles = merged.entryOptions.slice(0, 3).map((e: any) => e.title);
    const top3Ids = merged.entryOptions.slice(0, 3).map((e: any) => e.id);

    // Section 3 firstEntryRoles MUST match Section 4 top 3:
    assert.deepEqual(
      merged.caliberVsEntry.firstEntryRoles,
      top3Titles,
      "Section 3 firstEntryRoles must match Section 4 top 3 entry options exactly",
    );

    // Section 5 comparison entry roles MUST match Section 4 top 3:
    const comparisonTitles = merged.careerComparison.entryLevel.map((c: any) => c.title);
    const comparisonIds = merged.careerComparison.entryLevel.map((c: any) => c.id);
    assert.deepEqual(
      comparisonTitles,
      top3Titles,
      "Section 5 comparison entry titles must match Section 4 top 3 entry options",
    );
    assert.deepEqual(
      comparisonIds,
      top3Ids,
      "Section 5 comparison entry IDs must match Section 4 top 3 entry option IDs",
    );

    // Profile archetype is unified with deterministic workArchetype:
    assert.ok(merged.workArchetype);
    assert.equal(merged.profile.archetype, merged.workArchetype.name);
  });

  it("maintains entry role ID and label consistency across representative fixtures", () => {
    for (const fixtureName of [
      "analytical-technical-cse-20h",
      "product-oriented-bba-10h",
      "design-oriented-bdes-12h",
    ]) {
      const { strategy, explanation, fixture } = composed(fixtureName);
      const merged = mergeDeterministicReport(
        {
          profile: { archetype: "Drifted Persona" },
          caliberVsEntry: { firstEntryRoles: ["Old Stale Entry Role"] },
        },
        strategy,
        explanation,
        fixture.answers,
        fixture.context,
        CAREERS,
      );

      const s4Titles = merged.entryOptions.slice(0, 3).map((e: any) => e.title);
      const s4Ids = merged.entryOptions.slice(0, 3).map((e: any) => e.id);

      // Verify Section 3 consistency
      assert.deepEqual(merged.caliberVsEntry.firstEntryRoles, s4Titles);

      // Verify Section 5 consistency
      assert.deepEqual(
        merged.careerComparison.entryLevel.map((e: any) => e.title),
        s4Titles,
      );
      assert.deepEqual(
        merged.careerComparison.entryLevel.map((e: any) => e.id),
        s4Ids,
      );
    }
  });

  it("preserves reports safely when caliberVsEntry is omitted (legacy shape)", () => {
    const { strategy, explanation, fixture } = composed("analytical-technical-cse-20h");
    const merged = mergeDeterministicReport(
      {
        profile: { archetype: "Legacy Student" },
      },
      strategy,
      explanation,
      fixture.answers,
      fixture.context,
      CAREERS,
    );

    assert.equal((merged as any).caliberVsEntry, undefined);
    assert.ok(merged.entryOptions.length >= 3);
  });
});

