/**
 * Deterministic work-archetype classifier tests.
 *
 * Run: pnpm --filter @workspace/scripts run test:archetype
 * (node:test + tsx; no database, no network, no LLM calls.)
 *
 * The five canonical archetypes are product terminology, not validated
 * psychology. These tests lock the scoring contract: one archetype per
 * assessment, normalized per-question votes, deterministic ties, weak
 * signals reduce strength instead of inventing a sixth identity, and
 * evidence always traces to verbatim selected options.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_ARCHETYPE_DEFINITIONS,
  CANONICAL_ARCHETYPE_NAMES,
  CANONICAL_ARCHETYPE_ORDER,
  classifyArchetype,
  type CanonicalArchetypeId,
} from "./archetype";
import type { CareerSubmissionInput } from "@workspace/api-zod";
import {
  ALL_FIXTURES,
  fixtureBusinessOriented,
  fixtureProductOriented,
} from "./fixtures";

type Answers = CareerSubmissionInput["answers"];

function answersWith(overrides: Partial<Record<string, unknown>>): Answers {
  const base: Record<string, unknown> = {
    q1: null,
    q2: [],
    q3: [],
    q4: [],
    q5: null,
    q6: [],
    q7: [],
    q8: [],
    q9: [],
    q10: [],
    q11: [],
    q12: null,
    q13: "",
  };
  return { ...base, ...overrides } as Answers;
}

describe("canonical archetype set", () => {
  it("defines exactly five archetypes with names and definitions", () => {
    assert.deepEqual([...CANONICAL_ARCHETYPE_ORDER], [
      "practical-builder",
      "analytical-solver",
      "creative-designer",
      "people-connector",
      "entrepreneurial-operator",
    ]);
    for (const id of CANONICAL_ARCHETYPE_ORDER) {
      assert.ok(CANONICAL_ARCHETYPE_NAMES[id].length > 0, id);
      assert.ok(CANONICAL_ARCHETYPE_DEFINITIONS[id].length > 20, id);
    }
  });

  it("classifies one representative pattern per archetype", () => {
    const cases: Array<[Partial<Record<string, unknown>>, CanonicalArchetypeId]> = [
      [
        {
          q1: "Building something cool",
          q4: ["Writing code or working with tools"],
          q5: "I actually enjoy it",
          q6: ["Building real projects while learning"],
          q10: ["Creating apps or websites"],
        },
        "practical-builder",
      ],
      [
        {
          q1: "Solving difficult problems",
          q2: ["The one fixing problems last minute"],
          q4: ["Researching and learning new things"],
          q10: ["Working with data or solving analytical problems"],
          q12: "I genuinely enjoy constantly learning new things",
        },
        "analytical-solver",
      ],
      [
        {
          q1: "Creating or designing things",
          q2: ["The creative or design person"],
          q3: ["Editing, design, or content creation"],
          q4: ["Creating visuals or content"],
          q10: ["Design or content creation"],
        },
        "creative-designer",
      ],
      [
        {
          q1: "Working with people",
          q2: ["The one managing everyone"],
          q4: ["Talking to people or clients"],
          q7: ["Team collaboration and meetings"],
          q10: ["Managing people or projects"],
        },
        "people-connector",
      ],
      [
        {
          q1: "Making money early",
          q3: ["Business or money content"],
          q9: ["Building something of my own"],
          q10: ["Understanding business, money, or strategy"],
          q11: ["Running my own business or venture"],
        },
        "entrepreneurial-operator",
      ],
    ];
    for (const [overrides, expected] of cases) {
      const result = classifyArchetype(answersWith(overrides));
      assert.ok(result, JSON.stringify(overrides));
      assert.equal(result?.archetype, expected);
      assert.equal(result?.strength, "Strong");
    }
  });

  it("classifies the business-oriented fixture as entrepreneurial", () => {
    const result = classifyArchetype(fixtureBusinessOriented.answers);
    assert.ok(result);
    assert.equal(result?.archetype, "entrepreneurial-operator");
  });
});

describe("scoring rules", () => {
  it("is deterministic for identical inputs", () => {
    const first = classifyArchetype(fixtureProductOriented.answers);
    const second = classifyArchetype(fixtureProductOriented.answers);
    assert.deepEqual(first, second);
  });

  it("normalizes multi-select questions to one vote total", () => {
    // Four mapped q2 options split the question's single vote four ways.
    const result = classifyArchetype(
      answersWith({
        q2: [
          "The person who builds/codes things",
          "The one managing everyone",
          "The creative or design person",
          "The one fixing problems last minute",
        ],
      }),
    );
    assert.ok(result);
    // 4-way tie resolves in canonical order; no option dominates.
    assert.equal(result?.archetype, "practical-builder");
    assert.equal(result?.strength, "Emerging");
  });

  it("resolves exact ties in canonical order", () => {
    const result = classifyArchetype(
      answersWith({
        q1: "Making money early",
        q5: "I actually enjoy it",
      }),
    );
    assert.ok(result);
    assert.equal(result?.archetype, "practical-builder");
  });

  it("returns null for zero-signal assessments instead of fabricating", () => {
    assert.equal(
      classifyArchetype(
        answersWith({
          q1: "I honestly don't know yet",
          q3: ["Gaming", "Mostly just scrolling honestly"],
        }),
      ),
      null,
    );
    assert.equal(
      classifyArchetype({
        q1: null,
        q2: [],
        q3: [],
        q4: [],
        q5: null,
        q6: [],
        q7: [],
        q8: [],
        q9: [],
        q10: [],
        q11: [],
        q12: null,
        q13: "",
      }),
      null,
    );
  });

  it("reduces strength on weak or mixed signals", () => {
    const result = classifyArchetype(
      answersWith({
        q1: "Making money early",
        q2: [
          "The person who builds/codes things",
          "The one managing everyone",
          "The creative or design person",
          "The one fixing problems last minute",
        ],
        q10: ["Design or content creation", "Working with data or solving analytical problems"],
      }),
    );
    assert.ok(result);
    assert.ok(result?.strength === "Moderate" || result?.strength === "Emerging");
  });

  it("caps free-text contribution so essays cannot dominate", () => {
    const base = classifyArchetype(answersWith({ q1: "Making money early" }));
    const essay = classifyArchetype(
      answersWith({
        q1: "Making money early",
        q13: "build data design people business ".repeat(20),
      }),
    );
    assert.ok(base && essay);
    // q13 spreads at most 1.0 across all five; the q1 vote must still matter.
    assert.equal(essay?.archetype, "entrepreneurial-operator");
  });

  it("never produces a sixth archetype", () => {
    for (const fixture of ALL_FIXTURES) {
      const result = classifyArchetype(fixture.answers);
      if (result !== null) {
        assert.ok(
          (CANONICAL_ARCHETYPE_ORDER as readonly string[]).includes(result.archetype),
          fixture.name,
        );
      }
    }
    const combos: Array<Partial<Record<string, unknown>>> = [
      { q1: "Making money early", q5: "I actually enjoy it" },
      { q3: ["Gaming"], q7: ["Stable corporate structure"] },
      { q13: "startup data design people business" },
    ];
    for (const overrides of combos) {
      const result = classifyArchetype(answersWith(overrides));
      if (result !== null) {
        assert.ok(
          (CANONICAL_ARCHETYPE_ORDER as readonly string[]).includes(result.archetype),
        );
      }
    }
  });

  it("traces evidence to verbatim selected options", () => {
    const result = classifyArchetype(fixtureProductOriented.answers);
    assert.ok(result);
    assert.ok(result!.evidence.length > 0 && result!.evidence.length <= 3);
    const selected = JSON.stringify(fixtureProductOriented.answers);
    for (const item of result!.evidence) {
      const short = item.endsWith("...") ? item.slice(0, 117) : item;
      assert.ok(selected.includes(short), `evidence not in answers: ${short}`);
    }
  });
});
