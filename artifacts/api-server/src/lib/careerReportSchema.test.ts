/**
 * Phase 3 — Report Contract and Section Redesign Schema & Boundary Tests.
 *
 * Run: pnpm --filter @workspace/scripts run test:batch5
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  careerReportSchema,
  legacyCareerReportSchema,
  submissionReportSchema,
  type CareerReport,
} from "./careerReportSchema";
import { mergeDeterministicReport } from "./careerStrategy/careerDirection";
import { CAREERS } from "./careerStrategy/catalog";
import { buildEntryStrategy } from "./careerStrategy/strategy";
import { buildStrategyExplanation } from "./careerStrategy/explanation";
import { normalizeAnswers } from "./careerStrategy/fitProfile";
import { fixtureAnalyticalTechnical, fixtureProductOriented } from "./careerStrategy/fixtures";

function makeValidCanonicalReport(): CareerReport {
  return {
    profile: {
      archetype: "The Pragmatic Builder",
      workerType: "Operator",
      clarityLevel: "Exploratory",
      summary: "A practical, results-driven operator.",
      strengths: ["Systematic execution", "Clear logical problem breakdown"],
      risks: ["May hesitate before ambiguity", "Tends to under-communicate progress"],
      survivalEnvironment: "Structured teams with transparent ownership.",
    },
    traits: {
      technical: { score: 4, reason: "Consistent engineering curiosity.", label: "High" },
      creative: { score: 3, reason: "Applies design thinking when prompted.", label: "Medium" },
      people: { score: 3, reason: "Works well in collaborative settings.", label: "Medium" },
      risk: { score: 2, reason: "Prefers predictable environments.", label: "Low" },
      learning: { score: 4, reason: "Rapidly acquires technical skills.", label: "High" },
    },
    answerPatterns: {
      clear: ["Strong affinity for structured systems."],
      conflicts: [],
      worthExploring: ["Systems architecture"],
    },
    caliberVsEntry: {
      longTermCaliber: "Senior Systems Engineer",
      marketBarrier: "High competitive bar for fresher positions.",
      marketBarrierLevel: "Moderate",
      firstEntryRoles: ["QA / Software Testing Engineer", "Junior Backend Developer"],
      bridgePath: "Enter through automated testing and migrate into core development.",
    },
    workArchetype: {
      name: "The Practical Builder",
      definition: "Excels when turning concepts into working, testable systems.",
      strength: "Strong",
      evidence: ["Demonstrated focus on concrete deliverables."],
    },
    careerDirection: {
      target: { title: "Software Engineer", why: "Strong alignment with core technical skills." },
      entry: { title: "QA / Software Testing Engineer", why: "Accessible staging role." },
      route: "ADJACENT",
      routeWhy: "Provides immediate software engineering exposure with lower entry barriers.",
      barriers: ["Direct entry is competitive."],
      alternativesNote: null,
    },
    longTermOptions: [
      {
        id: "software-engineer",
        title: "Software Engineer",
        category: "Core Software Engineering",
        rank: 1,
        score: 92,
        fitScore: 90,
        rationale: "Exceptional alignment with technical execution preferences.",
      },
      {
        id: "fullstack-developer",
        title: "Full-Stack Developer",
        category: "Web & Application Development",
        rank: 2,
        score: 87,
        fitScore: 85,
        rationale: "Broad surface area across modern web stacks.",
      },
      {
        id: "backend-developer",
        title: "Backend Developer",
        category: "Core Software Engineering",
        rank: 3,
        score: 84,
        fitScore: 82,
        rationale: "High demand for reliable data pipeline and API design.",
      },
      {
        id: "devops-engineer",
        title: "DevOps Engineer",
        category: "Cloud & Infrastructure",
        rank: 4,
        score: 79,
        fitScore: 78,
        rationale: "Focus on build pipelines and operational stability.",
      },
      {
        id: "data-engineer",
        title: "Data Engineer",
        category: "Data & Machine Learning",
        rank: 5,
        score: 75,
        fitScore: 74,
        rationale: "Scalable data ingestion and pipeline maintenance.",
      },
    ],
    entryOptions: [
      {
        id: "qa-engineer",
        title: "QA / Software Testing Engineer",
        category: "Quality Assurance & Testing",
        rank: 1,
        score: 94,
        fitScore: 92,
        accessibility: "HIGH",
        alignment: "STRONG",
        runwayWeeks: 12,
        rationale: "Fast runway and direct adjacency to core development.",
      },
      {
        id: "junior-developer",
        title: "Junior Software Engineer",
        category: "Core Software Engineering",
        rank: 2,
        score: 88,
        fitScore: 86,
        accessibility: "MODERATE",
        alignment: "STRONG",
        runwayWeeks: 18,
        rationale: "Direct entry role into production development.",
      },
      {
        id: "frontend-intern",
        title: "Frontend Developer (Junior / Intern)",
        category: "Web & Application Development",
        rank: 3,
        score: 83,
        fitScore: 82,
        accessibility: "HIGH",
        alignment: "STRONG",
        runwayWeeks: 10,
        rationale: "Immediate visual output and high junior market demand.",
      },
      {
        id: "technical-support",
        title: "IT Support Specialist",
        category: "IT & Support",
        rank: 4,
        score: 78,
        fitScore: 76,
        accessibility: "VERY_HIGH",
        alignment: "MODERATE",
        runwayWeeks: 6,
        rationale: "Readily accessible operational foundation.",
      },
      {
        id: "data-analyst-trainee",
        title: "Junior Data Analyst",
        category: "Data & Machine Learning",
        rank: 5,
        score: 74,
        fitScore: 72,
        accessibility: "MODERATE",
        alignment: "MODERATE",
        runwayWeeks: 14,
        rationale: "Practical entry into data interpretation and querying.",
      },
    ],
    careerComparison: {
      longTerm: [
        {
          id: "software-engineer",
          title: "Software Engineer",
          roleInvolves: "Architecting and implementing modular backend and systems code.",
          whyFit: "Matches demonstrated rigor and structured problem-solving.",
          tradeOff: "Requires continuous self-directed learning and debugging resilience.",
          differentiation: "Core builder focus rather than general product management.",
        },
        {
          id: "fullstack-developer",
          title: "Full-Stack Developer",
          roleInvolves: "Connecting frontend customer interfaces with persistent backend services.",
          whyFit: "Offers immediate tangible product feedback.",
          tradeOff: "Context switching across diverse frontend and backend toolchains.",
          differentiation: "Broader application scope than pure backend engineering.",
        },
        {
          id: "backend-developer",
          title: "Backend Developer",
          roleInvolves: "Optimizing database queries, caching layers, and API performance.",
          whyFit: "Appeals to analytical preferences and systematic design.",
          tradeOff: "Limited direct interaction with end-user interface design.",
          differentiation: "Deep specialization in persistence and system latency.",
        },
      ],
      entryLevel: [
        {
          id: "qa-engineer",
          title: "QA / Software Testing Engineer",
          roleInvolves: "Writing test plans, automating test cases, and verifying edge-case reliability.",
          whyFit: "Directly rewards meticulous attention to detail and analytical thinking.",
          tradeOff: "Focuses on validation rather than greenfield feature building.",
          differentiation: "Most accessible bridge into production software environments.",
        },
        {
          id: "junior-developer",
          title: "Junior Software Engineer",
          roleInvolves: "Implementing isolated feature tickets and fixing reported defects.",
          whyFit: "Hands-on coding experience from week one.",
          tradeOff: "Higher hiring competition and steeper technical interview bars.",
          differentiation: "Direct path without needing an intermediate step.",
        },
        {
          id: "frontend-intern",
          title: "Frontend Developer (Junior / Intern)",
          roleInvolves: "Translating wireframes and UI specs into accessible web components.",
          whyFit: "Fast feedback loop with clear visual deliverables.",
          tradeOff: "Subject to rapid UI framework churn and design revisions.",
          differentiation: "Emphasizes visual aesthetics and browser APIs over data modeling.",
        },
      ],
    },
    recommendedWorkLane: {
      lane: "Engineering",
      why: "Demonstrates consistent aptitude and preference for technical implementation.",
      primaryCareer: { id: "software-engineer", title: "Software Engineer" },
      supportingCareers: [
        { id: "fullstack-developer", title: "Full-Stack Developer" },
        { id: "backend-developer", title: "Backend Developer" },
      ],
      entryRoute: {
        routeType: "ADJACENT",
        entryCareer: { id: "qa-engineer", title: "QA / Software Testing Engineer" },
        bridgeCareer: null,
        rationale: "Adjacent QA pathway reduces hiring friction while maintaining engineering proximity.",
      },
      explanation: "Directly connects the comparative strengths from Sections 4 and 5.",
    },
    recommendedTrack: "Engineering",
    roadmap: [
      {
        order: 1,
        monthRange: "Months 1-2",
        focus: "Foundational Programming & Test Principles",
        actions: ["Complete core TypeScript and test-driven development exercises."],
        measurableOutputs: ["Repository with 20 solved algorithms and unit test suites."],
      },
      {
        order: 2,
        monthRange: "Months 3-4",
        focus: "API Construction & Automated Integration Testing",
        actions: ["Build a RESTful API with automated integration tests."],
        measurableOutputs: ["Deployed API service with >80% automated code coverage."],
      },
      {
        order: 3,
        monthRange: "Months 5-6",
        focus: "Full-Stack Integration & Defect Tracking",
        actions: ["Connect client application with backend service and automated CI pipeline."],
        measurableOutputs: ["Working CI/CD pipeline on GitHub Actions passing all test suites."],
      },
      {
        order: 4,
        monthRange: "Months 7-9",
        focus: "Portfolio Evidence & Open Source Contribution",
        actions: ["Publish polished portfolio showcase and contribute bug fixes to open source projects."],
        measurableOutputs: ["Two merged pull requests in community repositories and live portfolio."],
      },
      {
        order: 5,
        monthRange: "Months 10-12",
        focus: "Interview Preparation & Targeted Job Applications",
        actions: ["Conduct mock technical interviews and apply to target entry roles."],
        measurableOutputs: ["Log of 25 structured applications and 5 completed technical interview loops."],
      },
    ],
    mentorNote: {
      observedPattern: "Consistently prioritizes structured accuracy and functional correctness over speed.",
      realisticRisk: "May over-invest in refining test scenarios before delivering feature milestones.",
      actionableExperiment: "Build and deploy a complete micro-project within a strict 48-hour timebox.",
    },
  };
}

function legacyReport(): Record<string, unknown> {
  const trait = { score: 3, reason: "evidence-based reason", label: "Medium" };
  return {
    profile: {
      archetype: "The Pragmatic Builder",
      workerType: "Operator",
      clarityLevel: "Exploratory",
      summary: "Legacy summary.",
      strengths: ["First strength.", "Second strength."],
      risks: ["First risk.", "Second risk."],
      survivalEnvironment: "Supportive team.",
    },
    traits: {
      technical: trait,
      creative: trait,
      people: trait,
      risk: trait,
      learning: trait,
    },
    answerPatterns: { clear: ["Pattern."], conflicts: [], worthExploring: [] },
    caliberVsEntry: {
      longTermCaliber: "Long-term direction.",
      marketBarrier: "Barrier.",
      marketBarrierLevel: "Low",
      firstEntryRoles: ["First role."],
      bridgePath: "Bridge.",
    },
    careerFits: ["One", "Two", "Three", "Four"].map((title) => ({
      title: `${title} role.`,
      roleType: "Stepping-stone",
      salaryInrLpa: null,
      entryDifficulty: "Easy to enter",
      careerHealth: "Stable",
      aiThreat: "Low",
      naturalFitScore: 7,
      dailyWork: "Daily work.",
      whyFits: "Why.",
      fiveYearGrowth: "Growth.",
    })),
    careersToAvoid: [],
    recommendedTrack: "Engineering",
    trackDetail: {
      why: "Why.",
      fresherDemand: "Demand.",
      skillsToLearn: ["Skill one", "Skill two", "Skill three", "Skill four"],
    },
    roadmap: [
      { months: "1-2", focus: "Foundation.", actions: ["First action."] },
      { months: "3-4", focus: "Project.", actions: ["Second action."] },
      { months: "5-6", focus: "Experience.", actions: ["Third action."] },
      { months: "7-9", focus: "Portfolio.", actions: ["Fourth action."] },
      { months: "10-12", focus: "Applications.", actions: ["Fifth action."] },
    ],
    brutalTruth: "Honest read.",
    skillsGaps: [
      {
        skill: "TypeScript",
        whyItMatters: "Standard for backend engineering.",
        activity: "Build an API.",
        evidenceOfProgress: "Live API endpoint.",
      },
    ],
  };
}

describe("malformed AI report responses fail safely", () => {
  const badInputs: Array<[string, unknown]> = [
    ["null", null],
    ["string", "not json"],
    ["number", 42],
    ["array", []],
    ["empty object", {}],
    ["missing sections", { profile: { archetype: "x" } }],
    ["wrong trait type", { profile: {}, traits: { technical: { score: "high" } } }],
  ];

  for (const [name, input] of badInputs) {
    it(`rejects ${name}`, () => {
      assert.equal(careerReportSchema.safeParse(input).success, false);
    });
  }

  it("rejects out-of-range trait scores", () => {
    const valid = makeValidCanonicalReport();
    assert.equal(
      careerReportSchema.safeParse({
        ...valid,
        traits: {
          ...valid.traits,
          technical: { ...valid.traits.technical, score: 99 },
        },
      }).success,
      false,
    );
  });
});

describe("canonical 8-section report schema validation", () => {
  it("validates a compliant eight-section canonical report", () => {
    const report = makeValidCanonicalReport();
    const parsed = careerReportSchema.safeParse(report);
    assert.equal(parsed.success, true);
  });

  it("requires exactly 5 long-term options and 5 entry-level options", () => {
    const base = makeValidCanonicalReport();

    // 4 long-term options -> invalid
    const shortLongTerm = { ...base, longTermOptions: base.longTermOptions.slice(0, 4) };
    assert.equal(careerReportSchema.safeParse(shortLongTerm).success, false);

    // 6 long-term options -> invalid
    const extraLongTerm = {
      ...base,
      longTermOptions: [
        ...base.longTermOptions,
        {
          id: "extra-role",
          title: "Extra Role",
          category: "Other",
          rank: 6,
          score: 50,
          fitScore: 50,
          rationale: "Extra",
        },
      ],
    };
    assert.equal(careerReportSchema.safeParse(extraLongTerm).success, false);

    // 4 entry options -> invalid
    const shortEntry = { ...base, entryOptions: base.entryOptions.slice(0, 4) };
    assert.equal(careerReportSchema.safeParse(shortEntry).success, false);

    // 6 entry options -> invalid
    const extraEntry = {
      ...base,
      entryOptions: [
        ...base.entryOptions,
        {
          id: "extra-entry",
          title: "Extra Entry",
          category: "Other",
          rank: 6,
          score: 50,
          fitScore: 50,
          accessibility: "HIGH" as const,
          alignment: "STRONG" as const,
          runwayWeeks: 8,
          rationale: "Extra",
        },
      ],
    };
    assert.equal(careerReportSchema.safeParse(extraEntry).success, false);
  });

  it("requires exactly 3 comparison entries in each group", () => {
    const base = makeValidCanonicalReport();

    // 2 comparison items in longTerm -> invalid
    const shortCompLongTerm = {
      ...base,
      careerComparison: {
        ...base.careerComparison,
        longTerm: base.careerComparison.longTerm.slice(0, 2),
      },
    };
    assert.equal(careerReportSchema.safeParse(shortCompLongTerm).success, false);

    // 2 comparison items in entryLevel -> invalid
    const shortCompEntry = {
      ...base,
      careerComparison: {
        ...base.careerComparison,
        entryLevel: base.careerComparison.entryLevel.slice(0, 2),
      },
    };
    assert.equal(careerReportSchema.safeParse(shortCompEntry).success, false);
  });

  it("requires exactly 5 roadmap milestones ordered 1 to 5", () => {
    const base = makeValidCanonicalReport();

    const shortRoadmap = { ...base, roadmap: base.roadmap.slice(0, 4) };
    assert.equal(careerReportSchema.safeParse(shortRoadmap).success, false);
  });

  it("validates mentor note structure with 1 pattern, 1 risk, 1 experiment", () => {
    const base = makeValidCanonicalReport();
    const missingRisk = {
      ...base,
      mentorNote: {
        observedPattern: "Pattern only",
        realisticRisk: null as any,
        actionableExperiment: "Experiment",
      },
    };
    assert.equal(careerReportSchema.safeParse(missingRisk).success, false);
  });

  it("ensures skillsGaps is removed from canonical report contract", () => {
    assert.equal("skillsGaps" in careerReportSchema.shape, false);
  });
});

describe("deterministic merge and validation boundary", () => {
  it("prevents model from overriding career IDs, ranks, work lane, and route", () => {
    const fixture = fixtureProductOriented;
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

    // Model attempts to override roles with fabricated IDs and ranks
    const rogueModelReport = {
      ...makeValidCanonicalReport(),
      longTermOptions: [
        { id: "astronaut", title: "Astronaut", category: "Space", rank: 1, score: 99, fitScore: 99, rationale: "I want to fly." },
        { id: "rockstar", title: "Rockstar", category: "Music", rank: 2, score: 95, fitScore: 95, rationale: "Music is fun." },
      ],
      entryOptions: [
        { id: "coffee-taster", title: "Coffee Taster", category: "Food", rank: 1, score: 99, fitScore: 99, rationale: "Yum." },
      ],
      careerComparison: {
        longTerm: [{ id: "astronaut", title: "Astronaut", roleInvolves: "Space", whyFit: "Stars", tradeOff: "Oxygen", differentiation: "Zero-G" }],
        entryLevel: [{ id: "coffee-taster", title: "Coffee Taster", roleInvolves: "Coffee", whyFit: "Caffeine", tradeOff: "Sleep", differentiation: "Beverage" }],
      },
      recommendedWorkLane: {
        lane: "Design / UI-UX" as const,
        why: "Model decided UI-UX is cooler.",
        primaryCareer: { id: "astronaut", title: "Astronaut" },
        supportingCareers: [],
        entryRoute: {
          routeType: "DIRECT" as const,
          entryCareer: { id: "coffee-taster", title: "Coffee Taster" },
          bridgeCareer: null,
          rationale: "Drink coffee to become astronaut.",
        },
        explanation: "Contradictory explanation.",
      },
    };

    const merged = mergeDeterministicReport(
      rogueModelReport,
      strategy,
      explanation,
      fixture.answers,
      fixture.context,
      CAREERS,
    );

    // 1. Long-term options are exactly top 5 deterministic roles with ranks 1..5
    assert.equal(merged.longTermOptions.length, 5);
    assert.equal(merged.longTermOptions[0].id, strategy.longTermOptions?.[0].career.id);
    assert.equal(merged.longTermOptions[0].rank, 1);
    assert.notEqual(merged.longTermOptions[0].id, "astronaut");
    for (let i = 0; i < 5; i++) {
      assert.equal(merged.longTermOptions[i].rank, i + 1);
    }

    // 2. Entry-level options are exactly top 5 deterministic entry roles
    assert.equal(merged.entryOptions.length, 5);
    assert.equal(merged.entryOptions[0].id, strategy.entryOptions?.[0].career.id);
    assert.equal(merged.entryOptions[0].rank, 1);
    assert.notEqual(merged.entryOptions[0].id, "coffee-taster");

    // 3. Comparison items are exactly 3 longTerm and 3 entryLevel, drawn from Section 4
    assert.equal(merged.careerComparison.longTerm.length, 3);
    assert.equal(merged.careerComparison.entryLevel.length, 3);
    assert.equal(merged.careerComparison.longTerm[0].id, merged.longTermOptions[0].id);
    assert.equal(merged.careerComparison.entryLevel[0].id, merged.entryOptions[0].id);

    // 4. Work lane, primary career, and entry route agree with deterministic strategy output
    assert.equal(merged.recommendedWorkLane.lane, strategy.recommendedWorkLane?.lane);
    assert.equal(merged.recommendedTrack, strategy.recommendedWorkLane?.lane);
    assert.equal(merged.recommendedWorkLane.primaryCareer.id, strategy.targetCareer?.id);
    assert.equal(merged.recommendedWorkLane.entryRoute.entryCareer.id, strategy.bestEntryCareer?.id);
    assert.equal(merged.recommendedWorkLane.entryRoute.routeType, strategy.routeType);

    // 5. Merged report strictly satisfies canonical report schema
    const validation = careerReportSchema.safeParse(merged);
    assert.equal(validation.success, true);
  });
});

describe("historical report compatibility", () => {
  it("rejects legacy report under new canonical careerReportSchema", () => {
    // New schema strictly enforces 8 sections and rejects old structure
    assert.equal(careerReportSchema.safeParse(legacyReport()).success, false);
  });

  it("parses legacy reports successfully under legacyCareerReportSchema", () => {
    const parsed = legacyCareerReportSchema.safeParse(legacyReport());
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.profile.archetype, "The Pragmatic Builder");
      assert.equal(parsed.data.recommendedTrack, "Engineering");
      assert.ok(Array.isArray(parsed.data.careerFits));
    }
  });

  it("parses both legacy and new reports through submissionReportSchema union", () => {
    // Legacy report parses via union option 1
    const legacyResult = submissionReportSchema.safeParse(legacyReport());
    assert.equal(legacyResult.success, true);

    // Canonical new report parses via union option 0
    const canonicalResult = submissionReportSchema.safeParse(makeValidCanonicalReport());
    assert.equal(canonicalResult.success, true);

    // Null is also accepted (pending submission)
    const nullResult = submissionReportSchema.safeParse(null);
    assert.equal(nullResult.success, true);
  });
});

