/**
 * Batch 3 tests — deterministic strategy explanation layer.
 *
 * Run: pnpm --filter @workspace/scripts run test:batch3
 * (node:test + tsx; no database, no network, no LLM calls)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAREERS } from "./catalog";
import { normalizeAnswers } from "./fitProfile";
import { buildEntryStrategy } from "./strategy";
import {
  buildStrategyExplanation,
  type ExplanationInputs,
} from "./explanation";
import type { CareerStrategy } from "./types";
import {
  ALL_FIXTURES,
  BRIDGE_CATALOG,
  SOLO_CATALOG,
  fixtureAnalyticalTechnical,
  fixtureBusinessOriented,
  fixtureDesignOriented,
  fixtureEmptyAnswers,
  fixtureProductOriented,
  fixtureUnknownDegree,
} from "./fixtures";
import {
  buildReportMessages,
  explanationForSubmission,
  strategyForSubmission,
  type ReportJob,
} from "../careerReportWorker";

const STRATEGY_DIR = dirname(fileURLToPath(import.meta.url));

function explainFixture(name: string): { strategy: CareerStrategy; text: ReturnType<typeof buildStrategyExplanation> } {
  const fixture = ALL_FIXTURES.find((item) => item.name === name);
  assert.ok(fixture, `missing fixture ${name}`);
  const strategy = buildEntryStrategy({
    answers: fixture.answers,
    context: fixture.context,
    catalog: CAREERS,
  });
  const text = buildStrategyExplanation({
    strategy,
    profile: normalizeAnswers(fixture.answers),
    context: fixture.context,
    catalog: CAREERS,
  });
  return { strategy, text };
}

function explainInputs(inputs: ExplanationInputs) {
  return buildStrategyExplanation(inputs);
}

function allSections(text: ReturnType<typeof buildStrategyExplanation>): string[] {
  return [text.target, text.entry, text.route, text.academic, text.time, text.bridge ?? "", text.alternative ?? ""];
}

describe("DIRECT explanation", () => {
  it("explains the ux-designer direct route without inventing steps", () => {
    const { strategy, text } = explainFixture("design-oriented-bdes-12h");
    assert.equal(strategy.routeType, "DIRECT");
    assert.match(text.target, /UX\/UI Designer is your strongest long-term direction/);
    assert.match(text.target, /creative/);
    assert.match(text.entry, /UX\/UI Designer is the recommended starting point/);
    assert.match(text.route, /direct route/);
    assert.match(text.academic, /design background aligns strongly/);
    assert.match(text.time, /12 hours per week/);
    assert.equal(text.bridge, null);
    assert.match(text.alternative ?? "", /secondary option.*backup/);
  });
});

describe("ADJACENT explanation", () => {
  it("explains product-manager via project-coordinator with the real connection", () => {
    const { strategy, text } = explainFixture("product-oriented-bba-10h");
    assert.notEqual(strategy.targetCareer?.id, strategy.bestEntryCareer?.id);
    assert.match(text.entry, /Project Coordinator is the recommended starting point/);
    assert.match(text.entry, /directly connected to Product Manager/);
    assert.match(text.route, /adjacent route/);
    assert.match(text.route, /Project Coordinator.*Product Manager/);
    assert.equal(text.bridge, null);
  });
});

describe("BRIDGE explanation", () => {
  it("explains the Entry -> Bridge -> Target chain with distinct roles", () => {
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
    const text = explainInputs({
      strategy,
      profile: normalizeAnswers(answers),
      context,
      catalog: BRIDGE_CATALOG,
    });
    const ids = [strategy.targetCareer?.id, strategy.bestEntryCareer?.id, strategy.bridgeCareer?.id];
    assert.equal(new Set(ids).size, 3);
    assert.match(text.route, /Wedge Role → Mid Role → Apex Role/);
    assert.match(text.bridge ?? "", /Mid Role sits between Wedge Role and Apex Role/);
  });
});

describe("LOW-TIME explanation", () => {
  it("keeps the target, avoids DIRECT, and stays honest about time", () => {
    const context = { degree: "B.Tech CSE", graduationYear: 2027, availableHoursPerWeek: 1 };
    const strategy = buildEntryStrategy({
      answers: fixtureAnalyticalTechnical.answers,
      context,
      catalog: CAREERS,
    });
    assert.equal(strategy.targetCareer?.id, "data-scientist");
    assert.notEqual(strategy.bestEntryCareer?.id, "data-scientist");
    const text = explainInputs({
      strategy,
      profile: normalizeAnswers(fixtureAnalyticalTechnical.answers),
      context,
      catalog: CAREERS,
    });
    assert.doesNotMatch(text.route, /direct route/);
    assert.match(text.time, /1 hour per week/);
    assert.match(text.time, /conservative/);
    assert.match(text.time, /would not be practical/);
    assert.doesNotMatch(text.time, /\d+\.\d+ weeks/);
    assert.doesNotMatch(text.time, /exactly/i);
  });
});

describe("academic alignment explanations", () => {
  it("STRONG: states strong alignment", () => {
    const { text } = explainFixture("design-oriented-bdes-12h");
    assert.match(text.academic, /aligns strongly/);
  });

  it("MODERATE: states moderate alignment without overstating", () => {
    const context = { degree: "B.Tech Mechanical", graduationYear: 2027, availableHoursPerWeek: 20 };
    const strategy = buildEntryStrategy({
      answers: fixtureAnalyticalTechnical.answers,
      context,
      catalog: CAREERS,
    });
    const text = explainInputs({
      strategy,
      profile: normalizeAnswers(fixtureAnalyticalTechnical.answers),
      context,
      catalog: CAREERS,
    });
    assert.match(text.academic, /moderate alignment/);
    assert.doesNotMatch(text.academic, /strongly/);
  });

  it("NEUTRAL: never falsely claims alignment and never shames", () => {
    const { text } = explainFixture("analytical-unknown-degree-15h");
    assert.match(text.academic, /does not provide a strong direct signal/);
    assert.doesNotMatch(text.academic, /strongly|strong match/);
    assert.doesNotMatch(text.academic, /fault|blame|behind|failing/i);
  });
});

describe("null handling", () => {
  it("bridge is null when the strategy has none", () => {
    assert.equal(explainFixture("design-oriented-bdes-12h").text.bridge, null);
    assert.equal(explainFixture("product-oriented-bba-10h").text.bridge, null);
  });

  it("alternative is null when the strategy has none", () => {
    const strategy = buildEntryStrategy({
      answers: fixtureDesignOriented.answers,
      context: fixtureDesignOriented.context,
      catalog: SOLO_CATALOG,
    });
    assert.equal(strategy.alternativeRoute, null);
    const text = explainInputs({
      strategy,
      profile: normalizeAnswers(fixtureDesignOriented.answers),
      context: fixtureDesignOriented.context,
      catalog: SOLO_CATALOG,
    });
    assert.equal(text.alternative, null);
  });
});

describe("insufficient context", () => {
  it("explains safely without fabricating careers", () => {
    const { strategy, text } = explainFixture("empty-answers");
    assert.equal(strategy.insufficientContext, true);
    assert.match(text.target, /not enough information/);
    assert.match(text.entry, /not enough information/);
    assert.equal(text.bridge, null);
    assert.equal(text.alternative, null);
    for (const career of CAREERS) {
      for (const section of allSections(text)) {
        assert.ok(!section.includes(career.title), `leaked ${career.title}`);
      }
    }
  });
});

describe("explanation determinism", () => {
  it("produces byte-identical output across 100 runs", () => {
    const fixture = fixtureProductOriented;
    const strategy = buildEntryStrategy({
      answers: fixture.answers,
      context: fixture.context,
      catalog: CAREERS,
    });
    const profile = normalizeAnswers(fixture.answers);
    const first = JSON.stringify(
      explainInputs({ strategy, profile, context: fixture.context, catalog: CAREERS }),
    );
    for (let run = 0; run < 100; run += 1) {
      assert.equal(
        JSON.stringify(explainInputs({ strategy, profile, context: fixture.context, catalog: CAREERS })),
        first,
        `run ${run}`,
      );
    }
  });
});

describe("explanation purity", () => {
  it("uses no LLM/network/database/clock/randomness", () => {
    const banned = [
      "fetch(",
      "axios",
      "Math.random",
      "Date.now",
      "new Date(",
      "process.env",
      "OpenAI",
      "openai",
      "groq",
      "gemini",
      "drizzle",
    ];
    const content = readFileSync(join(STRATEGY_DIR, "explanation.ts"), "utf8").toLowerCase();
    for (const token of banned) {
      assert.ok(!content.includes(token.toLowerCase()), `explanation.ts contains ${token}`);
    }
  });
});

describe("contradiction guards", () => {
  it("never contradicts the strategy it explains", () => {
    for (const fixture of ALL_FIXTURES) {
      const strategy = buildEntryStrategy({
        answers: fixture.answers,
        context: fixture.context,
        catalog: CAREERS,
      });
      const text = explainInputs({
        strategy,
        profile: normalizeAnswers(fixture.answers),
        context: fixture.context,
        catalog: CAREERS,
      });
      const sections = allSections(text);
      if (strategy.routeType === "DIRECT") {
        for (const section of sections) {
          assert.doesNotMatch(section, /adjacent|bridge/i, `${fixture.name} DIRECT`);
        }
      }
      if (strategy.routeType !== "DIRECT") {
        assert.doesNotMatch(text.route, /are the same/i, `${fixture.name} route`);
      }
      if (strategy.bridgeCareer === null) {
        for (const section of sections) {
          assert.doesNotMatch(section, /bridg/i, `${fixture.name} no-bridge`);
        }
      }
      if (strategy.alternativeRoute === null) {
        assert.equal(text.alternative, null, `${fixture.name} no-alternative`);
      }
      if (strategy.insufficientContext) {
        for (const career of CAREERS) {
          for (const section of sections) {
            assert.ok(!section.includes(career.title), `${fixture.name} leaked ${career.title}`);
          }
        }
      } else {
        assert.doesNotMatch(text.target, /easier to enter|easy entry|accessib/i, `${fixture.name} target`);
      }
    }
  });

  it("contains no motivational fluff, scores, or fabricated facts", () => {
    for (const fixture of [fixtureProductOriented, fixtureBusinessOriented, fixtureUnknownDegree]) {
      const strategy = buildEntryStrategy({
        answers: fixture.answers,
        context: fixture.context,
        catalog: CAREERS,
      });
      const text = explainInputs({
        strategy,
        profile: normalizeAnswers(fixture.answers),
        context: fixture.context,
        catalog: CAREERS,
      });
      for (const section of allSections(text)) {
        assert.doesNotMatch(section, /follow your passion|achieve anything|future is bright|perfect career/i, fixture.name);
        assert.doesNotMatch(section, /\b0\.\d+\b/, `${fixture.name} score dump`);
        assert.doesNotMatch(section, /salary|lakh|LPA|percent|hiring rate|opening|company/i, `${fixture.name} market fact`);
      }
    }
  });
});

describe("worker integration (no real LLM call)", () => {
  function reportJob(): ReportJob {
    const job = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      attemptCount: 1, attemptNumber: 1,
      answers: fixtureProductOriented.answers,
      department: "Computer Science & Engineering",
      year: "3rd Year",
      batch: "2023–2027",
      studentContext: fixtureProductOriented.context,
      institutionName: "Test Institution",
    };
    const strategy = strategyForSubmission(job);
    return { ...job, strategy, explanation: explanationForSubmission(job, strategy) };
  }

  it("passes both the deterministic strategy and its explanation to the prompt", () => {
    const job = reportJob();
    assert.equal(job.explanation.target.includes("Product Manager"), true);
    const messages = buildReportMessages(job);
    const system = String(messages[0].content);
    assert.match(system, /DETERMINISTIC SYSTEM OUTPUT/);
    assert.match(system, /authoritative/);
    assert.match(system, /Do not replace/);
    assert.match(system, /must not replace or contradict the strategy/);

    const userPayload = JSON.parse(String(messages[1].content)) as {
      entryStrategy: { targetCareer: { id: string }; routeType: string };
      strategyExplanation: { target: string; route: string };
    };
    assert.equal(userPayload.entryStrategy.targetCareer.id, "product-manager");
    assert.equal(userPayload.entryStrategy.routeType, "ADJACENT");
    assert.deepEqual(userPayload.strategyExplanation, job.explanation);
    assert.match(userPayload.strategyExplanation.route, /adjacent route/);
  });
});
