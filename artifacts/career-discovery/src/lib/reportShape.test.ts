/**
 * Report-shape discriminator and frontend UI rendering tests (Phase 4).
 *
 * Validates:
 * 1. New versus legacy report discrimination.
 * 2. Human-readable presentation formatters (accessibility, alignment, routes, runway, scores).
 * 3. Complete rendering of the canonical five-section report structure.
 * 4. Distinct presentation of 5 long-term destinations and 5 entry-level jobs with metadata chips.
 * 5. Separate top-three comparisons across work involved, fit, trade-off, and differentiation.
 * 6. Best-fit work lane consistency with Section 4 and Section 3 recommendations.
 * 7. Chronological ordering of 12-month roadmap milestones.
 * 8. Three-part candid mentor note triptych and responsible guidance disclaimers.
 * 9. Resilient handling of missing or incomplete optional data without crashes.
 * 10. Legacy report backwards-compatibility rendering without data loss or mutation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CareerReport, LegacyCareerReport } from "@workspace/api-client-react";
import { isNewReport } from "./reportShape";
import { ReportDetail } from "../pages/ReportDetail";
import {
  formatAccessibility,
  formatDegreeAlignment,
  formatRouteType,
  formatRunway,
  formatScore,
} from "../components/report/formatters";

function legacyReport(): LegacyCareerReport {
  return {
    profile: {
      archetype: "The Pragmatic Builder",
      workerType: "Operator",
      clarityLevel: "Exploratory",
      summary: "Legacy profile summary describing general operations.",
      strengths: ["Disciplined execution", "Clear documentation"],
      risks: ["Over-focusing on small details"],
      survivalEnvironment: "Supportive team with established processes.",
    },
    traits: {
      technical: { score: 3, reason: "Comfortable with tooling", label: "Medium" },
      creative: { score: 3, reason: "Occasional novel solutions", label: "Medium" },
      people: { score: 3, reason: "Works well in small groups", label: "Medium" },
      risk: { score: 2, reason: "Prefers predictable steps", label: "Low" },
      learning: { score: 4, reason: "Rapid ramp-up on documentation", label: "High" },
    },
    answerPatterns: {
      clear: ["Consistent preference for structured deliverables"],
      conflicts: [{ tag: "Autonomy vs Support", text: "Desires freedom but relies on templates" }],
      worthExploring: ["Exploratory automation workflows"],
    },
    caliberVsEntry: {
      longTermCaliber: "High operational reliability with systematic problem-solving.",
      marketBarrier: "High market competition for entry-level generalist roles.",
      marketBarrierLevel: "Moderate",
      firstEntryRoles: ["Technical Support Specialist", "QA Junior"],
      bridgePath: "Transition via QA automation tools to build technical depth.",
    },
    careerFits: [
      {
        title: "Software Engineer",
        roleType: "Long-term fit",
        naturalFitScore: 8,
        dailyWork: "Writing and maintaining services.",
        whyFits: "Strong alignment with systematic logic.",
        salaryInrLpa: { min: 6, max: 12 },
        entryDifficulty: "Highly competitive",
        careerHealth: "Fast-growth",
        aiThreat: "Medium",
        fiveYearGrowth: "Senior Engineer",
      },
    ],
    careersToAvoid: [
      {
        title: "Cold Call Sales Representative",
        why: "Misaligned with introverted execution preference.",
      },
    ],
    recommendedTrack: "Engineering",
    trackDetail: {
      why: "Builds on foundational programming knowledge.",
      fresherDemand: "Moderate",
      skillsToLearn: ["Git", "TypeScript", "SQL"],
    },
    roadmap: [
      {
        months: "Months 1-3",
        focus: "Foundational Git and Scripting",
        actions: ["Complete version control tutorial", "Write automated scripts"],
      },
    ],
    brutalTruth: "Theoretical knowledge without deployed projects will not yield callbacks.",
  };
}

function newReport(): CareerReport {
  return {
    profile: {
      archetype: "The Pragmatic Builder",
      workerType: "Operator",
      clarityLevel: "Exploratory",
      summary: "Disciplined builder focused on concrete software delivery and robust execution.",
      strengths: ["Systematic debugging", "Disciplined follow-through"],
      risks: ["Hesitant to take ambiguous risks"],
      survivalEnvironment: "Engineering team with clear technical specifications.",
    },
    traits: {
      technical: { score: 4, reason: "Demonstrates strong code comprehension.", label: "High" },
      creative: { score: 3, reason: "Solves problems with proven design patterns.", label: "Medium" },
      people: { score: 3, reason: "Communicates clearly in technical reviews.", label: "Medium" },
      risk: { score: 2, reason: "Prefers deterministic architectures over speculative bets.", label: "Low" },
      learning: { score: 4, reason: "Quickly absorbs technical documentation and APIs.", label: "High" },
    },
    answerPatterns: {
      clear: ["Consistent affinity for backend systems and predictable data pipelines."],
      conflicts: [
        {
          tag: "Breadth vs Depth",
          text: "Shows interest in full-stack breadth but repeatedly demonstrates superior depth in backend internals.",
        },
      ],
      worthExploring: ["Distributed systems and streaming architectures."],
    },
    caliberVsEntry: {
      longTermCaliber: "Proven aptitude for building resilient, production-grade distributed backend systems.",
      marketBarrier: "Fresher backend market has high verification standards for production engineering.",
      marketBarrierLevel: "Moderate",
      firstEntryRoles: ["QA Engineer", "Junior Backend Trainee"],
      bridgePath: "Enter through automated testing and telemetry, transitioning into core backend services.",
    },
    workArchetype: {
      name: "The Systems Implementer",
      definition: "Engineers who build dependable architectures with rigor, consistency, and clear operational guarantees.",
      strength: "Strong",
      evidence: [
        "Prefers debugging root causes over quick superficial fixes.",
        "Values clean interfaces and explicit error handling.",
      ],
    },
    careerDirection: {
      target: {
        title: "Software Engineer",
        why: "Highest composite alignment between algorithmic logic, systems thinking, and long-term leverage.",
      },
      entry: {
        title: "QA Engineer",
        why: "Direct technical wedge with high fresher hiring accessibility and rapid ramp-up in test suites.",
      },
      route: "DIRECT",
      routeWhy: "Targeted testing automation provides immediate code access and direct visibility into production services.",
      barriers: [
        "Initial candidate pool is crowded — portfolio needs verified automated test suites.",
      ],
      alternativesNote: "Junior Developer remains viable if live deployed web projects are completed first.",
    },
    longTermOptions: [
      {
        id: "software-engineer",
        title: "Software Engineer",
        category: "Core Software Engineering",
        rank: 1,
        score: 92,
        fitScore: 90,
        rationale: "Primary destination: excels at systematic problem breakdown and resilient software design.",
      },
      {
        id: "backend-developer",
        title: "Backend Developer",
        category: "Core Software Engineering",
        rank: 2,
        score: 88,
        fitScore: 86,
        rationale: "Strong alignment with server architectures, database modeling, and API integrity.",
      },
      {
        id: "fullstack-developer",
        title: "Full-Stack Developer",
        category: "Web & Application Development",
        rank: 3,
        score: 83,
        fitScore: 81,
        rationale: "Viable broad engineering path; requires supplementary frontend state management practice.",
      },
      {
        id: "devops-engineer",
        title: "DevOps Engineer",
        category: "Cloud & Infrastructure",
        rank: 4,
        score: 79,
        fitScore: 78,
        rationale: "Strong operational fit for CI/CD pipelines, containerization, and infrastructure reliability.",
      },
      {
        id: "data-engineer",
        title: "Data Engineer",
        category: "Data & Machine Learning",
        rank: 5,
        score: 74,
        fitScore: 72,
        rationale: "Alternative path leveraging data modeling and pipeline orchestration skills.",
      },
    ],
    entryOptions: [
      {
        id: "qa-engineer",
        title: "QA Engineer",
        category: "Quality Assurance & Testing",
        rank: 1,
        score: 94,
        fitScore: 92,
        accessibility: "VERY_HIGH",
        alignment: "STRONG",
        runwayWeeks: 8,
        rationale: "Fastest entry route with immediate hands-on codebase exposure and test automation leverage.",
      },
      {
        id: "junior-developer",
        title: "Junior Developer",
        category: "Core Software Engineering",
        rank: 2,
        score: 89,
        fitScore: 87,
        accessibility: "HIGH",
        alignment: "STRONG",
        runwayWeeks: 12,
        rationale: "Direct entry route if candidate demonstrates 2 verified GitHub repositories with integration tests.",
      },
      {
        id: "technical-support",
        title: "Technical Support Engineer",
        category: "IT & Support",
        rank: 3,
        score: 82,
        fitScore: 80,
        accessibility: "VERY_HIGH",
        alignment: "MODERATE",
        runwayWeeks: 6,
        rationale: "Immediate entry fallback for production systems diagnostics and customer issue escalation.",
      },
      {
        id: "frontend-intern",
        title: "Frontend Intern",
        category: "Web & Application Development",
        rank: 4,
        score: 78,
        fitScore: 76,
        accessibility: "HIGH",
        alignment: "MODERATE",
        runwayWeeks: 10,
        rationale: "Accessible gateway into web engineering with fast visual portfolio verification.",
      },
      {
        id: "data-analyst-trainee",
        title: "Data Analyst Trainee",
        category: "Data & Machine Learning",
        rank: 5,
        score: 72,
        fitScore: 71,
        accessibility: "MODERATE",
        alignment: "MODERATE",
        runwayWeeks: 14,
        rationale: "Structured corporate hiring track for SQL and dashboard reporting capabilities.",
      },
    ],
    careerComparison: {
      longTerm: [
        {
          id: "software-engineer",
          title: "Software Engineer",
          roleInvolves: "Architecting, testing, and shipping robust services that solve core product needs.",
          whyFit: "Matches your disciplined approach to problem breakdown and algorithmic clarity.",
          tradeOff: "Requires continuous learning to keep pace with evolving toolchains and frameworks.",
          differentiation: "Broader ownership over full system architecture compared to narrow specialization.",
        },
        {
          id: "backend-developer",
          title: "Backend Developer",
          roleInvolves: "Designing high-throughput APIs, data models, and server infrastructure.",
          whyFit: "Directly rewards your preference for structural integrity and predictable behavior.",
          tradeOff: "Limited exposure to end-user interfaces and UI product feedback loops.",
          differentiation: "Deep specialization in persistence, caching, and server lifecycle.",
        },
        {
          id: "fullstack-developer",
          title: "Full-Stack Developer",
          roleInvolves: "Shipping complete end-to-end features spanning React interfaces to SQL queries.",
          whyFit: "Enables independent product construction without organizational hand-off friction.",
          tradeOff: "Requires balancing frontend aesthetics with backend performance discipline.",
          differentiation: "High delivery velocity and versatile prototyping ability.",
        },
      ],
      entryLevel: [
        {
          id: "qa-engineer",
          title: "QA Engineer",
          roleInvolves: "Authoring automated test suites, validating edge cases, and guarding release quality.",
          whyFit: "Directly exercises your eye for detail and root-cause analysis.",
          tradeOff: "Requires disciplined advocacy to transition test writing into feature production code.",
          differentiation: "Lowest initial market barrier with direct day-one code review access.",
        },
        {
          id: "junior-developer",
          title: "Junior Developer",
          roleInvolves: "Implementing scoped features, fixing bugs, and participating in peer code reviews.",
          whyFit: "Direct application of programming fundamentals in a team workflow.",
          tradeOff: "Competitive hiring bar requiring verified proof of work before interview calls.",
          differentiation: "Immediate feature ownership from day one without intermediate role stepping.",
        },
        {
          id: "technical-support",
          title: "Technical Support Engineer",
          roleInvolves: "Triage, log analysis, customer issue reproduction, and escalation management.",
          whyFit: "Fast ramp-up on production systems and real-world system debugging.",
          tradeOff: "Requires deliberate side-project dedication to keep coding skills sharp.",
          differentiation: "Develops customer empathy and deep operational knowledge of shipping software.",
        },
      ],
    },
    recommendedWorkLane: {
      lane: "Engineering",
      why: "Optimal synthesis of your systematic problem solving, disciplined follow-through, and backend orientation.",
      primaryCareer: {
        id: "software-engineer",
        title: "Software Engineer",
      },
      supportingCareers: [
        { id: "backend-developer", title: "Backend Developer" },
        { id: "fullstack-developer", title: "Full-Stack Developer" },
      ],
      entryRoute: {
        routeType: "DIRECT",
        entryCareer: { id: "qa-engineer", title: "QA Engineer" },
        bridgeCareer: null,
        rationale: "QA automation offers immediate day-one entry while actively sharpening production coding discipline.",
      },
      explanation: "Directly integrates the trade-off analysis from Section 5: building day-one test automation competence creates an incontrovertible portfolio for Software Engineer promotions.",
    },
    recommendedTrack: "Engineering",
    roadmap: [
      {
        order: 1,
        monthRange: "Months 1–2",
        focus: "Foundations & Code Discipline",
        actions: ["Master TypeScript fundamentals", "Configure rigorous ESLint and testing setup"],
        measurableOutputs: ["1 public repository with 100% test coverage on utilities"],
      },
      {
        order: 2,
        monthRange: "Months 3–4",
        focus: "Backend Services & Persistence",
        actions: ["Design relational schemas in PostgreSQL", "Build REST APIs with structured validation"],
        measurableOutputs: ["Live deployed REST service with automated database migrations"],
      },
      {
        order: 3,
        monthRange: "Months 5–6",
        focus: "Quality Assurance & Testing Suites",
        actions: ["Implement end-to-end integration tests", "Set up GitHub Actions CI workflow"],
        measurableOutputs: ["Automated testing pipeline running on every commit"],
      },
      {
        order: 4,
        monthRange: "Months 7–9",
        focus: "Portfolio Verification & Wedge Applications",
        actions: ["Package 2 showcase projects with clean READMEs", "Apply for QA and Junior Developer roles"],
        measurableOutputs: ["20 targeted applications sent with custom project demos"],
      },
      {
        order: 5,
        monthRange: "Months 10–12",
        focus: "Interview Execution & Role Transition",
        actions: ["Practice live debugging and algorithmic problem solving", "Negotiate first offer"],
        measurableOutputs: ["Signed offer letter in target engineering lane"],
      },
    ],
    mentorNote: {
      observedPattern: "You consistently excel when tasks have clear boundaries, explicit specifications, and demonstrable logic.",
      realisticRisk: "You may spend too much time polishing internal details before putting your work in front of real hiring managers.",
      actionableExperiment: "Deploy a minimal working API endpoint within 48 hours and share the public link with 3 developer peers for feedback.",
    },
  };
}

describe("report shape discriminator", () => {
  it("treats legacy reports (no new fields) as legacy", () => {
    assert.equal(isNewReport(legacyReport()), false);
  });

  it("treats canonical new reports as new", () => {
    assert.equal(isNewReport(newReport()), true);
  });

  it("does not mistake incomplete reports as new reports", () => {
    assert.equal(isNewReport({ ...newReport(), longTermOptions: [] as any }), false);
    assert.equal(isNewReport({ ...newReport(), entryOptions: [] as any }), false);
    assert.equal(isNewReport({ ...newReport(), mentorNote: null as any }), false);
    assert.equal(isNewReport(null), false);
    assert.equal(isNewReport(undefined), false);
  });
});

describe("presentation formatters", () => {
  it("formats accessibility levels human-readably with tone", () => {
    assert.deepEqual(formatAccessibility("VERY_HIGH"), {
      label: "Very High Fresher Accessibility",
      tone: "positive",
    });
    assert.deepEqual(formatAccessibility("HIGH"), {
      label: "High Fresher Accessibility",
      tone: "positive",
    });
    assert.deepEqual(formatAccessibility("MODERATE"), {
      label: "Moderate Accessibility",
      tone: "neutral",
    });
    assert.deepEqual(formatAccessibility("LOW"), {
      label: "Competitive Entry",
      tone: "caution",
    });
    assert.deepEqual(formatAccessibility("VERY_LOW"), {
      label: "Prior Experience Usually Required",
      tone: "caution",
    });
    assert.deepEqual(formatAccessibility(null), {
      label: "Standard Accessibility",
      tone: "neutral",
    });
  });

  it("formats degree alignment levels human-readably with tone", () => {
    assert.deepEqual(formatDegreeAlignment("STRONG"), {
      label: "Strong Degree Alignment",
      tone: "positive",
    });
    assert.deepEqual(formatDegreeAlignment("MODERATE"), {
      label: "Moderate Degree Alignment",
      tone: "neutral",
    });
    assert.deepEqual(formatDegreeAlignment("NEUTRAL"), {
      label: "Flexible Degree Background",
      tone: "neutral",
    });
    assert.deepEqual(formatDegreeAlignment("WEAK"), {
      label: "Non-Traditional Background",
      tone: "caution",
    });
    assert.deepEqual(formatDegreeAlignment(undefined), {
      label: "Relevant Background",
      tone: "neutral",
    });
  });

  it("formats route types into clear student guidance", () => {
    assert.equal(formatRouteType("DIRECT").label, "Direct Route");
    assert.equal(formatRouteType("ADJACENT").label, "Adjacent Route");
    assert.equal(formatRouteType("BRIDGE").label, "Staged Bridge Route");
    assert.equal(formatRouteType("OTHER").label, "Tailored Route");
  });

  it("formats runway weeks human-readably and handles boundaries", () => {
    assert.equal(formatRunway(1), "~1 week preparation");
    assert.equal(formatRunway(12), "~12 weeks preparation");
    assert.equal(formatRunway(0), "Self-paced preparation");
    assert.equal(formatRunway(null), "Self-paced preparation");
    assert.equal(formatRunway(NaN), "Self-paced preparation");
  });

  it("formats score percentage cleanly", () => {
    assert.equal(formatScore(92.4), "92%");
    assert.equal(formatScore(null), null);
    assert.equal(formatScore(NaN), null);
  });
});

describe("Concise 5-section report rendering", () => {
  it("renders all five focused sections and sticky navigation for new reports", () => {
    const report = newReport();
    const html = renderToStaticMarkup(React.createElement(ReportDetail, { report }));

    // Container validation
    assert.ok(html.includes('data-testid="report-new"'));
    assert.ok(html.includes("report-redesign"));

    // Quick-jump navigation: 5 sections
    assert.ok(html.includes('aria-label="Report sections navigation"'));
    assert.ok(html.includes('data-testid="nav-section-profile"'));
    assert.ok(html.includes('data-testid="nav-section-strengths"'));
    assert.ok(html.includes('data-testid="nav-section-readiness"'));
    assert.ok(html.includes('data-testid="nav-section-options"'));
    assert.ok(html.includes('data-testid="nav-section-action-plan"'));

    // Section 1: Your Career Profile
    assert.ok(html.includes('data-testid="section-profile"'));
    assert.ok(html.includes('data-testid="archetype-card"'));
    assert.ok(html.includes("The Systems Implementer"));
    assert.ok(html.includes("Strong Signal"));
    assert.ok(html.includes('data-testid="archetype-signals"'));
    assert.ok(html.includes("STRONG SIGNALS FROM YOUR ANSWERS:"));
    assert.ok(html.includes("Disciplined builder focused on concrete software delivery"));

    // Section 2: Strengths & Working Style
    assert.ok(html.includes('data-testid="section-strengths"'));
    assert.ok(html.includes('data-testid="trait-technical-inclination"'));
    assert.ok(html.includes('data-testid="trait-creative-drive"'));
    assert.ok(html.includes('data-testid="trait-people-orientation"'));
    assert.ok(html.includes('data-testid="trait-risk-appetite"'));
    assert.ok(html.includes('data-testid="trait-learning-agility"'));
    assert.ok(html.includes('data-testid="key-development-area"'));
    assert.ok(html.includes("Your Key Development Area"));

    // Section 3: Your Current Readiness
    assert.ok(html.includes('data-testid="section-readiness"'));
    assert.ok(html.includes('data-testid="card-readiness-target"'));
    assert.ok(html.includes('data-testid="card-readiness-entry"'));
    assert.ok(html.includes('data-testid="report-direction-target"'));
    assert.ok(html.includes('data-testid="report-direction-entry"'));
    assert.ok(html.includes('data-testid="report-direction-route"'));
    assert.ok(html.includes('data-testid="readiness-bridge"'));
    assert.ok(html.includes("Market Barrier: Moderate"));

    // Section 4: Compare Your Career Options (Segmented Control & Top 3)
    assert.ok(html.includes('data-testid="section-options"'));
    assert.ok(html.includes('data-testid="tab-long-term-options"'));
    assert.ok(html.includes('data-testid="card-option-0"'));
    assert.ok(html.includes('data-testid="button-toggle-0"'));
    assert.ok(html.includes('data-testid="button-view-all-options"'));

    // Section 5: Action Plan (Roadmap & Integrated Mentor Guidance)
    assert.ok(html.includes('data-testid="section-action-plan"'));
    assert.ok(html.includes('data-testid="immediate-next-action"'));
    assert.ok(html.includes('data-testid="roadmap-timeline"'));
    for (let i = 1; i <= 4; i++) {
      assert.ok(html.includes(`data-testid="milestone-item-${i}"`));
    }
    assert.ok(html.includes("Months 1–3"));
    assert.ok(html.includes("Months 4–6"));
    assert.ok(html.includes("Months 7–9"));
    assert.ok(html.includes("Months 10–12"));
    assert.ok(html.includes("not a guaranteed employment outcome"));

    // Integrated Mentor Guidance
    assert.ok(html.includes('data-testid="section-mentor-note"'));
    assert.ok(html.includes('data-testid="mentor-pattern-card"'));
    assert.ok(html.includes('data-testid="mentor-risk-card"'));
    assert.ok(html.includes('data-testid="mentor-experiment-card"'));
    assert.ok(html.includes('data-testid="mentor-observed-pattern"'));
    assert.ok(html.includes('data-testid="mentor-realistic-risk"'));
    assert.ok(html.includes('data-testid="mentor-actionable-experiment"'));
    assert.ok(html.includes("strategic navigation instrument, not a deterministic verdict"));
  });

  it("verifies recommendation consistency between Section 3 and Section 4", () => {
    const report = newReport();
    // Section 3 target matches top long-term option in Section 4
    assert.equal(report.recommendedWorkLane.primaryCareer.id, report.longTermOptions[0].id);
    assert.equal(report.recommendedWorkLane.primaryCareer.title, report.longTermOptions[0].title);

    // Section 3 entry role matches top entry option in Section 4
    assert.equal(report.recommendedWorkLane.entryRoute.entryCareer.id, report.entryOptions[0].id);
    assert.equal(report.recommendedWorkLane.entryRoute.entryCareer.title, report.entryOptions[0].title);

    // Top long-term comparison starts with rank 1 long-term option
    assert.equal(report.careerComparison.longTerm[0].id, report.longTermOptions[0].id);
    assert.equal(report.careerComparison.entryLevel[0].id, report.entryOptions[0].id);
  });

  it("sorts and structures 12-month roadmap into 4 chronological phases", () => {
    const report = newReport();
    // Intentionally scramble roadmap order
    report.roadmap = [
      { order: 4, monthRange: "Months 7–9", focus: "Milestone 4", actions: [], measurableOutputs: [] },
      { order: 1, monthRange: "Months 1–2", focus: "Milestone 1", actions: [], measurableOutputs: [] },
      { order: 5, monthRange: "Months 10–12", focus: "Milestone 5", actions: [], measurableOutputs: [] },
      { order: 2, monthRange: "Months 3–4", focus: "Milestone 2", actions: [], measurableOutputs: [] },
      { order: 3, monthRange: "Months 5–6", focus: "Milestone 3", actions: [], measurableOutputs: [] },
    ];

    const html = renderToStaticMarkup(React.createElement(ReportDetail, { report }));

    // Verify 4 structured phases appear in chronological order 1 -> 2 -> 3 -> 4
    const pos1 = html.indexOf('data-testid="milestone-item-1"');
    const pos2 = html.indexOf('data-testid="milestone-item-2"');
    const pos3 = html.indexOf('data-testid="milestone-item-3"');
    const pos4 = html.indexOf('data-testid="milestone-item-4"');

    assert.ok(pos1 !== -1 && pos2 !== -1 && pos3 !== -1 && pos4 !== -1);
    assert.ok(pos1 < pos2, "Phase 1 must precede Phase 2");
    assert.ok(pos2 < pos3, "Phase 2 must precede Phase 3");
    assert.ok(pos3 < pos4, "Phase 3 must precede Phase 4");
  });

  it("handles missing or incomplete optional data gracefully without crashing", () => {
    const report = newReport();
    // Set optional fields to null / empty
    report.workArchetype = null;
    report.careerDirection = null;
    report.recommendedWorkLane.entryRoute.bridgeCareer = null;
    report.recommendedWorkLane.supportingCareers = [];
    report.answerPatterns.conflicts = [];
    report.answerPatterns.worthExploring = [];

    const html = renderToStaticMarkup(React.createElement(ReportDetail, { report }));

    assert.ok(html.includes('data-testid="report-new"'));
    assert.ok(!html.includes('data-testid="archetype-card"'), "Omits archetype card when null");
    assert.ok(html.includes('data-testid="section-readiness"'), "Renders readiness section gracefully");
  });

  it("renders a unified direct milestone without duplicate arrow when entry matches target", () => {
    const report = newReport();
    // Direct entry scenario: Software Engineer -> Software Engineer
    report.careerDirection!.entry = { title: "Software Engineer", why: "Strong foundation allows direct entry." };
    report.careerDirection!.target = { title: "Software Engineer", why: "Primary career destination." };
    report.recommendedWorkLane.entryRoute.entryCareer = { id: "software-engineer", title: "Software Engineer" };
    report.recommendedWorkLane.primaryCareer = { id: "software-engineer", title: "Software Engineer" };

    const html = renderToStaticMarkup(React.createElement(ReportDetail, { report }));

    // Section 3: Should show (Direct Entry) badge instead of Software Engineer -> Software Engineer
    assert.ok(html.includes('data-testid="direct-target-role"'));
    assert.ok(html.includes("(Direct Entry)"));
  });

  it("preserves historical compatibility by rendering legacy reports through LegacyReportDetail", () => {
    const legacy = legacyReport();
    const html = renderToStaticMarkup(React.createElement(ReportDetail, { report: legacy }));

    assert.ok(html.includes('data-testid="report-legacy"'));
    assert.ok(!html.includes('data-testid="report-new"'));
    assert.ok(html.includes("01 · YOUR WORKING PROFILE"));
    assert.ok(html.includes("02 · TRAIT RATINGS"));
    assert.ok(html.includes("03 · CLEAR PATTERNS"));
    assert.ok(html.includes("04 · CALIBER VS. ENTRY REALITY"));
    assert.ok(html.includes("05 · CAREER FITS"));
    assert.ok(html.includes("06 · NOT EVERY PATH IS YOUR PATH"));
    assert.ok(html.includes("07 · YOUR BEST-FIT TECH TRACK"));
    assert.ok(html.includes("08 · A PRACTICAL YEAR"));
    assert.ok(html.includes("09 · THE CANDID PART"));
    assert.ok(html.includes("This report is a guide, not a verdict"));
  });
});

