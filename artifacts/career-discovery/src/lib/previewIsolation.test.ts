/**
 * Regression tests for preview isolation and normal student report access.
 *
 * Validates:
 * 1. Ordinary authenticated students always receive their database-backed report.
 * 2. Query parameter manipulation (?preview=canonical) is strictly rejected in student flow.
 * 3. Environment and access restrictions on representative preview routes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CareerReport, InstitutionDashboard, LegacyCareerReport } from "@workspace/api-client-react";
import {
  isPreviewAccessAllowed,
  resolveDashboardData,
  resolveStudentReport,
  REPRESENTATIVE_DASHBOARD_UNLOCKED_5,
} from "./previewIsolation";
import {
  REPRESENTATIVE_CANONICAL_REPORT,
  REPRESENTATIVE_STRATEGY,
} from "./representativeReport";

function sampleStudentDatabaseReport(): CareerReport {
  return {
    ...REPRESENTATIVE_CANONICAL_REPORT,
    profile: {
      ...REPRESENTATIVE_CANONICAL_REPORT.profile,
      summary: "Authentic student personal database report.",
    },
    longTermOptions: [
      {
        id: "data-analyst",
        title: "Data Analyst",
        category: "Analytics & Business Intelligence",
        rank: 1,
        score: 87,
        fitScore: 85,
        rationale: "Authentic student submission rationale.",
      },
      ...REPRESENTATIVE_CANONICAL_REPORT.longTermOptions.slice(1),
    ],
  };
}

describe("preview access restrictions (isPreviewAccessAllowed)", () => {
  it("allows preview in development environment for design and QA reviews", () => {
    assert.equal(
      isPreviewAccessAllowed({ isDev: true, isSignedIn: false, isAdmin: false }),
      true,
      "Development unauthenticated access must be allowed",
    );
    assert.equal(
      isPreviewAccessAllowed({ isDev: true, isSignedIn: true, isAdmin: false }),
      true,
      "Development student access must be allowed",
    );
  });

  it("denies preview in production for unauthenticated visitors", () => {
    assert.equal(
      isPreviewAccessAllowed({ isDev: false, isSignedIn: false, isAdmin: false }),
      false,
      "Production unauthenticated access must be rejected",
    );
  });

  it("denies preview in production for ordinary authenticated students", () => {
    assert.equal(
      isPreviewAccessAllowed({ isDev: false, isSignedIn: true, isAdmin: false }),
      false,
      "Ordinary students in production must not access preview route",
    );
  });

  it("allows preview in production only for authorized institution administrators", () => {
    assert.equal(
      isPreviewAccessAllowed({ isDev: false, isSignedIn: true, isAdmin: true }),
      true,
      "Authorized institution admins in production must have preview access",
    );
  });
});

describe("normal student report access and query isolation (resolveStudentReport)", () => {
  it("always returns the authentic database report for ordinary students", () => {
    const studentReport = sampleStudentDatabaseReport();
    const resolved = resolveStudentReport({
      databaseReport: studentReport,
      databaseStrategy: null,
      queryParamPreview: null,
      allowPreviewOverrides: false,
    });

    assert.equal(resolved.isPreview, false);
    assert.equal(resolved.report?.profile.summary, "Authentic student personal database report.");
    assert.equal((resolved.report as CareerReport)?.longTermOptions[0].title, "Data Analyst");
  });

  it("ignores ?preview=canonical when ordinary students manipulate query parameters", () => {
    const studentReport = sampleStudentDatabaseReport();
    const resolved = resolveStudentReport({
      databaseReport: studentReport,
      databaseStrategy: null,
      queryParamPreview: "canonical", // Injected query param
      allowPreviewOverrides: false,  // Ordinary student context
    });

    // Must NOT substitute REPRESENTATIVE_CANONICAL_REPORT!
    assert.equal(resolved.isPreview, false);
    assert.equal(resolved.report?.profile.summary, "Authentic student personal database report.");
    assert.equal((resolved.report as CareerReport)?.longTermOptions[0].title, "Data Analyst");
    assert.notEqual(
      resolved.report,
      REPRESENTATIVE_CANONICAL_REPORT,
      "Must not substitute demo fixture for real student",
    );
  });

  it("does not fabricate a report when student has no submission (404), even with ?preview=canonical", () => {
    const resolved = resolveStudentReport({
      databaseReport: null,
      databaseStrategy: null,
      queryParamPreview: "canonical",
      allowPreviewOverrides: false,
    });

    assert.equal(resolved.isPreview, false);
    assert.equal(resolved.report, null, "Must remain null so 404 empty state renders safely");
  });

  it("permits preview fixtures strictly when allowPreviewOverrides is explicitly true in preview context", () => {
    const resolved = resolveStudentReport({
      databaseReport: null,
      databaseStrategy: null,
      queryParamPreview: "canonical",
      allowPreviewOverrides: true, // Legitimate preview context
    });

    assert.equal(resolved.isPreview, true);
    assert.equal(resolved.report, REPRESENTATIVE_CANONICAL_REPORT);
    assert.equal(resolved.strategy, REPRESENTATIVE_STRATEGY);
  });
});

describe("dashboard preview isolation and unlocked 5-report fixture (resolveDashboardData)", () => {
  const liveProtectedDatabaseData: InstitutionDashboard = {
    institutionName: "Hyderabad Institute of Technology and Management (HITAM)",
    totalStudents: 4,
    completedReports: 4,
    statusCounts: { pending: 0, processing: 0, done: 4, failed: 0 },
    dataSuppressed: true,
    trackDistribution: [],
    clarityDistribution: [],
    workerTypeDistribution: [],
    traitAverages: { technical: 0, creative: 0, people: 0, risk: 0, learning: 0 },
    topSkills: [],
    topCareers: [],
    entryRoles: [],
    marketBarrierDistribution: [],
    longTermCaliberDistribution: [],
    careersToAvoid: [],
    commonConflicts: [],
    departmentOptions: ["CSE", "ECE", "IT"],
    yearOptions: ["3rd Year", "4th Year"],
    batchOptions: ["Batch 2021-2025", "Batch 2022-2026"],
  };

  it("always preserves live database cohort when no preview query is present", () => {
    const resolved = resolveDashboardData({
      databaseData: liveProtectedDatabaseData,
      queryParamPreview: null,
      allowPreviewOverrides: true,
    });

    assert.equal(resolved.isPreview, false);
    assert.equal(resolved.data?.totalStudents, 4);
    assert.equal(resolved.data?.completedReports, 4);
    assert.equal(resolved.data?.dataSuppressed, true);
    assert.equal(resolved.data?.trackDistribution.length, 0);
  });

  it("ignores preview param when user is not authorized for preview", () => {
    const resolved = resolveDashboardData({
      databaseData: liveProtectedDatabaseData,
      queryParamPreview: "unlocked-5",
      allowPreviewOverrides: false,
    });

    assert.equal(resolved.isPreview, false);
    assert.equal(resolved.data?.totalStudents, 4);
    assert.equal(resolved.data?.completedReports, 4);
    assert.equal(resolved.data?.dataSuppressed, true);
  });

  it("loads REPRESENTATIVE_DASHBOARD_UNLOCKED_5 when authorized with ?preview=unlocked-5", () => {
    const resolved = resolveDashboardData({
      databaseData: liveProtectedDatabaseData,
      queryParamPreview: "unlocked-5",
      allowPreviewOverrides: true,
    });

    assert.equal(resolved.isPreview, true);
    assert.equal(resolved.data?.totalStudents, 5);
    assert.equal(resolved.data?.completedReports, 5, "Fixture must have exactly 5 completed reports");
    assert.equal(resolved.data?.dataSuppressed, false, "Must be unlocked (dataSuppressed: false)");
  });

  it("verifies fixture has at least 2 distinct clusters with correct distribution counts and percentages", () => {
    const resolved = resolveDashboardData({
      databaseData: liveProtectedDatabaseData,
      queryParamPreview: "unlocked-5",
      allowPreviewOverrides: true,
    });

    const clusters = resolved.data?.trackDistribution ?? [];
    assert.equal(clusters.length, 2, "Fixture must have exactly 2 distinct career clusters");
    assert.deepEqual(clusters, [
      { label: "Engineering", count: 3 },
      { label: "Technical Business", count: 2 },
    ]);

    const total = resolved.data?.completedReports ?? 0;
    assert.equal(total, 5);

    const engineeringPct = Math.round((clusters[0].count / total) * 100);
    const techBusinessPct = Math.round((clusters[1].count / total) * 100);

    assert.equal(engineeringPct, 60, "Engineering must be 60% (3/5)");
    assert.equal(techBusinessPct, 40, "Technical Business must be 40% (2/5)");
    assert.equal(engineeringPct + techBusinessPct, 100);
  });

  it("verifies fixture top careers use the exact same cluster mapping", () => {
    const topCareers = REPRESENTATIVE_DASHBOARD_UNLOCKED_5.topCareers;
    // Software Engineer (2) + Cloud Engineer (1) = 3 (matches Engineering count: 3)
    // Business Analyst (2) = 2 (matches Technical Business count: 2)
    assert.deepEqual(topCareers, [
      { label: "Software Engineer", count: 2 },
      { label: "Business Analyst", count: 2 },
      { label: "Cloud / DevOps Engineer", count: 1 },
    ]);
  });

  it("handles cohort filter interactions on preview fixture gracefully", () => {
    // Filter by department in fixture
    const matchingResolved = resolveDashboardData({
      databaseData: liveProtectedDatabaseData,
      queryParamPreview: "unlocked-5",
      allowPreviewOverrides: true,
      filters: { department: "CSE" },
    });
    assert.equal(matchingResolved.data?.totalStudents, 5);

    // Filter by department not in fixture
    const emptyResolved = resolveDashboardData({
      databaseData: liveProtectedDatabaseData,
      queryParamPreview: "unlocked-5",
      allowPreviewOverrides: true,
      filters: { department: "Civil Engineering" },
    });
    assert.equal(emptyResolved.data?.totalStudents, 0);
    assert.equal(emptyResolved.data?.completedReports, 0);
  });
});

