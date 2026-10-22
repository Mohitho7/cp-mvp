/**
 * Preview Isolation and Access Control.
 *
 * Enforces:
 * 1. Ordinary authenticated students always see their own database-backed report.
 * 2. Query-parameter manipulation (?preview=canonical) cannot switch a student's private report to demo data.
 * 3. /preview/report is restricted to legitimate development (import.meta.env.DEV) or authorized staff in production.
 */
import type {
  CareerReport,
  CareerSubmissionResult,
  InstitutionDashboard,
  LegacyCareerReport,
} from "@workspace/api-client-react";
import {
  REPRESENTATIVE_CANONICAL_REPORT,
  REPRESENTATIVE_STRATEGY,
} from "./representativeReport";

export interface PreviewAccessContext {
  isDev: boolean;
  isSignedIn: boolean;
  isAdmin?: boolean;
}

/**
 * Determines whether representative report preview access is permitted.
 * - In development environments: always allowed for design and QA review.
 * - In production environments: restricted to authenticated institution staff.
 * - Ordinary students or unauthenticated public users in production are denied.
 */
export function isPreviewAccessAllowed(context: PreviewAccessContext): boolean {
  if (context.isDev) {
    return true;
  }
  return Boolean(context.isSignedIn && context.isAdmin);
}

export interface ResolveStudentReportParams {
  databaseReport: CareerReport | LegacyCareerReport | null | undefined;
  databaseStrategy: CareerSubmissionResult["strategy"] | null | undefined;
  queryParamPreview?: string | null;
  allowPreviewOverrides?: boolean;
}

export interface ResolvedStudentReport {
  report: CareerReport | LegacyCareerReport | null;
  strategy: CareerSubmissionResult["strategy"] | null;
  isPreview: boolean;
}

/**
 * Resolves the active report for a student status view.
 * Guarantees that ordinary student views never substitute mock fixtures
 * even if query parameters like ?preview=canonical are injected.
 */
export function resolveStudentReport(
  params: ResolveStudentReportParams,
): ResolvedStudentReport {
  if (params.allowPreviewOverrides && params.queryParamPreview === "canonical") {
    return {
      report: REPRESENTATIVE_CANONICAL_REPORT,
      strategy: REPRESENTATIVE_STRATEGY,
      isPreview: true,
    };
  }

  return {
    report: params.databaseReport ?? null,
    strategy: params.databaseStrategy ?? null,
    isPreview: false,
  };
}

/**
 * Isolated representative dashboard fixture:
 * - Exactly 5 completed student reports (reaches PRIVACY_THRESHOLD = 5).
 * - dataSuppressed: false (unlocked state).
 * - Exactly 2 distinct career clusters:
 *     1. Engineering: 3 students (60%)
 *     2. Technical Business: 2 students (40%)
 * - Top target roles map into these exact clusters:
 *     - Software Engineer (2) + Cloud Engineer (1) = 3 in Engineering
 *     - Business Analyst (2) = 2 in Technical Business
 * - Realistic trait averages, skill gaps, and entry roles.
 */
export const REPRESENTATIVE_DASHBOARD_UNLOCKED_5: InstitutionDashboard = {
  institutionName: "Hyderabad Institute of Technology and Management (HITAM)",
  totalStudents: 5,
  completedReports: 5,
  statusCounts: {
    pending: 0,
    processing: 0,
    done: 5,
    failed: 0,
  },
  dataSuppressed: false,
  trackDistribution: [
    { label: "Engineering", count: 3 },
    { label: "Technical Business", count: 2 },
  ],
  clarityDistribution: [
    { label: "High", count: 3 },
    { label: "Moderate", count: 2 },
    { label: "Low", count: 0 },
  ],
  workerTypeDistribution: [
    { label: "Builder", count: 3 },
    { label: "Specialist", count: 2 },
  ],
  traitAverages: {
    technical: 4.2,
    creative: 3.5,
    people: 3.8,
    risk: 2.9,
    learning: 4.4,
  },
  topSkills: [
    { skill: "TypeScript", count: 3 },
    { skill: "SQL", count: 3 },
    { skill: "System Design", count: 2 },
    { skill: "Business Analysis", count: 2 },
  ],
  topCareers: [
    { label: "Software Engineer", count: 2 },
    { label: "Business Analyst", count: 2 },
    { label: "Cloud / DevOps Engineer", count: 1 },
  ],
  entryRoles: [
    { label: "QA / Software Testing Engineer", count: 2 },
    { label: "Data Analyst", count: 2 },
    { label: "IT Support Specialist", count: 1 },
  ],
  marketBarrierDistribution: [
    { label: "Moderate", count: 3 },
    { label: "High", count: 2 },
  ],
  longTermCaliberDistribution: [
    { label: "Staff Engineer / Architect", count: 3 },
    { label: "Principal Analyst / Domain Lead", count: 2 },
  ],
  careersToAvoid: [
    { label: "Cold Call Sales Representative", count: 4 },
  ],
  commonConflicts: [
    {
      tag: "Structure vs Agility",
      text: "Stated preference for rigid procedures alongside interest in high-ambiguity venture environments.",
      count: 2,
    },
  ],
  departmentOptions: ["CSE", "CSE (AI & ML)", "IT"],
  yearOptions: ["3rd Year", "4th Year"],
  batchOptions: ["Batch 2021-2025", "Batch 2022-2026"],
};

export interface ResolveDashboardDataParams {
  databaseData: InstitutionDashboard | undefined;
  queryParamPreview?: string | null;
  allowPreviewOverrides?: boolean;
  filters?: { department?: string; year?: string; batch?: string };
}

/**
 * Resolves the active dashboard dataset.
 * - Defaults to live databaseData (ensuring current 4-report cohort stays protected).
 * - Only substitutes REPRESENTATIVE_DASHBOARD_UNLOCKED_5 when explicitly authorized
 *   and requested via ?preview=unlocked-5.
 */
export function resolveDashboardData(
  params: ResolveDashboardDataParams,
): { data: InstitutionDashboard | undefined; isPreview: boolean } {
  if (params.allowPreviewOverrides && params.queryParamPreview === "unlocked-5") {
    // If a non-matching department filter is applied during preview test, return empty filtered cohort
    if (
      params.filters?.department &&
      !REPRESENTATIVE_DASHBOARD_UNLOCKED_5.departmentOptions.includes(params.filters.department)
    ) {
      return {
        data: {
          ...REPRESENTATIVE_DASHBOARD_UNLOCKED_5,
          totalStudents: 0,
          completedReports: 0,
          statusCounts: { pending: 0, processing: 0, done: 0, failed: 0 },
          dataSuppressed: true,
          trackDistribution: [],
        },
        isPreview: true,
      };
    }

    return {
      data: REPRESENTATIVE_DASHBOARD_UNLOCKED_5,
      isPreview: true,
    };
  }

  return {
    data: params.databaseData,
    isPreview: false,
  };
}
