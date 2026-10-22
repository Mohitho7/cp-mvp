/**
 * Phase 2 tests — deterministic multi-role ranking and work-lane alignment.
 *
 * Run: pnpm --filter @workspace/scripts run test:ranking
 * (node:test + tsx; no database, no network, no LLM calls)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CAREERS } from "./catalog";
import { normalizeAnswers } from "./fitProfile";
import {
  alignmentFor,
  normalizeDegreeFamily,
} from "./degreeAlignment";
import {
  buildEntryStrategy,
  hasDeepCodingAversion,
} from "./strategy";
import {
  buildMultiRoleRanking,
  CAREER_PRIMARY_LANE,
  deriveRecommendedWorkLane,
  getCareerMacroDomain,
  rankEntryOptions,
  rankLongTermOptions,
} from "./ranking";
import {
  ALL_FIXTURES,
  fixtureAnalyticalTechnical,
  fixtureBusinessOriented,
  fixtureDesignOriented,
  fixtureEmptyAnswers,
  fixtureLowTimeAvailability,
  fixtureProductOriented,
  fixtureUnknownDegree,
} from "./fixtures";
import { WORK_LANE_IDS, type WorkLaneId } from "./types";

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

describe("Phase 2 — Multi-Role Ranking Determinism", () => {
  it("produces identical 5 long-term and 5 entry options across 50 runs", () => {
    for (const fixture of ALL_FIXTURES) {
      if (fixture.name === "empty-answers") continue;
      const profile = normalizeAnswers(fixture.answers);
      const firstStrategy = buildEntryStrategy({
        answers: fixture.answers,
        context: fixture.context,
        catalog: CAREERS,
      });

      assert.ok(firstStrategy.longTermOptions);
      assert.ok(firstStrategy.entryOptions);
      assert.ok(firstStrategy.recommendedWorkLane);

      for (let run = 0; run < 50; run += 1) {
        const nextStrategy = buildEntryStrategy({
          answers: fixture.answers,
          context: fixture.context,
          catalog: CAREERS,
        });

        assert.deepEqual(
          nextStrategy.longTermOptions,
          firstStrategy.longTermOptions,
          `${fixture.name} long-term run ${run}`,
        );
        assert.deepEqual(
          nextStrategy.entryOptions,
          firstStrategy.entryOptions,
          `${fixture.name} entry run ${run}`,
        );
        assert.deepEqual(
          nextStrategy.recommendedWorkLane,
          firstStrategy.recommendedWorkLane,
          `${fixture.name} lane run ${run}`,
        );
      }
    }
  });

  it("breaks exact ties by deterministic career id alphabetical order", () => {
    const profile = normalizeAnswers(fixtureDesignOriented.answers);
    const options = rankLongTermOptions(CAREERS, profile, 15);
    for (let i = 0; i < options.length - 1; i += 1) {
      if (Math.abs(options[i].score - options[i + 1].score) < 1e-9) {
        // When scores match, targetPotential desc, then id asc
        const defA = CAREERS.find((c) => c.id === options[i].career.id)!;
        const defB = CAREERS.find((c) => c.id === options[i + 1].career.id)!;
        if (defA.targetPotential === defB.targetPotential) {
          assert.ok(
            options[i].career.id < options[i + 1].career.id,
            `Tie breaking failed for ${options[i].career.id} and ${options[i + 1].career.id}`,
          );
        }
      }
    }
  });
});

describe("Phase 2 — Distinct Long-Term vs Entry Lists", () => {
  it("produces exactly 5 long-term options and 5 entry options for standard profiles", () => {
    for (const fixture of ALL_FIXTURES) {
      if (fixture.name === "empty-answers") continue;
      const strategy = buildEntryStrategy({
        answers: fixture.answers,
        context: fixture.context,
        catalog: CAREERS,
      });

      assert.equal(strategy.longTermOptions?.length, 5, `${fixture.name} long-term count`);
      assert.equal(strategy.entryOptions?.length, 5, `${fixture.name} entry count`);
    }
  });

  it("strictly excludes stepping stones (targetPotential < 3) from long-term options", () => {
    // Stepping stones: qa-engineer (2), it-support (2), operations-associate (2)
    const steppingStoneIds = ["qa-engineer", "it-support", "operations-associate"];

    for (const fixture of ALL_FIXTURES) {
      if (fixture.name === "empty-answers") continue;
      const strategy = strategyOf(fixture.name);
      const longTermIds = strategy.longTermOptions!.map((opt) => opt.career.id);

      for (const steppingStone of steppingStoneIds) {
        assert.ok(
          !longTermIds.includes(steppingStone),
          `${fixture.name}: ${steppingStone} must not appear in long-term options`,
        );
      }
    }
  });

  it("strictly excludes low-accessibility roles (accessibility == LOW) from entry options", () => {
    // Low accessibility roles: product-manager, data-scientist, cybersecurity-analyst
    const lowAccessIds = ["product-manager", "data-scientist", "cybersecurity-analyst"];

    for (const fixture of ALL_FIXTURES) {
      if (fixture.name === "empty-answers") continue;
      const strategy = strategyOf(fixture.name);
      const entryIds = strategy.entryOptions!.map((opt) => opt.career.id);

      for (const lowAccessRole of lowAccessIds) {
        assert.ok(
          !entryIds.includes(lowAccessRole),
          `${fixture.name}: ${lowAccessRole} must not appear in entry options`,
        );
      }
    }
  });

  it("guarantees long-term options and entry options are distinct lists", () => {
    for (const fixture of ALL_FIXTURES) {
      if (fixture.name === "empty-answers") continue;
      const strategy = strategyOf(fixture.name);
      const longTermIds = strategy.longTermOptions!.map((opt) => opt.career.id);
      const entryIds = strategy.entryOptions!.map((opt) => opt.career.id);

      // The two 5-item lists cannot be identical
      assert.notDeepEqual(
        longTermIds,
        entryIds,
        `${fixture.name}: longTermOptions must not simply duplicate entryOptions`,
      );
    }
  });

  it("maintains consistency: #1 long-term equals targetCareer and #1 entry equals bestEntryCareer", () => {
    for (const fixture of ALL_FIXTURES) {
      if (fixture.name === "empty-answers") continue;
      const strategy = strategyOf(fixture.name);

      assert.equal(
        strategy.longTermOptions![0].career.id,
        strategy.targetCareer?.id,
        `${fixture.name}: longTermOptions[0] must match targetCareer`,
      );
      assert.equal(
        strategy.entryOptions![0].career.id,
        strategy.bestEntryCareer?.id,
        `${fixture.name}: entryOptions[0] must match bestEntryCareer`,
      );
    }
  });
});

describe("Phase 2 — Role Justification & Non-Forcing", () => {
  it("includes Associate Product Manager when product/business fit justifies it", () => {
    const strategy = strategyOf("product-oriented-bba-10h");
    const longTermIds = strategy.longTermOptions!.map((opt) => opt.career.id);
    const entryIds = strategy.entryOptions!.map((opt) => opt.career.id);

    // BBA with product/people answers should justify APM in both long-term and entry options
    assert.ok(
      longTermIds.includes("associate-product-manager"),
      "associate-product-manager should be in long-term options for product-oriented profile",
    );
    assert.ok(
      entryIds.includes("associate-product-manager"),
      "associate-product-manager should be in entry options for product-oriented profile",
    );
  });

  it("does NOT force Associate Product Manager into purely technical or design profiles", () => {
    const techStrategy = strategyOf("analytical-technical-cse-20h");
    const designStrategy = strategyOf("design-oriented-bdes-12h");

    // Top 3 should not be polluted by APM for pure tech or design
    const techTop3Targets = techStrategy.longTermOptions!.slice(0, 3).map((opt) => opt.career.id);
    const designTop3Targets = designStrategy.longTermOptions!.slice(0, 3).map((opt) => opt.career.id);

    assert.ok(!techTop3Targets.includes("associate-product-manager"));
    assert.ok(!designTop3Targets.includes("associate-product-manager"));
  });

  it("includes AI Automation Specialist when automation and execution fit justifies it", () => {
    // Technical profile with automation interests
    const techStrategy = strategyOf("analytical-technical-cse-20h");
    const entryIds = techStrategy.entryOptions!.map((opt) => opt.career.id);

    assert.ok(
      entryIds.includes("ai-automation-specialist"),
      "ai-automation-specialist should be among viable entry options for tech CSE",
    );
  });

  it("does NOT force AI Automation Specialist into business/commerce profile entry", () => {
    const businessStrategy = strategyOf("business-oriented-bcom-10h");
    const top3Entries = businessStrategy.entryOptions!.slice(0, 3).map((opt) => opt.career.id);

    // Top 3 entries for B.Com are project-coordinator, business-analyst, operations-associate
    assert.ok(!top3Entries.includes("ai-automation-specialist"));
  });
});

describe("Phase 2 — Degree Alignment and Availability Realism", () => {
  it("elevates technical entry roles for CS degree compared to unknown degree", () => {
    const cseStrategy = strategyOf("analytical-technical-cse-20h");
    const unknownStrategy = strategyOf("analytical-unknown-degree-15h");

    const cseQa = cseStrategy.entryOptions!.find((opt) => opt.career.id === "qa-engineer");
    const unknownQa = unknownStrategy.entryOptions!.find((opt) => opt.career.id === "qa-engineer");

    assert.ok(cseQa && unknownQa);
    assert.equal(cseQa.alignment, "STRONG");
    assert.equal(unknownQa.alignment, "NEUTRAL");
    // CS degree yields higher entry score due to strong alignment
    assert.ok(cseQa.score > unknownQa.score);
  });

  it("reflects preparation runway constraints at low hours (4h vs 20h)", () => {
    const fullTimeStrategy = strategyOf("analytical-technical-cse-20h");
    const lowTimeStrategy = strategyOf("analytical-technical-cse-4h");

    // Target careers remain identical because long-term target does not depend on available hours
    assert.deepEqual(
      fullTimeStrategy.longTermOptions!.map((o) => o.career.id),
      lowTimeStrategy.longTermOptions!.map((o) => o.career.id),
    );

    // Entry scores drop noticeably across the board due to longer required weeks
    for (let i = 0; i < 5; i += 1) {
      assert.ok(
        lowTimeStrategy.entryOptions![i].score < fullTimeStrategy.entryOptions![i].score,
        `Entry option ${i} score should be lower for 4h availability`,
      );
    }
  });

  it("penalizes code-intensive entry roles when deep-coding aversion is present", () => {
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

    // Targets remain unaffected
    assert.equal(
      withoutAversion.longTermOptions![0].career.id,
      withAversion.longTermOptions![0].career.id,
    );

    // Software Engineer (codeIntensity: 1.0) suffers penalty in entry options
    const seWithout = withoutAversion.entryOptions!.find((o) => o.career.id === "software-engineer");
    const seWith = withAversion.entryOptions!.find((o) => o.career.id === "software-engineer");

    if (seWithout && seWith) {
      assert.ok(
        seWith.score < seWithout.score,
        "Software Engineer entry score must be penalized when coding aversion is present",
      );
    }
  });
});

describe("Phase 2 — Defensible Career Transitions", () => {
  it("never includes IT Support as an entry route or candidate for Software Engineer", () => {
    const swe = CAREERS.find((c) => c.id === "software-engineer");
    assert.ok(swe);
    assert.ok(!swe.entryCandidates.includes("it-support"));
    assert.ok(!swe.bridgeCandidates.includes("it-support"));

    // If student's target is Software Engineer, entry candidates are QA Engineer
    assert.deepEqual(swe.entryCandidates, ["qa-engineer"]);
  });
});

describe("Phase 2 — Work-Lane Consistency and Alignment", () => {
  it("always derives one of the 7 canonical work lanes", () => {
    const validLanes = new Set(WORK_LANE_IDS);

    for (const fixture of ALL_FIXTURES) {
      if (fixture.name === "empty-answers") continue;
      const strategy = strategyOf(fixture.name);
      assert.ok(strategy.recommendedWorkLane);
      assert.ok(
        validLanes.has(strategy.recommendedWorkLane.lane),
        `${strategy.recommendedWorkLane.lane} must be one of the 7 canonical tracks`,
      );
      assert.ok(strategy.recommendedWorkLane.why.length > 20);
      assert.equal(strategy.recommendedWorkLane.primaryCareer.id, strategy.targetCareer?.id);
      assert.ok(strategy.recommendedWorkLane.supportingCareers.length >= 1);
    }
  });

  it("aligns canonical profiles to their respective work lanes", () => {
    assert.equal(strategyOf("analytical-technical-cse-20h").recommendedWorkLane?.lane, "Engineering");
    assert.equal(strategyOf("analytical-technical-cse-4h").recommendedWorkLane?.lane, "Engineering");
    assert.equal(strategyOf("product-oriented-bba-10h").recommendedWorkLane?.lane, "Product");
    assert.equal(strategyOf("design-oriented-bdes-12h").recommendedWorkLane?.lane, "Design / UI-UX");
    assert.equal(strategyOf("business-oriented-bcom-10h").recommendedWorkLane?.lane, "Startup Ops");
    assert.equal(strategyOf("analytical-unknown-degree-15h").recommendedWorkLane?.lane, "Engineering");
  });

  it("activates Hybrid Tech-Generalist when cross-functional tech and business signals bridge", () => {
    // Cross-functional profile: student with business degree, technical problem-solving & AI interest,
    // and coding aversion bridging technical direction with operational entry
    const hybridAnswers = {
      q1: "Making money early",
      q2: ["The one managing everyone"],
      q3: ["Exploring AI tools", "Organizing and planning things"],
      q4: ["Using shortcuts, automations, or simpler methods", "Organizing data or systems"],
      q5: "I prefer low-code or no-code tools",
      q6: ["Trying things directly and breaking stuff", "Following structured steps or courses"],
      q7: ["Fast-paced startup / high ownership"],
      q8: ["Too much deep coding all day"],
      q9: ["Building something of my own"],
      q10: ["Working with AI or automation tools", "Understanding business, money, or strategy"],
      q11: ["Financial freedom — options and wealth"],
      q12: "I genuinely enjoy constantly learning new things",
      q13: "I want to build AI automation workflows for business operations",
    };

    const strategy = buildEntryStrategy({
      answers: hybridAnswers,
      context: { degree: "BBA", graduationYear: 2026, availableHoursPerWeek: 12 },
      catalog: CAREERS,
    });

    assert.equal(strategy.insufficientContext, false);
    assert.ok(strategy.recommendedWorkLane);
    assert.equal(strategy.recommendedWorkLane.lane, "Hybrid Tech-Generalist");
    assert.match(strategy.recommendedWorkLane.why, /Hybrid Tech-Generalist/);
    assert.ok(strategy.recommendedWorkLane.supportingCareers.length >= 2);
  });
});

describe("Phase 2 — Insufficient Context Safe Degradation", () => {
  it("safely sets empty options and null work lane when context is insufficient", () => {
    const emptyStrategy = strategyOf("empty-answers");
    assert.equal(emptyStrategy.insufficientContext, true);
    assert.deepEqual(emptyStrategy.longTermOptions, []);
    assert.deepEqual(emptyStrategy.entryOptions, []);
    assert.equal(emptyStrategy.recommendedWorkLane, null);

    const ranking = buildMultiRoleRanking({
      catalog: [],
      profile: normalizeAnswers(fixtureAnalyticalTechnical.answers),
      context: fixtureAnalyticalTechnical.context,
      codeAversion: false,
      primaryTarget: null,
      bestEntry: null,
    });

    assert.deepEqual(ranking.longTermOptions, []);
    assert.deepEqual(ranking.entryOptions, []);
    assert.equal(ranking.recommendedWorkLane, null);
  });
});

describe("Phase 2 — Engine Purity (Zero Banned Tokens)", () => {
  it("ensures ranking.ts uses no LLM, network, database, clock, or randomness", () => {
    const banned = [
      "fetch(",
      "Math.random",
      "Date.now",
      "process.env",
      "OpenAI",
      "drizzle",
      "groq",
      "gemini",
    ];
    const rankingContent = readFileSync(join(STRATEGY_DIR, "ranking.ts"), "utf8").toLowerCase();
    for (const token of banned) {
      assert.ok(
        !rankingContent.includes(token.toLowerCase()),
        `ranking.ts contains banned token: ${token}`,
      );
    }
  });
});

describe("Phase 2.1 — Recommendation Logic Defect Regressions", () => {
  // Audit Profile 1: Product-Oriented Student (BBA, 15h/wk, deep coding aversion)
  const productProfileAnswers = {
    q1: "Building something cool",
    q2: ["The one managing everyone"],
    q3: ["Business or money content", "Helping friends solve problems"],
    q4: ["Talking to people or clients"],
    q5: "I prefer low-code or no-code tools",
    q6: ["Building real projects while learning"],
    q7: ["Startup chaos and fast growth", "Team collaboration and meetings"],
    q8: ["Too much deep coding all day"],
    q9: ["Building something of my own", "Earning a lot of money"],
    q10: ["Managing people or projects", "Understanding business, money, or strategy"],
    q11: ["Running my own business or venture"],
    q12: "I can learn when I see why it matters",
    q13: "Want to lead product teams and build software products without being a full-time programmer.",
  };

  // Audit Profile 2: Technical Builder Student (B.Tech CSE, 20h/wk, no aversion)
  const technicalBuilderAnswers = {
    q1: "Building something cool",
    q2: ["The person who builds/codes things"],
    q3: ["Watching tech / coding videos", "Exploring AI tools"],
    q4: ["Writing code or working with tools", "Finding shortcuts or automating tasks"],
    q5: "I actually enjoy it",
    q6: ["Trying things directly and breaking stuff", "Building real projects while learning"],
    q7: ["Remote independent work", "Startup chaos and fast growth"],
    q8: ["Too many meetings or people interactions"],
    q9: ["Being respected and highly skilled", "Building something of my own"],
    q10: ["Creating apps or websites", "Working with AI or automation tools"],
    q11: ["Flexible work — travel, remote, freedom"],
    q12: "I genuinely enjoy constantly learning new things",
    q13: "Want to become a core backend or full-stack software engineer writing production systems.",
  };

  // Audit Profile 3: Analytical Problem-Solver (B.Sc Statistics, 15h/wk, no aversion)
  const analyticalSolverAnswers = {
    q1: "Solving difficult problems",
    q2: ["The silent one doing their own focused work"],
    q3: ["Learning random stuff online", "Exploring AI tools"],
    q4: ["Organizing data or systems", "Researching and learning new things"],
    q5: "I can learn if it helps my career",
    q6: ["Following structured steps or courses", "Trying things directly and breaking stuff"],
    q7: ["Stable corporate structure", "Remote independent work"],
    q8: ["Doing the same repetitive thing daily"],
    q9: ["Being respected and highly skilled"],
    q10: ["Working with data or solving analytical problems", "Working with AI or automation tools"],
    q11: ["A respected high-level career"],
    q12: "I genuinely enjoy constantly learning new things",
    q13: "Interested in machine learning, statistical modeling, and data science.",
  };

  // Audit Profile 4: AI Automation Generalist (BCA, 12h/wk, deep coding aversion)
  const aiAutomationAnswers = {
    q1: "Building something cool",
    q2: ["The one fixing problems last minute"],
    q3: ["Exploring AI tools", "Business or money content"],
    q4: ["Finding shortcuts or automating tasks"],
    q5: "I prefer low-code or no-code tools",
    q6: ["Trying things directly and breaking stuff"],
    q7: ["Freelancing or running my own thing", "Startup chaos and fast growth"],
    q8: ["Too much deep coding all day"],
    q9: ["Building something of my own", "Working from anywhere in the world"],
    q10: ["Working with AI or automation tools", "Understanding business, money, or strategy"],
    q11: ["Running my own business or venture"],
    q12: "I can learn when I see why it matters",
    q13: "Love automating business workflows using Zapier, Make, and LLM APIs without writing endless low-level code.",
  };

  // Audit Profile 5: Balanced Hybrid (B.Tech CSE, 15h/wk, no aversion)
  const balancedHybridAnswers = {
    q1: "Building something cool",
    q2: ["The one managing everyone"],
    q3: ["Watching tech / coding videos", "Business or money content"],
    q4: ["Writing code or working with tools", "Talking to people or clients"],
    q5: "I actually enjoy it",
    q6: ["Building real projects while learning"],
    q7: ["Startup chaos and fast growth", "Team collaboration and meetings"],
    q8: ["Doing the same repetitive thing daily"],
    q9: ["Building something of my own", "Earning a lot of money"],
    q10: ["Creating apps or websites", "Managing people or projects", "Understanding business, money, or strategy"],
    q11: ["Running my own business or venture"],
    q12: "I genuinely enjoy constantly learning new things",
    q13: "I enjoy writing code and technical architecture, but I also love product management, user interviews, and leading sprints.",
  };

  it("Fix A & D: product-oriented profile with coding aversion penalizes intensive coding roles in targets and entry", () => {
    const strategy = buildEntryStrategy({
      answers: productProfileAnswers,
      context: { degree: "BBA", graduationYear: 2026, availableHoursPerWeek: 15 },
      catalog: CAREERS,
    });

    assert.equal(strategy.insufficientContext, false);
    // Low-code / automation / product options lead
    assert.ok(strategy.targetCareer);
    assert.ok(
      strategy.targetCareer.id === "product-manager" ||
      strategy.targetCareer.id === "associate-product-manager" ||
      strategy.targetCareer.id === "ai-automation-specialist",
      `Expected product/automation target, got ${strategy.targetCareer.id}`,
    );

    // Software Engineer must not be top 3 targets due to aversion penalty (codeIntensity: 1.0)
    assert.ok(strategy.longTermOptions);
    assert.ok(strategy.entryOptions);
    const targetIds = strategy.longTermOptions.map((o) => o.career.id);
    const sweTargetIndex = targetIds.indexOf("software-engineer");
    assert.ok(sweTargetIndex >= 3 || sweTargetIndex === -1, `SWE should be penalized down, got index ${sweTargetIndex}`);

    // Entry options must favor low-code / product / business roles
    const entryIds = strategy.entryOptions.map((o) => o.career.id);
    assert.ok(
      entryIds.includes("associate-product-manager") ||
      entryIds.includes("operations-associate") ||
      entryIds.includes("business-analyst"),
    );
  });

  it("Fix A & D: AI-automation profile ranks automation above Software Engineering when answers support it", () => {
    const strategy = buildEntryStrategy({
      answers: aiAutomationAnswers,
      context: { degree: "BCA", graduationYear: 2026, availableHoursPerWeek: 12 },
      catalog: CAREERS,
    });

    assert.equal(strategy.insufficientContext, false);
    assert.equal(strategy.targetCareer?.id, "ai-automation-specialist");
    assert.equal(strategy.bestEntryCareer?.id, "ai-automation-specialist");
    assert.equal(strategy.routeType, "DIRECT");

    // Automation outranks Software Engineer for both target and entry
    assert.ok(strategy.longTermOptions);
    assert.ok(strategy.entryOptions);
    const targetIds = strategy.longTermOptions.map((o) => o.career.id);
    const entryIds = strategy.entryOptions.map((o) => o.career.id);
    assert.ok(targetIds.indexOf("ai-automation-specialist") < targetIds.indexOf("software-engineer"));
    assert.ok(entryIds.indexOf("ai-automation-specialist") < entryIds.indexOf("software-engineer") || !entryIds.includes("software-engineer"));
  });

  it("Fix C: balanced technical/product profile receives meaningful product signals and retains product options", () => {
    const profile = normalizeAnswers(balancedHybridAnswers);
    assert.ok(profile.product >= 0.10, `Expected product signal >= 0.10, got ${profile.product}`);
    assert.ok(profile.business >= 0.12, `Expected business signal >= 0.12, got ${profile.business}`);
    assert.ok(profile.technical >= 0.20, `Expected technical signal >= 0.20, got ${profile.technical}`);

    const strategy = buildEntryStrategy({
      answers: balancedHybridAnswers,
      context: { degree: "B.Tech Computer Science", graduationYear: 2026, availableHoursPerWeek: 15 },
      catalog: CAREERS,
    });

    assert.equal(strategy.insufficientContext, false);
    // Work lane activates Hybrid Tech-Generalist because of cross-domain aptitude
    assert.equal(strategy.recommendedWorkLane?.lane, "Hybrid Tech-Generalist");

    // Retains both technical and product options in long-term options
    assert.ok(strategy.longTermOptions);
    const targetIds = strategy.longTermOptions.map((o) => o.career.id);
    assert.ok(targetIds.includes("software-engineer"));
    assert.ok(targetIds.includes("product-manager") || targetIds.includes("associate-product-manager") || targetIds.includes("ai-automation-specialist"));
  });

  it("Fix D & E: highly technical builder profile ranks Software Engineer first and achieves direct entry", () => {
    const strategy = buildEntryStrategy({
      answers: technicalBuilderAnswers,
      context: { degree: "B.Tech Computer Science", graduationYear: 2026, availableHoursPerWeek: 20 },
      catalog: CAREERS,
    });

    assert.equal(strategy.insufficientContext, false);
    assert.equal(strategy.targetCareer?.id, "software-engineer");
    assert.equal(strategy.bestEntryCareer?.id, "software-engineer");
    assert.equal(strategy.routeType, "DIRECT");
    assert.equal(strategy.recommendedWorkLane?.lane, "Engineering");

    // QA Engineer is a strong secondary entry option
    assert.ok(strategy.entryOptions);
    const entryIds = strategy.entryOptions.map((o) => o.career.id);
    assert.equal(entryIds[0], "software-engineer");
    assert.equal(entryIds[1], "qa-engineer");
  });

  it("Fix D & E: strongly analytical profile favors Data Science and Data Analytics pathways", () => {
    const strategy = buildEntryStrategy({
      answers: analyticalSolverAnswers,
      context: { degree: "B.Sc Statistics", graduationYear: 2026, availableHoursPerWeek: 15 },
      catalog: CAREERS,
    });

    assert.equal(strategy.insufficientContext, false);
    assert.equal(strategy.targetCareer?.id, "data-scientist");
    assert.equal(strategy.bestEntryCareer?.id, "data-analyst");
    assert.equal(strategy.routeType, "ADJACENT");
    assert.equal(strategy.recommendedWorkLane?.lane, "Engineering");
  });

  it("Fix B: route types strictly adhere to transition graph and never label unlisted roles ADJACENT", () => {
    const seCareer = CAREERS.find((c) => c.id === "software-engineer")!;
    assert.deepEqual(seCareer.entryCandidates, ["qa-engineer"]);
    assert.deepEqual(seCareer.bridgeCandidates, []);

    // Synthetic test: student with target Software Engineer whose top independent entry would be unlisted role
    // Test that AI Automation Specialist is never presented as an adjacent stepping stone to Software Engineer
    for (const fixture of ALL_FIXTURES) {
      if (fixture.name === "empty-answers") continue;
      const strategy = buildEntryStrategy({
        answers: fixture.answers,
        context: fixture.context,
        catalog: CAREERS,
      });

      if (strategy.routeType === "ADJACENT" && strategy.targetCareer && strategy.bestEntryCareer) {
        const targetDef = CAREERS.find((c) => c.id === strategy.targetCareer?.id)!;
        assert.ok(
          targetDef.entryCandidates.includes(strategy.bestEntryCareer.id),
          `Invalid ADJACENT: ${strategy.bestEntryCareer.id} is not in ${targetDef.id}.entryCandidates`,
        );
      }

      if (strategy.routeType === "BRIDGE" && strategy.targetCareer && strategy.bridgeCareer) {
        const targetDef = CAREERS.find((c) => c.id === strategy.targetCareer?.id)!;
        assert.ok(
          targetDef.bridgeCandidates.includes(strategy.bridgeCareer.id),
          `Invalid BRIDGE: ${strategy.bridgeCareer.id} is not in ${targetDef.id}.bridgeCandidates`,
        );
      }
    }
  });

  it("Fix E: direct-entry feasibility responds to available preparation hours", () => {
    // 20h/wk: Software Engineer is realistic direct entry for high-fit CS student
    const strongDirect = buildEntryStrategy({
      answers: technicalBuilderAnswers,
      context: { degree: "B.Tech Computer Science", graduationYear: 2026, availableHoursPerWeek: 20 },
      catalog: CAREERS,
    });
    assert.equal(strongDirect.bestEntryCareer?.id, "software-engineer");
    assert.equal(strongDirect.routeType, "DIRECT");

    // 4h/wk: preparation time is insufficient (400h / 4h = 100 weeks), runway floor triggers, QA Engineer wins
    const constrainedHours = buildEntryStrategy({
      answers: technicalBuilderAnswers,
      context: { degree: "B.Tech Computer Science", graduationYear: 2026, availableHoursPerWeek: 4 },
      catalog: CAREERS,
    });
    assert.equal(constrainedHours.targetCareer?.id, "software-engineer");
    assert.equal(constrainedHours.bestEntryCareer?.id, "qa-engineer");
    assert.equal(constrainedHours.routeType, "ADJACENT");
  });

  it("produces deterministic, distinct 5-role option lists for all audit profiles", () => {
    const profiles = [
      { answers: productProfileAnswers, degree: "BBA", hours: 15 },
      { answers: technicalBuilderAnswers, degree: "B.Tech Computer Science", hours: 20 },
      { answers: analyticalSolverAnswers, degree: "B.Sc Statistics", hours: 15 },
      { answers: aiAutomationAnswers, degree: "BCA", hours: 12 },
      { answers: balancedHybridAnswers, degree: "B.Tech Computer Science", hours: 15 },
    ];

    for (const p of profiles) {
      const s1 = buildEntryStrategy({ answers: p.answers, context: { degree: p.degree, graduationYear: 2026, availableHoursPerWeek: p.hours }, catalog: CAREERS });
      const s2 = buildEntryStrategy({ answers: p.answers, context: { degree: p.degree, graduationYear: 2026, availableHoursPerWeek: p.hours }, catalog: CAREERS });

      assert.ok(s1.longTermOptions);
      assert.ok(s1.entryOptions);
      assert.ok(s2.longTermOptions);
      assert.ok(s2.entryOptions);

      assert.deepEqual(s1.longTermOptions, s2.longTermOptions);
      assert.deepEqual(s1.entryOptions, s2.entryOptions);
      assert.equal(s1.longTermOptions.length, 5);
      assert.equal(s1.entryOptions.length, 5);

      // Verify no duplicates within lists
      const targetIds = s1.longTermOptions.map((o) => o.career.id);
      const entryIds = s1.entryOptions.map((o) => o.career.id);
      assert.equal(new Set(targetIds).size, 5);
      assert.equal(new Set(entryIds).size, 5);
    }
  });
});
