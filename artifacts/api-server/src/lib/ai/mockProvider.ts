/**
 * Deterministic Mock AI Provider for high-volume queue and worker testing.
 *
 * Strictly prohibited in production (throws immediately if NODE_ENV === "production").
 * Requires explicit ALLOW_MOCK_AI="true" or NODE_ENV === "test".
 *
 * Produces valid, schema-compliant JSON reports matching careerReportJsonSchema
 * without consuming real AI tokens or hitting external rate limits.
 */
import type {
  AIReportProvider,
  StructuredReportRequest,
  StructuredReportResult,
} from "./aiProvider";

export interface MockProviderOptions {
  model?: string;
  delayMs?: number;
  failureRate?: number; // 0.0 to 1.0 probability of simulated transient failure
  failOnAttempt?: number; // Specific attempt number to simulate failures on
}

export function createMockReportProvider(options: MockProviderOptions = {}): AIReportProvider {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock AI provider is strictly prohibited in production environments.");
  }
  if (process.env.ALLOW_MOCK_AI !== "true" && process.env.NODE_ENV !== "test") {
    throw new Error(
      "Mock AI provider is disabled. Set ALLOW_MOCK_AI=true in test or staging environments to enable it.",
    );
  }

  const model = options.model ?? "mock-deterministic-v1";
  const delayMs = options.delayMs ?? (process.env.MOCK_AI_DELAY_MS ? parseInt(process.env.MOCK_AI_DELAY_MS, 10) : 20);

  return {
    provider: "mock",
    model,
    async generateStructuredReport(
      request: StructuredReportRequest,
    ): Promise<StructuredReportResult> {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Check simulated failure flags if set
      if (process.env.MOCK_AI_SIMULATE_429 === "true") {
        const err = new Error("Rate limit exceeded (mock 429)");
        (err as any).status = 429;
        throw err;
      }

      if (process.env.MOCK_AI_SIMULATE_503 === "true") {
        const err = new Error("Service unavailable (mock 503)");
        (err as any).status = 503;
        throw err;
      }

      // Parse user JSON to extract deterministic strategy options if present
      let userPayload: Record<string, any> = {};
      try {
        userPayload = JSON.parse(request.userJson);
      } catch {
        // Fallback to empty object
      }

      const entryStrategy = userPayload.entryStrategy ?? {};
      const targetRoleTitle = entryStrategy.targetCareer?.title ?? "Data Analyst";
      const entryRoleTitle = entryStrategy.bestEntryCareer?.title ?? "Junior Data Analyst";

      // Build canonical valid report adhering to careerReportSchema
      const mockReport = {
        profile: {
          archetype: "The Pragmatic Builder",
          workerType: "Operator",
          clarityLevel: "Clear",
          summary: "Demonstrates balanced analytical problem solving with strong practical implementation focus.",
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
          longTermCaliber: targetRoleTitle || "Senior Systems Engineer",
          marketBarrier: "High competitive bar for fresher positions.",
          marketBarrierLevel: "Moderate",
          firstEntryRoles: [entryRoleTitle || "QA / Software Testing Engineer", "Junior Backend Developer"],
          bridgePath: `Enter through ${entryRoleTitle || "QA / Software Testing Engineer"} and migrate into core development.`,
        },
        workArchetype: {
          name: "The Practical Builder",
          definition: "Excels when turning concepts into working, testable systems.",
          strength: "Strong",
          evidence: ["Demonstrated focus on concrete deliverables."],
        },
        careerDirection: {
          target: { title: targetRoleTitle || "Software Engineer", why: "Strong alignment with core technical skills." },
          entry: { title: entryRoleTitle || "QA / Software Testing Engineer", why: "Accessible staging role." },
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

      return {
        content: JSON.stringify(mockReport),
        inputTokens: 1450,
        outputTokens: 2200,
        model,
      };
    },
  };
}
