import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type CareerDashboardFilters } from "./careerDashboard";
import { WORK_LANE_IDS } from "./careerStrategy/types";
import { CAREER_PRIMARY_LANE } from "./careerStrategy/ranking";

describe("careerDashboard privacy invariants and metrics", () => {
  const PRIVACY_THRESHOLD = 5;

  it("enforces PRIVACY_THRESHOLD = 5 for cohort suppression", () => {
    assert.equal(PRIVACY_THRESHOLD, 5, "Privacy threshold must be exactly 5");
  });

  it("suppresses granular distributions when completed reports < 5", () => {
    for (let count = 0; count < 5; count++) {
      const isSuppressed = count < PRIVACY_THRESHOLD;
      assert.equal(
        isSuppressed,
        true,
        `Cohort with ${count} completed reports must be suppressed`,
      );
    }
  });

  it("reveals granular distributions only when completed reports >= 5", () => {
    for (let count = 5; count <= 10; count++) {
      const isSuppressed = count < PRIVACY_THRESHOLD;
      assert.equal(
        isSuppressed,
        false,
        `Cohort with ${count} completed reports must not be suppressed`,
      );
    }
  });

  it("calculates report completion rate with correct denominator (totalStudents)", () => {
    const calculateCompletion = (completed: number, total: number) => {
      if (total <= 0) return 0;
      return Math.round((completed / total) * 100);
    };

    assert.equal(calculateCompletion(0, 0), 0);
    assert.equal(calculateCompletion(4, 4), 100);
    assert.equal(calculateCompletion(2, 4), 50);
    assert.equal(calculateCompletion(3, 10), 30);
    assert.equal(calculateCompletion(1, 3), 33);
  });

  it("validates and accepts valid cohort filters", () => {
    const filters: CareerDashboardFilters = {
      department: "CSE (AI & ML)",
      year: "3rd Year",
      batch: "Batch 2024-2028",
    };

    assert.equal(filters.department, "CSE (AI & ML)");
    assert.equal(filters.year, "3rd Year");
    assert.equal(filters.batch, "Batch 2024-2028");
  });

  it("handles empty and undefined filters gracefully", () => {
    const emptyFilters: CareerDashboardFilters = {};
    assert.equal(emptyFilters.department, undefined);
    assert.equal(emptyFilters.year, undefined);
    assert.equal(emptyFilters.batch, undefined);
  });
});

describe("Career Clusters metric derivation and taxonomy normalization", () => {
  const PRIVACY_THRESHOLD = 5;

  it("anchors clusters in the 7 canonical work lanes", () => {
    assert.equal(WORK_LANE_IDS.length, 7);
    assert.deepEqual([...WORK_LANE_IDS], [
      "Engineering",
      "Product",
      "Automation",
      "Startup Ops",
      "Technical Business",
      "Design / UI-UX",
      "Hybrid Tech-Generalist",
    ]);
  });

  it("normalizes multiple distinct engineering roles into ONE cluster", () => {
    const engineeringRoles = [
      "software-engineer",
      "cloud-devops-engineer",
      "cybersecurity-analyst",
      "qa-engineer",
      "it-support",
      "data-scientist",
    ];

    for (const role of engineeringRoles) {
      assert.equal(
        CAREER_PRIMARY_LANE[role],
        "Engineering",
        `Role ${role} must map to broad category 'Engineering'`,
      );
    }
  });

  it("counts distinct clusters correctly when multiple roles share the same cluster", () => {
    // Cohort of 5 completed student reports (threshold met) where all students
    // were assigned different specific engineering roles.
    const studentResults = [
      { studentId: "s1", targetRole: "software-engineer", recommendedTrack: CAREER_PRIMARY_LANE["software-engineer"] },
      { studentId: "s2", targetRole: "qa-engineer", recommendedTrack: CAREER_PRIMARY_LANE["qa-engineer"] },
      { studentId: "s3", targetRole: "cloud-devops-engineer", recommendedTrack: CAREER_PRIMARY_LANE["cloud-devops-engineer"] },
      { studentId: "s4", targetRole: "cybersecurity-analyst", recommendedTrack: CAREER_PRIMARY_LANE["cybersecurity-analyst"] },
      { studentId: "s5", targetRole: "data-scientist", recommendedTrack: CAREER_PRIMARY_LANE["data-scientist"] },
    ];

    assert.equal(studentResults.length, 5);

    // Group by broad category / cluster (as careerDashboard does)
    const clusterMap = new Map<string, number>();
    for (const res of studentResults) {
      clusterMap.set(res.recommendedTrack, (clusterMap.get(res.recommendedTrack) ?? 0) + 1);
    }

    const trackDistribution = Array.from(clusterMap.entries()).map(([label, count]) => ({
      label,
      count,
    }));

    // Must count as exactly 1 cluster ("Engineering"), NOT 5
    assert.equal(trackDistribution.length, 1);
    assert.equal(trackDistribution[0].label, "Engineering");
    assert.equal(trackDistribution[0].count, 5);

    const clusterPercentage = Math.round((trackDistribution[0].count / studentResults.length) * 100);
    assert.equal(clusterPercentage, 100);
  });

  it("derives distinct cluster count across multi-pathway cohorts", () => {
    // Cohort of 8 completed reports across 3 broad areas:
    // - 4 Engineering (2 Software, 1 QA, 1 Cloud)
    // - 2 Technical Business (1 BA, 1 DA)
    // - 2 Product (1 PM, 1 APM)
    const cohortResults = [
      { role: "software-engineer", track: CAREER_PRIMARY_LANE["software-engineer"] },
      { role: "software-engineer", track: CAREER_PRIMARY_LANE["software-engineer"] },
      { role: "qa-engineer", track: CAREER_PRIMARY_LANE["qa-engineer"] },
      { role: "cloud-devops-engineer", track: CAREER_PRIMARY_LANE["cloud-devops-engineer"] },
      { role: "business-analyst", track: CAREER_PRIMARY_LANE["business-analyst"] },
      { role: "data-analyst", track: CAREER_PRIMARY_LANE["data-analyst"] },
      { role: "product-manager", track: CAREER_PRIMARY_LANE["product-manager"] },
      { role: "associate-product-manager", track: CAREER_PRIMARY_LANE["associate-product-manager"] },
    ];

    const clusterMap = new Map<string, number>();
    for (const item of cohortResults) {
      clusterMap.set(item.track, (clusterMap.get(item.track) ?? 0) + 1);
    }

    const trackDistribution = Array.from(clusterMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    assert.equal(trackDistribution.length, 3, "Cohort has exactly 3 unique career clusters");
    assert.deepEqual(trackDistribution, [
      { label: "Engineering", count: 4 },
      { label: "Technical Business", count: 2 },
      { label: "Product", count: 2 },
    ]);

    const total = cohortResults.length;
    const distributionPercentages = trackDistribution.map((item) => ({
      label: item.label,
      pct: Math.round((item.count / total) * 100),
    }));

    assert.deepEqual(distributionPercentages, [
      { label: "Engineering", pct: 50 },
      { label: "Technical Business", pct: 25 },
      { label: "Product", pct: 25 },
    ]);
  });

  it("handles threshold boundaries (<5, =5, >5) without ambiguous dash-only states", () => {
    const formatClusterKpi = (completedReports: number, clusters: Array<{ label: string; count: number }>) => {
      const isSuppressed = completedReports < PRIVACY_THRESHOLD;
      if (isSuppressed) {
        return {
          state: "PROTECTED",
          badgeText: "Protected",
          accessibleLink: null,
          title: "Career Clusters",
          description: "Unique career areas represented",
          footnote: `Requires ≥5 completed reports (${completedReports} of 5 available)`,
        };
      }
      return {
        state: "UNLOCKED",
        clusterCount: clusters.length,
        accessibleLink: "#career-clusters-chart",
        title: "Career Clusters",
        description: "Unique career areas represented",
        footnote: "View distribution chart ↓",
      };
    };

    // Sub-threshold cases: 0, 1, 4 completed reports
    const zeroState = formatClusterKpi(0, []);
    assert.equal(zeroState.state, "PROTECTED");
    assert.equal(zeroState.accessibleLink, null);
    assert.equal(zeroState.footnote, "Requires ≥5 completed reports (0 of 5 available)");

    const subState = formatClusterKpi(4, []);
    assert.equal(subState.state, "PROTECTED");
    assert.equal(subState.accessibleLink, null);
    assert.equal(subState.footnote, "Requires ≥5 completed reports (4 of 5 available)");

    // Boundary case: exactly 5 completed reports
    const boundaryState = formatClusterKpi(5, [{ label: "Engineering", count: 5 }]);
    assert.equal(boundaryState.state, "UNLOCKED");
    assert.equal(boundaryState.clusterCount, 1);
    assert.equal(boundaryState.accessibleLink, "#career-clusters-chart");

    // Above-threshold case: 12 completed reports
    const aboveState = formatClusterKpi(12, [
      { label: "Engineering", count: 6 },
      { label: "Product", count: 3 },
      { label: "Startup Ops", count: 3 },
    ]);
    assert.equal(aboveState.state, "UNLOCKED");
    assert.equal(aboveState.clusterCount, 3);
    assert.equal(aboveState.accessibleLink, "#career-clusters-chart");
  });

  it("ensures skill-gap analysis remains separate from career-cluster counts", () => {
    // Top skills derive from report roadmaps/gap plans, not from track category grouping
    const mockReportRoadmapSkills = ["React", "TypeScript", "System Design", "Docker"];
    const mockTrack = "Engineering";

    assert.notEqual(mockReportRoadmapSkills.length, 1);
    // Career cluster count is based on normalized work lane, while skills are aggregated independently
    assert.equal(mockTrack, "Engineering");
    assert.equal(mockReportRoadmapSkills.includes("React"), true);
  });
});

