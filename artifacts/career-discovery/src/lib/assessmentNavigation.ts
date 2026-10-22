import type { AssessmentDraft, DraftStorage } from "./assessmentDraft";

export const SUBMISSION_STORAGE_KEY = "careerDiscoverySubmissionId";

/**
 * Determines whether the user has explicitly requested to start or enter the assessment,
 * via query parameter (?start=true, ?start=assessment, ?quiz=true) or route (/assessment).
 */
export function isAssessmentStartRequested(search: string = "", pathname: string = ""): boolean {
  if (pathname === "/assessment" || pathname.endsWith("/assessment")) {
    return true;
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
 * Prevents redirect loops: if the user explicitly requests starting the assessment,
 * they stay on the assessment flow rather than bouncing back to /student/status.
 */
export function resolveHomeNavigation({
  isSignedIn,
  submissionId,
  search = "",
  pathname = "",
}: HomeNavigationParams): HomeNavigationDecision {
  const isStarting = isAssessmentStartRequested(search, pathname);

  if (!isStarting && isSignedIn && submissionId) {
    return {
      action: "redirect_status",
      redirectPath: "/student/status",
    };
  }

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
 * When a fresh start is requested, initializes directly to Question 1 (index 0).
 * When saved draft answers exist, preserves them and signals that resumption choice should be offered.
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
    screen: draft?.screen ?? "intro",
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
