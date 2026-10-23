import type { AssessmentDraft, DraftStorage } from "./assessmentDraft";

export const SUBMISSION_STORAGE_KEY = "careerDiscoverySubmissionId";

/**
 * Determines whether the user has explicitly requested to start or enter the assessment.
 * The /assessment route is the explicit entry point.
 * At the root URL (/), legacy query parameters like ?start=true must NOT bypass the landing page.
 */
export function isAssessmentStartRequested(search: string = "", pathname?: string): boolean {
  if (pathname !== undefined) {
    const cleanPath = pathname.trim().replace(/\/$/, "");
    if (cleanPath === "/assessment" || cleanPath.endsWith("/assessment")) {
      return true;
    }
    // Visiting root (/) or home must always open the landing page; legacy query params do not bypass it.
    if (cleanPath === "" || cleanPath === "/") {
      return false;
    }
  }
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return (
    params.get("start") === "true" ||
    params.get("start") === "assessment" ||
    params.get("quiz") === "true"
  );
}

export interface HomeNavigationParams {
  isSignedIn: boolean;
  submissionId: string | null;
  search?: string;
  pathname?: string;
}

export interface HomeNavigationDecision {
  action: "redirect_status" | "render_discovery";
  redirectPath?: string;
}

/**
 * Determines the navigation outcome when visiting the home route.
 * Root URL (/) always displays the Career Pathfinder landing page first.
 * Never automatically redirects signed-in users with a report to /student/status.
 */
export function resolveHomeNavigation({
  isSignedIn: _isSignedIn,
  submissionId: _submissionId,
  search: _search = "",
  pathname: _pathname = "/",
}: HomeNavigationParams): HomeNavigationDecision {
  return {
    action: "render_discovery",
  };
}

export interface AssessmentInitialStateParams {
  isStarting: boolean;
  draft: AssessmentDraft | null;
}

export interface AssessmentInitialState {
  screen: "intro" | "quiz" | "result";
  currentQ: number;
  hasSavedAnswers: boolean;
}

/**
 * Resolves the initial screen and question index for CareerDiscovery.
 * When isStarting is false (e.g. visiting /), always opens the intro landing page (screen: "intro").
 * When isStarting is true (visiting /assessment), resumes saved draft question and answers if present,
 * or starts at Question 1 (index 0) if new.
 */
export function resolveAssessmentInitialState({
  isStarting,
  draft,
}: AssessmentInitialStateParams): AssessmentInitialState {
  const hasSavedAnswers = Boolean(
    draft &&
      (draft.answers.some((a) => a !== null && (!Array.isArray(a) || a.length > 0)) ||
        draft.currentQ > 0 ||
        draft.screen === "result")
  );

  if (isStarting) {
    if (draft?.screen === "result") {
      return {
        screen: "result",
        currentQ: draft.currentQ,
        hasSavedAnswers,
      };
    }
    return {
      screen: "quiz",
      currentQ: hasSavedAnswers && draft ? draft.currentQ : 0,
      hasSavedAnswers,
    };
  }

  return {
    screen: "intro",
    currentQ: draft?.currentQ ?? 0,
    hasSavedAnswers,
  };
}

/**
 * Synchronizes client-side submission ID with server state:
 * - On 404 (no assessment exists for this user), removes stale submission ID.
 * - On valid submission result, sets submission ID.
 */
export function syncSubmissionStorageOnStatusCheck(
  storage: DraftStorage,
  {
    resultId,
    errorStatus,
  }: {
    resultId?: string | null;
    errorStatus?: number | null;
  }
): void {
  try {
    if (resultId) {
      storage.setItem(SUBMISSION_STORAGE_KEY, resultId);
    } else if (errorStatus === 404) {
      storage.removeItem(SUBMISSION_STORAGE_KEY);
    }
  } catch {
    // Gracefully handle storage errors
  }
}

export const FACULTY_DASHBOARD_PATH = "/institution/dashboard";

/**
 * Validates and sanitizes a destination URL to prevent open redirects and loops.
 * Only permits internal relative paths starting with a single '/' (not '//' or '\').
 */
export function sanitizeRedirectUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\") &&
    !trimmed.startsWith("/sign-in") &&
    !trimmed.startsWith("/sign-up")
  ) {
    return trimmed;
  }
  return undefined;
}

/**
 * Builds a sign-in URL that preserves a destination URL in the redirect_url query parameter.
 */
export function buildSignInUrl(targetPath?: string | null): string {
  const safeTarget = sanitizeRedirectUrl(targetPath);
  if (safeTarget && safeTarget !== "/") {
    return `/sign-in?redirect_url=${encodeURIComponent(safeTarget)}`;
  }
  return "/sign-in";
}

export interface AdminRouteNavigationParams {
  isSignedIn: boolean;
  pathname?: string;
  search?: string;
}

export interface AdminRouteDecision {
  action: "render_dashboard" | "redirect_signin";
  redirectPath?: string;
}

/**
 * Resolves the navigation decision for admin / faculty routes.
 * When signed out, preserves the requested faculty destination so the user returns
 * to the dashboard after authenticating.
 */
export function resolveAdminRouteNavigation({
  isSignedIn,
  pathname = FACULTY_DASHBOARD_PATH,
  search = "",
}: AdminRouteNavigationParams): AdminRouteDecision {
  if (isSignedIn) {
    return { action: "render_dashboard" };
  }

  const fullPath = `${pathname}${search}` || FACULTY_DASHBOARD_PATH;
  return {
    action: "redirect_signin",
    redirectPath: buildSignInUrl(fullPath),
  };
}

/**
 * Determines the post-sign-in destination URL.
 * Preserves the faculty dashboard if requested, or falls back to /student/status.
 */
export function resolvePostSignInDestination(redirectParam?: string | null): string {
  const safe = sanitizeRedirectUrl(redirectParam);
  return safe || "/student/status";
}

