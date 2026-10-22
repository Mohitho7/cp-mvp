/**
 * Batch 2 tests — deterministic career entry strategy engine.
 *
 * Run: pnpm --filter @workspace/scripts run test:batch2
 * (node:test + tsx; no database, no network, no LLM calls)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAREERS, CATALOG_VERSION } from "./catalog";
import { normalizeAnswers, totalFitSignal } from "./fitProfile";
import {
  alignmentFor,
  normalizeDegreeFamily,
} from "./degreeAlignment";
import {
  buildEntryStrategy,
  estimatedWeeks,
  hasDeepCodingAversion,
  isCompatibleEntry,
  runwayFitValue,
} from "./strategy";
import { buildStrategyExplanation } from "./explanation";
import type { CareerDefinition } from "./types";
import {
  ALL_FIXTURES,
  BRIDGE_CATALOG,
  SOLO_CATALOG,
  TIE_CATALOG,
  fixtureAnalyticalTechnical,
  fixtureBusinessOriented,
  fixtureDesignOriented,
  fixtureEmptyAnswers,
  fixtureLowTimeAvailability,
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

function strategyOf(fixtureName: string) {
  const fixture = ALL_FIXTURES.find((item) => item.name === fixtureName);
  assert.ok(fixture, `missing fixture ${fixtureName}`);
  return buildEntryStrategy({
    answers: fixture.answers,
    context: fixture.context,
    catalog: CAREERS,
  });
}

describe("career catalog", () => {
  it("is versioned and covers the V1 pathways", () => {
    assert.match(CATALOG_VERSION, /^batch2-v\d+$/);
    assert.ok(CAREERS.length >= 15);
    const ids = CAREERS.map((career) => career.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("has valid attributes and resolvable edges (no fake market facts)", () => {
    const ids = new Set(CAREERS.map((career) => career.id));
    for (const career of CAREERS) {
      assert.ok(career.runwayHours > 0, career.id);
      assert.ok(career.targetPotential >= 1 && career.targetPotential <= 5, career.id);
      assert.ok(
        career.codeIntensity >= 0 && career.codeIntensity <= 1,
        `${career.id} codeIntensity`,
      );
      for (const weight of Object.values(career.fitWeights)) {
        assert.ok(weight >= 0 && weight <= 1, career.id);
      }
      for (const ref of [...career.entryCandidates, ...career.bridgeCandidates]) {
        assert.ok(ids.has(ref), `${career.id} -> unknown ${ref}`);
      }
      const serialized = JSON.stringify(career);
      assert.doesNotMatch(serialized, /%/);
      assert.doesNotMatch(serialized, /salary/i);
    }
  });
});

describe("fit normalization", () => {
  it("is deterministic for the same input", () => {
    const first = normalizeAnswers(fixtureAnalyticalTechnical.answers);
    const second = normalizeAnswers(fixtureAnalyticalTechnical.answers);
    assert.deepEqual(first, second);
  });

  it("ignores drain answers (q8) by design", () => {
    const withDrain = normalizeAnswers(fixtureAnalyticalTechnical.answers);
    const withoutDrain = normalizeAnswers({
      ...fixtureAnalyticalTechnical.answers,
      q8: ["Something completely different"],
    });
    assert.deepEqual(withDrain, withoutDrain);
  });

  it("yields zero signal for missing answers", () => {
    const profile = normalizeAnswers(fixtureEmptyAnswers.answers);
    assert.equal(totalFitSignal(profile), 0);
  });

  it("measures preference shares, not selection breadth", () => {
    const empty = {
      q1: null, q2: [], q3: [], q4: [], q5: null, q6: [],
      q7: [], q8: [], q9: [], q10: [], q11: [], q12: null, q13: "",
    };
    // Narrow focused answers: tied top shares, everything else zero.
    const narrow = normalizeAnswers({
      ...empty,
      q1: "Solving difficult problems",
      q5: "I actually enjoy it",
      q12: "I genuinely enjoy constantly learning new things",
    });
    assert.equal(narrow.analytical, 0.5);
    assert.equal(narrow.technical, 0.5);
    for (const [dimension, value] of Object.entries(narrow)) {
      if (dimension !== "analytical" && dimension !== "technical") {
        assert.equal(value, 0);
      }
    }
    // Balanced answers stay ordered below saturation instead of clipping.
    const balanced = normalizeAnswers({
      ...empty,
      q1: "Building something cool",
      q3: ["Watching tech / coding videos", "Editing, design, or content creation"],
      q4: ["Writing code or working with tools", "Creating visuals or content"],
      q10: ["Creating apps or websites", "Design or content creation"],
    });
    assert.ok(balanced.technical >= balanced.creative);
    assert.ok(balanced.technical < 1 && balanced.creative < 1);
    assert.ok(balanced.technical > 0.2 && balanced.creative > 0.2);
    // A single expressed answer is 100% of the expressed signal.
    const sparse = normalizeAnswers({ ...empty, q1: "Creating or designing things" });
    assert.equal(sparse.creative, 1);
    // Broad multi-select answers keep technical/analytical on top.
    const broad = normalizeAnswers(fixtureAnalyticalTechnical.answers);
    assert.ok(broad.technical >= broad.analytical);
    for (const [dimension, value] of Object.entries(broad)) {
      if (dimension !== "technical" && dimension !== "analytical") {
        assert.ok(broad.technical >= value);
        assert.ok(broad.analytical >= value);
      }
    }
  });

  it("derives technical/analytical signals from a technical profile", () => {
    const profile = normalizeAnswers(fixtureAnalyticalTechnical.answers);
    // Shares of expressed answers: technical and analytical lead the rest.
    assert.ok(profile.technical > 0.2);
    assert.ok(profile.analytical > 0.2);
    for (const dimension of [
      "creative",
      "people",
      "communication",
      "structure",
      "autonomy",
      "product",
      "business",
      "execution",
    ] as const) {
      assert.ok(profile.technical >= profile[dimension]);
      assert.ok(profile.analytical >= profile[dimension]);
    }
  });
});

describe("degree normalization", () => {
  const cases: Array<[string, string]> = [
    ["B.Tech Computer Science", "CS_IT_DATA"],
    ["  btech CSE (AI & ML) ", "CS_IT_DATA"],
    ["BCA", "CS_IT_DATA"],
    ["B.Tech Mechanical", "ENGINEERING"],
    ["BBA", "BUSINESS_COMMERCE"],
    ["B.Com", "BUSINESS_COMMERCE"],
    ["BA Economics", "BUSINESS_COMMERCE"],
    ["B.Des Communication Design", "DESIGN"],
    ["B.Des", "DESIGN"],
    ["M.Des", "DESIGN"],
    ["  m.des industrial design ", "DESIGN"],
    ["BDes", "DESIGN"],
    ["B.Sc Physics", "SCIENCE"],
    ["BA English", "ARTS_HUMANITIES"],
    ["BA", "OTHER"],
    ["Underwater Basket Weaving", "OTHER"],
    ["", "OTHER"],
    ["   ", "OTHER"],
  ];
  for (const [degree, family] of cases) {
    it(`maps ${JSON.stringify(degree)} to ${family}`, () => {
      assert.equal(normalizeDegreeFamily(degree), family);
    });
  }

  it("is conservative for ambiguous degrees", () => {
    const career = CAREERS.find((item) => item.id === "data-scientist");
    assert.ok(career);
    assert.equal(alignmentFor(career, "OTHER"), "NEUTRAL");
  });
});

describe("target selection", () => {
  it("selects the strongest fit as target (technical profile)", () => {
    const strategy = strategyOf("analytical-technical-cse-20h");
    assert.equal(strategy.insufficientContext, false);
    // Normalized shares favor the cleaner analytical/technical alignment of
    // Data Scientist over Software Engineer for this data-heavy profile.
    assert.equal(strategy.targetCareer?.id, "data-scientist");
  });

  it("never replaces the target with an easier entry (low-time profile)", () => {
    const strategy = strategyOf("analytical-technical-cse-4h");
    assert.equal(strategy.targetCareer?.id, "data-scientist");
    assert.equal(strategy.bestEntryCareer?.id, "data-analyst");
    assert.notEqual(strategy.targetCareer?.id, strategy.bestEntryCareer?.id);
  });

  it("selects product/design/business targets for matching profiles", () => {
    assert.equal(strategyOf("product-oriented-bba-10h").targetCareer?.id, "product-manager");
    assert.equal(strategyOf("design-oriented-bdes-12h").targetCareer?.id, "ux-designer");
    // Structure-dominant business answers point at coordination work.
    assert.equal(strategyOf("business-oriented-bcom-10h").targetCareer?.id, "project-coordinator");
  });
});

describe("entry selection", () => {
  it("weighs runway: same profile, different hours, sensible entries", () => {
    const full = strategyOf("analytical-technical-cse-20h");
    const low = strategyOf("analytical-technical-cse-4h");
    assert.equal(full.targetCareer?.id, low.targetCareer?.id);
    assert.match(full.rationale.time, /12\.5 weeks at 20 hrs\/week/);
    assert.match(low.rationale.time, /62\.5 weeks at 4 hrs\/week/);
    // Data-analyst wedge toward Data Scientist at both budgets.
    assert.equal(full.routeType, "ADJACENT");
    assert.equal(full.bestEntryCareer?.id, "data-analyst");
    assert.equal(full.bridgeCareer, null);
  });

  it("implements the documented runway bands", () => {
    assert.equal(runwayFitValue(80, 10), 1);
    assert.equal(runwayFitValue(160, 10), 0.8);
    assert.equal(runwayFitValue(260, 10), 0.6);
    assert.equal(runwayFitValue(520, 10), 0.4);
    assert.equal(runwayFitValue(1000, 10), 0.2);
    assert.equal(estimatedWeeks(200, 10), 20);
  });

  it("reflects degree context in the academic rationale", () => {
    const cse = strategyOf("analytical-technical-cse-20h");
    const unknown = strategyOf("analytical-unknown-degree-15h");
    assert.match(cse.rationale.academic, /CS_IT_DATA/);
    assert.match(unknown.rationale.academic, /OTHER aligns NEUTRAL/);
    assert.equal(unknown.insufficientContext, false);
  });
});

describe("deep-coding aversion", () => {
  it("detects the explicit q8 aversion case-insensitively", () => {
    assert.equal(
      hasDeepCodingAversion({ ...fixtureProductOriented.answers }),
      true,
    );
    assert.equal(
      hasDeepCodingAversion({
        ...fixtureProductOriented.answers,
        q8: ["TOO MUCH DEEP CODING ALL DAY"],
      }),
      true,
    );
    assert.equal(
      hasDeepCodingAversion({ ...fixtureAnalyticalTechnical.answers }),
      false,
    );
    assert.equal(
      hasDeepCodingAversion({ q1: null, q8: null } as never),
      false,
    );
  });

  it("penalizes code-intensive entry wedges without moving the target", () => {
    const withAversion = strategyOf("product-oriented-bba-10h");
    assert.equal(withAversion.targetCareer?.id, "product-manager");
    assert.equal(withAversion.bestEntryCareer?.id, "project-coordinator");
    // Project coordination work is low-intensity, so no justification note is needed.
    assert.doesNotMatch(withAversion.rationale.entry, /aversion to deep coding/);
  });

  it("justifies a code-intensive entry chosen despite the aversion", () => {
    const answers = {
      ...fixtureAnalyticalTechnical.answers,
      q8: ["Too much deep coding all day"],
    };
    const strategy = buildEntryStrategy({
      answers,
      context: { degree: "B.Sc Physics", graduationYear: 2027, availableHoursPerWeek: 25 },
      catalog: CAREERS,
    });
    assert.equal(strategy.insufficientContext, false);
    assert.equal(strategy.targetCareer?.id, "data-scientist");
    // Data Analyst outranks support here despite the penalty; the note must say so.
    assert.equal(strategy.bestEntryCareer?.id, "data-analyst");
    assert.match(strategy.rationale.entry, /aversion to deep coding was weighed/);
  });

  it("preserves technical target when fit evidence strongly supports it despite aversion", () => {
    const withoutAversion = buildEntryStrategy({
      answers: {
        ...fixtureAnalyticalTechnical.answers,
        q8: ["Strict office life with no flexibility"],
      },
      context: fixtureAnalyticalTechnical.context,
      catalog: CAREERS,
    });
    const withAversion = buildEntryStrategy({
      answers: {
        ...fixtureAnalyticalTechnical.answers,
        q8: ["Too much deep coding all day"],
      },
      context: fixtureAnalyticalTechnical.context,
      catalog: CAREERS,
    });
    // Strong analytical evidence preserves data-scientist as target despite penalty.
    assert.equal(withoutAversion.targetCareer?.id, "data-scientist");
    assert.equal(withAversion.targetCareer?.id, "data-scientist");
    // Same winner here, but only the aversion run justifies it.
    assert.equal(withoutAversion.bestEntryCareer?.id, "data-analyst");
    assert.equal(withAversion.bestEntryCareer?.id, "data-analyst");
    assert.doesNotMatch(withoutAversion.rationale.entry, /aversion to deep coding/);
    assert.match(withAversion.rationale.entry, /aversion to deep coding was weighed/);
  });

  it("applies proportional aversion penalty to targets without displacing low-intensity targets", () => {
    const base = buildEntryStrategy({
      answers: fixtureProductOriented.answers,
      context: fixtureProductOriented.context,
      catalog: CAREERS,
    });
    const noAversion = buildEntryStrategy({
      answers: { ...fixtureProductOriented.answers, q8: [] },
      context: fixtureProductOriented.context,
      catalog: CAREERS,
    });
    assert.equal(base.targetCareer?.id, noAversion.targetCareer?.id);
    assert.equal(base.targetCareer?.id, "product-manager");
  });

  it("penalizes high-code-intensity targets when explicit aversion is stated", () => {
    // When a student has general technical/automation interest, explicit coding aversion
    // penalizes software-engineer (codeIntensity: 1.0) and cloud-devops-engineer (0.9)
    // allowing lower-code automation/product alternatives to rank higher.
    const answersWithoutAversion = {
      q1: "Building something cool",
      q2: ["The one fixing problems last minute"],
      q3: ["Exploring AI tools", "Business or money content"],
      q4: ["Finding shortcuts or automating tasks"],
      q5: "I prefer low-code or no-code tools",
      q6: ["Trying things directly and breaking stuff"],
      q7: ["Startup chaos and fast growth"],
      q8: ["Doing the same repetitive thing daily"],
      q9: ["Building something of my own"],
      q10: ["Working with AI or automation tools"],
      q11: ["Running my own business or venture"],
      q12: "I can learn when I see why it matters",
      q13: "",
    };
    const answersWithAversion = {
      ...answersWithoutAversion,
      q8: ["Too much deep coding all day"],
    };

    const stratWithout = buildEntryStrategy({
      answers: answersWithoutAversion,
      context: { degree: "BCA", graduationYear: 2026, availableHoursPerWeek: 15 },
      catalog: CAREERS,
    });
    const stratWith = buildEntryStrategy({
      answers: answersWithAversion,
      context: { degree: "BCA", graduationYear: 2026, availableHoursPerWeek: 15 },
      catalog: CAREERS,
    });

    // In stratWith, ai-automation-specialist is the clear target and SWE is penalized down
    assert.equal(stratWith.targetCareer?.id, "ai-automation-specialist");
    assert.ok(stratWith.longTermOptions);
    assert.ok(stratWithout.longTermOptions);
    const sweTargetWith = stratWith.longTermOptions.find((o) => o.career.id === "software-engineer");
    const sweTargetWithout = stratWithout.longTermOptions.find((o) => o.career.id === "software-engineer");
    if (sweTargetWith && sweTargetWithout) {
      assert.ok(sweTargetWith.score < sweTargetWithout.score);
    }
  });
});

describe("routes", () => {
  it("DIRECT when the target is itself the best entry", () => {
    for (const name of ["design-oriented-bdes-12h", "business-oriented-bcom-10h"]) {
      const strategy = strategyOf(name);
      assert.equal(strategy.routeType, "DIRECT", name);
      assert.equal(strategy.targetCareer?.id, strategy.bestEntryCareer?.id, name);
      assert.equal(strategy.bridgeCareer, null, name);
    }
  });

  it("ADJACENT through a listed entry candidate", () => {
    const strategy = strategyOf("product-oriented-bba-10h");
    assert.equal(strategy.routeType, "ADJACENT");
    assert.equal(strategy.targetCareer?.id, "product-manager");
    // Deep-coding aversion (q8) penalizes code-intensive wedges, so project
    // coordination outranks business analysis. Target is unchanged.
    assert.equal(strategy.bestEntryCareer?.id, "project-coordinator");
    assert.equal(strategy.bridgeCareer, null);
    assert.equal(strategy.alternativeRoute?.id, "associate-product-manager");
  });

  it("BRIDGE when the best wedge is outside the listed entries", () => {
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
    const strategy = buildEntryStrategy({
      answers,
      context: { degree: "B.Tech Computer Science", graduationYear: 2027, availableHoursPerWeek: 10 },
      catalog: BRIDGE_CATALOG,
    });
    assert.equal(strategy.routeType, "BRIDGE");
    assert.equal(strategy.targetCareer?.id, "apex-role");
    assert.equal(strategy.bestEntryCareer?.id, "wedge-role");
    assert.equal(strategy.bridgeCareer?.id, "mid-role");
    assert.equal(strategy.alternativeRoute?.id, "step-role");
  });
});

describe("DIRECT feasibility gate", () => {
  it("blocks infeasible DIRECT at 1h/week (target preserved, feasible wedge chosen)", () => {
    const strategy = buildEntryStrategy({
      answers: fixtureAnalyticalTechnical.answers,
      context: { degree: "B.Tech CSE", graduationYear: 2027, availableHoursPerWeek: 1 },
      catalog: CAREERS,
    });
    assert.equal(strategy.insufficientContext, false);
    assert.equal(strategy.targetCareer?.id, "data-scientist");
    assert.notEqual(strategy.bestEntryCareer?.id, "data-scientist");
    assert.equal(strategy.bestEntryCareer?.id, "data-analyst");
    assert.equal(strategy.routeType, "ADJACENT");
  });

  it("preserves DIRECT for the design 12h/week case", () => {
    const strategy = strategyOf("design-oriented-bdes-12h");
    assert.equal(strategy.targetCareer?.id, "ux-designer");
    assert.equal(strategy.bestEntryCareer?.id, "ux-designer");
    assert.equal(strategy.routeType, "DIRECT");
  });

  it("preserves DIRECT for the business 10h/week case", () => {
    const strategy = strategyOf("business-oriented-bcom-10h");
    assert.equal(strategy.targetCareer?.id, "project-coordinator");
    assert.equal(strategy.bestEntryCareer?.id, "project-coordinator");
    assert.equal(strategy.routeType, "DIRECT");
  });

  it("gate is inert unless the target wins entry (solo catalog boundary)", () => {
    const feasible = buildEntryStrategy({
      answers: fixtureDesignOriented.answers,
      context: fixtureDesignOriented.context,
      catalog: SOLO_CATALOG,
    });
    assert.equal(feasible.routeType, "DIRECT");
    assert.equal(feasible.bestEntryCareer?.id, "solo-role");

    const infeasible = buildEntryStrategy({
      answers: fixtureDesignOriented.answers,
      context: { ...fixtureDesignOriented.context, availableHoursPerWeek: 1 },
      catalog: SOLO_CATALOG,
    });
    assert.equal(infeasible.insufficientContext, true);
    assert.equal(infeasible.targetCareer, null);
    assert.equal(infeasible.bestEntryCareer, null);
  });
});

describe("null behavior", () => {
  it("returns null bridge/alternative when none is needed", () => {
    const strategy = buildEntryStrategy({
      answers: fixtureDesignOriented.answers,
      context: fixtureDesignOriented.context,
      catalog: SOLO_CATALOG,
    });
    assert.equal(strategy.routeType, "DIRECT");
    assert.equal(strategy.bridgeCareer, null);
    assert.equal(strategy.alternativeRoute, null);
  });

  it("returns an insufficient strategy without fabrication", () => {
    const empty = strategyOf("empty-answers");
    assert.equal(empty.insufficientContext, true);
    assert.equal(empty.targetCareer, null);
    assert.equal(empty.bestEntryCareer, null);
    assert.equal(empty.bridgeCareer, null);
    assert.equal(empty.alternativeRoute, null);
    assert.equal(empty.routeType, null);

    assert.equal(
      buildEntryStrategy({ answers: fixtureDesignOriented.answers, context: fixtureDesignOriented.context, catalog: [] }).insufficientContext,
      true,
    );
    assert.equal(
      buildEntryStrategy({
        answers: fixtureDesignOriented.answers,
        context: { ...fixtureDesignOriented.context, degree: "  " },
        catalog: CAREERS,
      }).insufficientContext,
      true,
    );
    assert.equal(
      buildEntryStrategy({
        answers: fixtureDesignOriented.answers,
        context: { ...fixtureDesignOriented.context, availableHoursPerWeek: 0 },
        catalog: CAREERS,
      }).insufficientContext,
      true,
    );
  });
});

describe("determinism and tie-breaking", () => {
  it("produces identical output across repeated runs", () => {
    for (const fixture of ALL_FIXTURES) {
      const first = buildEntryStrategy({ answers: fixture.answers, context: fixture.context, catalog: CAREERS });
      for (let run = 0; run < 25; run += 1) {
        assert.deepEqual(
          buildEntryStrategy({ answers: fixture.answers, context: fixture.context, catalog: CAREERS }),
          first,
          `${fixture.name} run ${run}`,
        );
      }
    }
  });

  it("breaks exact ties by stable career id order", () => {
    const strategy = buildEntryStrategy({
      answers: fixtureDesignOriented.answers,
      context: fixtureDesignOriented.context,
      catalog: TIE_CATALOG,
    });
    assert.equal(strategy.targetCareer?.id, "alpha-role");
    assert.equal(strategy.bestEntryCareer?.id, "alpha-role");
    assert.equal(strategy.routeType, "DIRECT");
  });
});

describe("attribute-based (no persona hardcodes)", () => {
  it("treats same-family degree paraphrases identically", () => {
    const variants = ["B.Tech Computer Science", "btech cse", "B.E. Computer Engineering"];
    const outputs = variants.map((degree) =>
      buildEntryStrategy({
        answers: fixtureBusinessOriented.answers,
        context: { ...fixtureBusinessOriented.context, degree },
        catalog: CAREERS,
      }),
    );
    for (const output of outputs.slice(1)) {
      assert.deepEqual(output, outputs[0]);
    }
  });
});

describe("engine purity", () => {
  it("does not mutate inputs and uses no LLM/network/database/clock", () => {
    const answers = JSON.parse(JSON.stringify(fixtureProductOriented.answers));
    const context = { ...fixtureProductOriented.context };
    const before = JSON.stringify({ answers, context });
    buildEntryStrategy({ answers, context, catalog: CAREERS });
    assert.equal(JSON.stringify({ answers, context }), before);

    const banned = ["fetch(", "Math.random", "Date.now", "process.env", "OpenAI", "drizzle", "groq", "gemini"];
    const sources = ["types.ts", "catalog.ts", "fitProfile.ts", "degreeAlignment.ts", "strategy.ts", "fixtures.ts"];
    for (const file of sources) {
      const content = readFileSync(join(STRATEGY_DIR, file), "utf8").toLowerCase();
      for (const token of banned) {
        assert.ok(!content.includes(token.toLowerCase()), `${file} contains ${token}`);
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

  it("computes the deterministic strategy for a submission", () => {
    const job = reportJob();
    assert.equal(job.strategy.targetCareer?.id, "product-manager");
    // Deep-coding aversion applies here too; see the ADJACENT route test.
    assert.equal(job.strategy.bestEntryCareer?.id, "project-coordinator");
    assert.equal(job.strategy.insufficientContext, false);
  });

  it("passes the strategy to the LLM prompt as authoritative structured context", () => {
    const messages = buildReportMessages(reportJob());
    const system = String(messages[0].content);
    assert.match(system, /DETERMINISTIC SYSTEM OUTPUT/);
    assert.match(system, /authoritative/);
    assert.match(system, /Do not replace/);

    const userPayload = JSON.parse(String(messages[1].content)) as {
      entryStrategy: { targetCareer: { id: string }; routeType: string };
      studentContext: { degree: string };
    };
    assert.equal(userPayload.entryStrategy.targetCareer.id, "product-manager");
    assert.equal(userPayload.entryStrategy.routeType, "ADJACENT");
    assert.equal(userPayload.studentContext.degree, "BBA");
  });
});

describe("Phase 1 — career catalog refinements & new roles", () => {
  it("includes Associate Product Manager with valid attributes and transitions", () => {
    const apm = CAREERS.find((c) => c.id === "associate-product-manager");
    assert.ok(apm, "associate-product-manager must exist in catalog");
    assert.equal(apm.title, "Associate Product Manager");
    assert.equal(apm.category, "Product");
    assert.equal(apm.accessibility, "HIGH");
    assert.equal(apm.runwayHours, 220);
    assert.equal(apm.codeIntensity, 0.2);
    assert.equal(apm.targetPotential, 4);
    assert.deepEqual(apm.entryCandidates, ["business-analyst", "project-coordinator", "operations-associate"]);
    assert.deepEqual(apm.bridgeCandidates, ["business-analyst", "project-coordinator"]);
  });

  it("includes AI Automation / No-Code Solutions Specialist with valid attributes and transitions", () => {
    const aiAuto = CAREERS.find((c) => c.id === "ai-automation-specialist");
    assert.ok(aiAuto, "ai-automation-specialist must exist in catalog");
    assert.equal(aiAuto.title, "AI Automation / No-Code Solutions Specialist");
    assert.equal(aiAuto.category, "Automation");
    assert.equal(aiAuto.accessibility, "HIGH");
    assert.equal(aiAuto.runwayHours, 180);
    assert.equal(aiAuto.codeIntensity, 0.35);
    assert.equal(aiAuto.targetPotential, 4);
    assert.deepEqual(aiAuto.entryCandidates, ["operations-associate", "qa-engineer"]);
    assert.deepEqual(aiAuto.bridgeCandidates, ["operations-associate"]);
  });

  it("does not allow IT Support as entry or bridge candidate for Software Engineer", () => {
    const swe = CAREERS.find((c) => c.id === "software-engineer");
    assert.ok(swe);
    assert.ok(!swe.entryCandidates.includes("it-support"), "Software Engineer must not have it-support as entry candidate");
    assert.ok(!swe.bridgeCandidates.includes("it-support"), "Software Engineer must not have it-support as bridge candidate");
    assert.deepEqual(swe.entryCandidates, ["qa-engineer"]);
    assert.deepEqual(swe.bridgeCandidates, []);
  });

  it("defines defensible entry routes for Product Manager (APM, BA, Project Coordinator, Data Analyst)", () => {
    const pm = CAREERS.find((c) => c.id === "product-manager");
    assert.ok(pm);
    assert.ok(pm.entryCandidates.includes("associate-product-manager"));
    assert.ok(pm.entryCandidates.includes("business-analyst"));
    assert.ok(pm.entryCandidates.includes("project-coordinator"));
    assert.ok(pm.entryCandidates.includes("data-analyst"));
    assert.ok(!pm.entryCandidates.includes("operations-associate"), "Operations Associate should not be direct entry for PM");
    assert.ok(pm.bridgeCandidates.includes("associate-product-manager"));
  });

  it("defines defensible entry routes for Business Analyst (Ops, Data Analyst, AI Automation)", () => {
    const ba = CAREERS.find((c) => c.id === "business-analyst");
    assert.ok(ba);
    assert.ok(ba.entryCandidates.includes("ai-automation-specialist"));
    assert.ok(ba.entryCandidates.includes("operations-associate"));
    assert.ok(ba.entryCandidates.includes("data-analyst"));
  });

  it("defines defensible entry routes for Data Analyst", () => {
    const da = CAREERS.find((c) => c.id === "data-analyst");
    assert.ok(da);
    assert.deepEqual(da.entryCandidates, ["business-analyst", "operations-associate"]);
    assert.deepEqual(da.bridgeCandidates, ["business-analyst"]);
  });

  it("selects associate-product-manager as entry candidate when product fit is high", () => {
    const answers = {
      q1: "Working with people",
      q2: ["The one managing everyone"],
      q3: ["Business or money content", "Helping friends solve problems"],
      q4: ["Talking to people or clients"],
      q5: "I can learn if it helps my career",
      q6: ["Building real projects while learning"],
      q7: ["Startup chaos and fast growth"],
      q8: ["Too much deep coding all day"],
      q9: ["Building something of my own"],
      q10: ["Creating apps or websites", "Managing people or projects"],
      q11: ["Running my own business or venture"],
      q12: "I genuinely enjoy constantly learning new things",
      q13: "I want to be an associate product manager and build tech products with teams",
    };
    const strategy = buildEntryStrategy({
      answers,
      context: { degree: "B.Tech Computer Science", graduationYear: 2026, availableHoursPerWeek: 15 },
      catalog: CAREERS,
    });
    assert.equal(strategy.targetCareer?.id, "product-manager");
    assert.equal(strategy.bestEntryCareer?.id, "associate-product-manager");
    assert.equal(strategy.routeType, "ADJACENT");
  });

  it("selects ai-automation-specialist directly for practical automation profile", () => {
    const answers = {
      q1: "Building something cool",
      q2: ["The one fixing problems last minute"],
      q3: ["Business or money content"],
      q4: ["Finding shortcuts or automating tasks"],
      q5: "I prefer low-code or no-code tools",
      q6: ["Trying things directly and breaking stuff"],
      q7: ["Freelancing or running my own thing"],
      q8: ["Too much deep coding all day"],
      q9: ["Building something of my own"],
      q10: ["Working with AI or automation tools"],
      q11: ["Running my own business or venture"],
      q12: "I'm okay with it if it helps my career growth",
      q13: "I want to build automations and no-code tools",
    };
    const strategy = buildEntryStrategy({
      answers,
      context: { degree: "B.Tech Computer Science", graduationYear: 2027, availableHoursPerWeek: 15 },
      catalog: CAREERS,
    });
    assert.equal(strategy.targetCareer?.id, "ai-automation-specialist");
    assert.equal(strategy.bestEntryCareer?.id, "ai-automation-specialist");
    assert.equal(strategy.routeType, "DIRECT");
  });

  it("routes ai-automation-specialist to qa-engineer or operations-associate when weekly hours are constrained", () => {
    const answers = {
      q1: "Building something cool",
      q2: ["The one fixing problems last minute"],
      q3: ["Business or money content"],
      q4: ["Finding shortcuts or automating tasks"],
      q5: "I prefer low-code or no-code tools",
      q6: ["Trying things directly and breaking stuff"],
      q7: ["Freelancing or running my own thing"],
      q8: ["Too much deep coding all day"],
      q9: ["Building something of my own"],
      q10: ["Working with AI or automation tools"],
      q11: ["Running my own business or venture"],
      q12: "I'm okay with it if it helps my career growth",
      q13: "I want to build automations and no-code tools",
    };
    // For a technical degree with constrained hours (2h), QA Engineer serves as the defensible technical wedge
    const technical = buildEntryStrategy({
      answers,
      context: { degree: "B.Tech Computer Science", graduationYear: 2027, availableHoursPerWeek: 2 },
      catalog: CAREERS,
    });
    assert.equal(technical.targetCareer?.id, "ai-automation-specialist");
    assert.equal(technical.bestEntryCareer?.id, "qa-engineer");
    assert.equal(technical.routeType, "ADJACENT");

    // For a general/commerce degree with constrained hours (2h), Operations Associate serves as the entry wedge
    const nonTechnical = buildEntryStrategy({
      answers,
      context: { degree: "B.Com", graduationYear: 2027, availableHoursPerWeek: 2 },
      catalog: CAREERS,
    });
    assert.equal(nonTechnical.targetCareer?.id, "ai-automation-specialist");
    assert.equal(nonTechnical.bestEntryCareer?.id, "operations-associate");
    assert.equal(nonTechnical.routeType, "ADJACENT");
  });
});

describe("Phase 5.1 — Career Transition Integrity & Route Fallback Defect Fixes", () => {
  // Test 1: Target and entry are identical: DIRECT is valid.
  it("1. Target and entry are identical: DIRECT is valid", () => {
    const technicalBuilderAnswers = {
      q1: "Solving difficult problems",
      q2: ["The person who builds/codes things", "The one fixing problems last minute"],
      q3: ["Watching tech / coding videos", "Exploring AI tools"],
      q4: ["Writing code or working with tools", "Researching and learning new things"],
      q5: "I actually enjoy it",
      q6: ["Trying things directly and breaking stuff", "Building real projects while learning"],
      q7: ["Working independently with autonomy"],
      q8: ["Too much theory with no practical work"],
      q9: ["Being respected and highly skilled"],
      q10: ["Creating apps or websites", "Working with AI or automation tools"],
      q11: ["Financial freedom — options and wealth"],
      q12: "I genuinely enjoy constantly learning new things",
      q13: "I love programming, debugging, and architecting software systems",
    };
    const context = { degree: "B.Tech Computer Science", graduationYear: 2027, availableHoursPerWeek: 20 };
    const strategy = buildEntryStrategy({
      answers: technicalBuilderAnswers,
      context,
      catalog: CAREERS,
    });
    assert.equal(strategy.insufficientContext, false);
    assert.equal(strategy.targetCareer?.id, "software-engineer");
    assert.equal(strategy.bestEntryCareer?.id, "software-engineer");
    assert.equal(strategy.routeType, "DIRECT");
    assert.equal(strategy.bridgeCareer, null);

    const explanation = buildStrategyExplanation({
      strategy,
      profile: normalizeAnswers(technicalBuilderAnswers),
      context,
      catalog: CAREERS,
    });
    assert.match(explanation.route, /Your recommended starting point and long-term direction are the same \(Software Engineer\)/);
    assert.match(explanation.route, /so this is a direct route — no intermediate step is required/);
    assert.equal(explanation.bridge, null);
    assert.match(explanation.entry, /Software Engineer is the recommended starting point/);
    assert.match(explanation.entry, /It is both the long-term direction and the starting point/);
  });

  // Test 2: Entry is an explicit target entry candidate: ADJACENT is valid.
  it("2. Entry is an explicit target entry candidate: ADJACENT is valid", () => {
    const context = { degree: "BBA", graduationYear: 2026, availableHoursPerWeek: 12 };
    const strategy = buildEntryStrategy({
      answers: fixtureProductOriented.answers,
      context,
      catalog: CAREERS,
    });
    assert.equal(strategy.insufficientContext, false);
    assert.equal(strategy.targetCareer?.id, "product-manager");
    assert.equal(strategy.bestEntryCareer?.id, "project-coordinator");
    assert.equal(strategy.routeType, "ADJACENT");
    assert.equal(strategy.bridgeCareer, null);

    const pm = CAREERS.find((c) => c.id === "product-manager")!;
    assert.ok(pm.entryCandidates.includes("project-coordinator"), "project-coordinator must be in product-manager.entryCandidates");

    const explanation = buildStrategyExplanation({
      strategy,
      profile: normalizeAnswers(fixtureProductOriented.answers),
      context,
      catalog: CAREERS,
    });
    assert.match(explanation.route, /This is an adjacent route: start as Project Coordinator and use that experience as a stepping stone toward Product Manager/);
    assert.equal(explanation.bridge, null);
    assert.match(explanation.entry, /Project Coordinator is the recommended starting point/);
    assert.match(explanation.entry, /It is directly connected to Product Manager in the strategy model/);
  });

  // Test 3: Entry is a valid documented bridge: BRIDGE is valid.
  it("3. Entry is a valid documented bridge: BRIDGE is valid", () => {
    const customBridgeCatalog: readonly CareerDefinition[] = [
      {
        id: "apex-destination",
        title: "Apex Destination",
        category: "Leadership",
        accessibility: "LOW",
        degreeStrong: ["CS_IT_DATA"],
        degreeModerate: [],
        degreeWeak: [],
        runwayHours: 400,
        codeIntensity: 0,
        targetPotential: 5,
        fitWeights: { analytical: 1 },
        entryCandidates: [],
        bridgeCandidates: ["mid-bridge"],
      },
      {
        id: "mid-bridge",
        title: "Mid Bridge",
        category: "Engineering",
        accessibility: "MEDIUM",
        degreeStrong: ["CS_IT_DATA"],
        degreeModerate: [],
        degreeWeak: [],
        runwayHours: 200,
        codeIntensity: 0,
        targetPotential: 3,
        fitWeights: { analytical: 0.8 },
        entryCandidates: ["accessible-wedge"],
        bridgeCandidates: [],
      },
      {
        id: "accessible-wedge",
        title: "Accessible Wedge",
        category: "Support",
        accessibility: "VERY_HIGH",
        degreeStrong: ["CS_IT_DATA"],
        degreeModerate: [],
        degreeWeak: [],
        runwayHours: 100,
        codeIntensity: 0,
        targetPotential: 2,
        fitWeights: { analytical: 0.8 },
        entryCandidates: [],
        bridgeCandidates: [],
      },
    ];

    const context = { degree: "B.Tech Computer Science", graduationYear: 2027, availableHoursPerWeek: 10 };
    const strategy = buildEntryStrategy({
      answers: fixtureAnalyticalTechnical.answers,
      context,
      catalog: customBridgeCatalog,
    });

    assert.equal(strategy.insufficientContext, false);
    assert.equal(strategy.routeType, "BRIDGE");
    assert.equal(strategy.targetCareer?.id, "apex-destination");
    assert.equal(strategy.bestEntryCareer?.id, "accessible-wedge");
    assert.equal(strategy.bridgeCareer?.id, "mid-bridge");
    assert.notEqual(strategy.bestEntryCareer?.id, strategy.bridgeCareer?.id);
    assert.notEqual(strategy.targetCareer?.id, strategy.bridgeCareer?.id);

    const explanation = buildStrategyExplanation({
      strategy,
      profile: normalizeAnswers(fixtureAnalyticalTechnical.answers),
      context,
      catalog: customBridgeCatalog,
    });
    assert.match(explanation.route, /This is a bridge route with a clear chain: Accessible Wedge → Mid Bridge → Apex Destination/);
    assert.match(explanation.bridge ?? "", /Mid Bridge sits between Accessible Wedge and Apex Destination/);
  });

  // Test 4: Entry is unrelated and there is no valid bridge: it must never be DIRECT or ADJACENT.
  it("4. Entry is unrelated and there is no valid bridge: it must never be DIRECT or ADJACENT", () => {
    // Isolated apex that cannot be entered directly (accessibility LOW, 1h/wk availability)
    // and unrelated role that has no graph edge to apex.
    const isolatedCatalog: readonly CareerDefinition[] = [
      {
        id: "isolated-apex",
        title: "Isolated Apex",
        category: "Apex",
        accessibility: "LOW",
        degreeStrong: [],
        degreeModerate: [],
        degreeWeak: [],
        runwayHours: 500,
        codeIntensity: 0,
        targetPotential: 5,
        fitWeights: { analytical: 1 },
        entryCandidates: [],
        bridgeCandidates: [],
      },
      {
        id: "unconnected-role",
        title: "Unconnected Role",
        category: "Support",
        accessibility: "VERY_HIGH",
        degreeStrong: [],
        degreeModerate: [],
        degreeWeak: [],
        runwayHours: 50,
        codeIntensity: 0,
        targetPotential: 1,
        fitWeights: { analytical: 0.5 },
        entryCandidates: [],
        bridgeCandidates: [],
      },
    ];

    const context = { degree: "B.Tech Computer Science", graduationYear: 2027, availableHoursPerWeek: 1 };
    const strategy = buildEntryStrategy({
      answers: fixtureAnalyticalTechnical.answers,
      context,
      catalog: isolatedCatalog,
    });

    // Defect 1 check: The engine must NEVER mislabel an unconnected entry as DIRECT or ADJACENT.
    assert.notEqual(strategy.routeType, "DIRECT", "Must NEVER label unconnected entry as DIRECT");
    assert.notEqual(strategy.routeType, "ADJACENT", "Must NEVER label unconnected entry as ADJACENT");
    assert.notEqual(strategy.routeType, "BRIDGE", "Must NEVER label unconnected entry as BRIDGE");
    assert.equal(strategy.routeType, null);
    assert.equal(strategy.bestEntryCareer, null);
    assert.equal(strategy.insufficientContext, true);

    const explanation = buildStrategyExplanation({
      strategy,
      profile: normalizeAnswers(fixtureAnalyticalTechnical.answers),
      context,
      catalog: isolatedCatalog,
    });
    assert.match(explanation.target, /not enough information/);
    assert.match(explanation.entry, /not enough information/);
    assert.match(explanation.route, /Complete the required assessment/);
  });

  // Test 5: A target has bridge candidates, but the proposed entry is unrelated: compatibility must be false.
  it("5. A target has bridge candidates, but the proposed entry is unrelated: compatibility must be false", () => {
    const testCatalog: readonly CareerDefinition[] = [
      {
        id: "target-with-bridges",
        title: "Target With Bridges",
        category: "Leadership",
        accessibility: "LOW",
        degreeStrong: [],
        degreeModerate: [],
        degreeWeak: [],
        runwayHours: 400,
        codeIntensity: 0,
        targetPotential: 5,
        fitWeights: { analytical: 1 },
        entryCandidates: [],
        bridgeCandidates: ["legit-bridge"],
      },
      {
        id: "legit-bridge",
        title: "Legit Bridge",
        category: "Operations",
        accessibility: "MEDIUM",
        degreeStrong: [],
        degreeModerate: [],
        degreeWeak: [],
        runwayHours: 200,
        codeIntensity: 0,
        targetPotential: 3,
        fitWeights: { analytical: 0.8 },
        entryCandidates: ["connected-entry"],
        bridgeCandidates: [],
      },
      {
        id: "connected-entry",
        title: "Connected Entry",
        category: "Support",
        accessibility: "HIGH",
        degreeStrong: [],
        degreeModerate: [],
        degreeWeak: [],
        runwayHours: 120,
        codeIntensity: 0,
        targetPotential: 2,
        fitWeights: { analytical: 0.8 },
        entryCandidates: [],
        bridgeCandidates: [],
      },
      {
        id: "unrelated-candidate",
        title: "Unrelated Candidate",
        category: "Design",
        accessibility: "VERY_HIGH",
        degreeStrong: [],
        degreeModerate: [],
        degreeWeak: [],
        runwayHours: 80,
        codeIntensity: 0,
        targetPotential: 2,
        fitWeights: { analytical: 0.8 },
        entryCandidates: [],
        bridgeCandidates: [],
      },
    ];

    const target = testCatalog.find((c) => c.id === "target-with-bridges")!;
    const unrelatedCandidate = testCatalog.find((c) => c.id === "unrelated-candidate")!;
    const connectedEntry = testCatalog.find((c) => c.id === "connected-entry")!;

    // Defect 2 check: An unrelated candidate must NOT be compatible merely because target.bridgeCandidates.length > 0.
    const isUnrelatedCompatible = isCompatibleEntry(unrelatedCandidate, target, 10, testCatalog);
    assert.equal(
      isUnrelatedCompatible,
      false,
      "Defect 2 check: unrelated candidate must NOT be compatible with target having bridge candidates",
    );

    // The genuine connected entry must be compatible.
    const isConnectedCompatible = isCompatibleEntry(connectedEntry, target, 10, testCatalog);
    assert.equal(
      isConnectedCompatible,
      true,
      "Candidate that connects through a documented bridge candidate must be compatible",
    );
  });

  // Test 6: A valid bridge and connected entry exist: the engine selects and explains the real route correctly.
  it("6. A valid bridge and connected entry exist: the engine selects and explains the real route correctly", () => {
    const answers = {
      ...fixtureAnalyticalTechnical.answers,
      q10: ["Working with data or solving analytical problems"],
      q12: "I genuinely enjoy constantly learning new things",
    };
    const context = { degree: "B.Tech Computer Science", graduationYear: 2027, availableHoursPerWeek: 10 };
    const strategy = buildEntryStrategy({
      answers,
      context,
      catalog: BRIDGE_CATALOG,
    });

    assert.equal(strategy.routeType, "BRIDGE");
    assert.equal(strategy.targetCareer?.id, "apex-role");
    assert.equal(strategy.bestEntryCareer?.id, "wedge-role");
    assert.equal(strategy.bridgeCareer?.id, "mid-role");

    const explanation = buildStrategyExplanation({
      strategy,
      profile: normalizeAnswers(answers),
      context,
      catalog: BRIDGE_CATALOG,
    });
    assert.equal(
      explanation.route,
      "This is a bridge route with a clear chain: Wedge Role → Mid Role → Apex Role. Mid Role builds on entry-level experience and moves you closer to Apex Role.",
    );
    assert.equal(
      explanation.bridge,
      "Mid Role sits between Wedge Role and Apex Role: it builds on entry-level experience and moves you closer to Apex Role.",
    );
    assert.match(explanation.entry, /Wedge Role is the recommended starting point/);
    assert.match(explanation.target, /Apex Role is your strongest long-term direction/);
  });

  // Test 7: Existing catalog routes and the four Phase 5 synthetic profiles retain valid route classifications.
  it("7. Existing catalog routes and the four Phase 5 synthetic profiles retain valid route classifications", () => {
    // 7A: Profile A (Product/Business-Oriented) -> ADJACENT (project-coordinator -> product-manager)
    const profA = buildEntryStrategy({
      answers: {
        q1: "Working with people",
        q2: ["The one managing everyone"],
        q3: ["Business or money content", "Helping friends solve problems"],
        q4: ["Talking to people or clients"],
        q5: "I don't enjoy it much",
        q6: ["Learning with a community or friends"],
        q7: ["Team collaboration and meetings"],
        q8: ["Too much deep coding all day"],
        q9: ["Building something of my own"],
        q10: ["Understanding business, money, or strategy", "Managing people or projects"],
        q11: ["Running my own business or venture"],
        q12: "I'm okay with it if it helps my career growth",
        q13: "I want to manage products and teams",
      },
      context: { degree: "BBA", graduationYear: 2026, availableHoursPerWeek: 12 },
      catalog: CAREERS,
    });
    assert.equal(profA.targetCareer?.id, "product-manager");
    assert.equal(profA.bestEntryCareer?.id, "project-coordinator");
    assert.equal(profA.routeType, "ADJACENT");
    const pm = CAREERS.find((c) => c.id === "product-manager")!;
    assert.ok(pm.entryCandidates.includes(profA.bestEntryCareer.id));

    // 7B: Profile B (Data/Analytics-Oriented) -> DIRECT (data-analyst -> data-analyst)
    const profB = buildEntryStrategy({
      answers: {
        q1: "Solving difficult problems",
        q2: ["The silent one doing their own focused work", "The one fixing problems last minute"],
        q3: ["Learning random stuff online", "Organizing and planning things"],
        q4: ["Organizing data or systems", "Researching and learning new things"],
        q5: "I can learn if it helps my career",
        q6: ["Following structured steps or courses"],
        q7: ["Clear guidelines and standard processes"],
        q8: ["Too much chaos or unpredictability"],
        q9: ["Mastering a valuable specialized skill"],
        q10: ["Working with data or solving analytical problems"],
        q11: ["Financial freedom — options and wealth"],
        q12: "I genuinely enjoy constantly learning new things",
        q13: "I want to analyze patterns and extract actionable insights from data",
      },
      context: { degree: "B.Tech Computer Science", graduationYear: 2027, availableHoursPerWeek: 15 },
      catalog: CAREERS,
    });
    assert.equal(profB.targetCareer?.id, "data-analyst");
    assert.equal(profB.bestEntryCareer?.id, "data-analyst");
    assert.equal(profB.routeType, "DIRECT");

    // 7C: Profile C (Technical Builder) -> DIRECT (software-engineer -> software-engineer)
    const profC = buildEntryStrategy({
      answers: {
        q1: "Solving difficult problems",
        q2: ["The person who builds/codes things", "The one fixing problems last minute"],
        q3: ["Watching tech / coding videos", "Exploring AI tools"],
        q4: ["Writing code or working with tools", "Researching and learning new things"],
        q5: "I actually enjoy it",
        q6: ["Trying things directly and breaking stuff", "Building real projects while learning"],
        q7: ["Working independently with autonomy"],
        q8: ["Too much theory with no practical work"],
        q9: ["Being respected and highly skilled"],
        q10: ["Creating apps or websites", "Working with AI or automation tools"],
        q11: ["Financial freedom — options and wealth"],
        q12: "I genuinely enjoy constantly learning new things",
        q13: "I love programming, debugging, and architecting software systems",
      },
      context: { degree: "B.Tech Computer Science", graduationYear: 2027, availableHoursPerWeek: 20 },
      catalog: CAREERS,
    });
    assert.equal(profC.targetCareer?.id, "software-engineer");
    assert.equal(profC.bestEntryCareer?.id, "software-engineer");
    assert.equal(profC.routeType, "DIRECT");

    // 7D: Profile D (AI Automation) -> DIRECT (ai-automation-specialist -> ai-automation-specialist)
    const profD = buildEntryStrategy({
      answers: {
        q1: "Making money early",
        q2: ["The person who builds/codes things", "The one fixing problems last minute"],
        q3: ["Exploring AI tools", "Business or money content"],
        q4: ["Finding shortcuts or automating tasks", "Writing code or working with tools"],
        q5: "I prefer low-code or no-code tools",
        q6: ["Trying things directly and breaking stuff", "Building real projects while learning"],
        q7: ["Working independently with autonomy"],
        q8: ["Too much deep coding all day"],
        q9: ["Building something of my own"],
        q10: ["Working with AI or automation tools", "Understanding business, money, or strategy"],
        q11: ["Running my own business or venture"],
        q12: "I'm okay with it if it helps my career growth",
        q13: "I want to build practical AI automations and workflows with low-code tools",
      },
      context: { degree: "B.Tech Information Technology", graduationYear: 2026, availableHoursPerWeek: 12 },
      catalog: CAREERS,
    });
    assert.equal(profD.targetCareer?.id, "ai-automation-specialist");
    assert.equal(profD.bestEntryCareer?.id, "ai-automation-specialist");
    assert.equal(profD.routeType, "DIRECT");

    // 7E: Verify all standard fixtures against catalog graph invariants
    for (const fixture of ALL_FIXTURES) {
      const strategy = buildEntryStrategy({
        answers: fixture.answers,
        context: fixture.context,
        catalog: CAREERS,
      });
      if (strategy.insufficientContext || !strategy.targetCareer || !strategy.bestEntryCareer) {
        continue;
      }
      const targetDef = CAREERS.find((c) => c.id === strategy.targetCareer?.id)!;
      const entryDef = CAREERS.find((c) => c.id === strategy.bestEntryCareer?.id)!;

      if (strategy.routeType === "DIRECT") {
        assert.equal(strategy.targetCareer.id, strategy.bestEntryCareer.id, "DIRECT requires entry === target");
      } else if (strategy.routeType === "ADJACENT") {
        assert.ok(
          targetDef.entryCandidates.includes(entryDef.id),
          `ADJACENT requires ${entryDef.id} in ${targetDef.id}.entryCandidates`,
        );
      } else if (strategy.routeType === "BRIDGE") {
        assert.ok(strategy.bridgeCareer, "BRIDGE requires bridgeCareer");
        const bridgeDef = CAREERS.find((c) => c.id === strategy.bridgeCareer?.id)!;
        assert.ok(
          targetDef.bridgeCandidates.includes(bridgeDef.id),
          `BRIDGE requires ${bridgeDef.id} in ${targetDef.id}.bridgeCandidates`,
        );
        assert.ok(
          bridgeDef.entryCandidates.includes(entryDef.id),
          `BRIDGE requires ${entryDef.id} in ${bridgeDef.id}.entryCandidates`,
        );
      }
    }
  });
});


