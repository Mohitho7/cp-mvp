import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAssessmentStartRequested,
  resolveHomeNavigation,
  resolveAssessmentInitialState,
  syncSubmissionStorageOnStatusCheck,
  resolveAdminRouteNavigation,
  resolvePostSignInDestination,
  sanitizeRedirectUrl,
  buildSignInUrl,
  FACULTY_DASHBOARD_PATH,
  SUBMISSION_STORAGE_KEY,
} from "./assessmentNavigation";
import {
  DRAFT_STORAGE_KEY,
  readAssessmentDraft,
  writeAssessmentDraft,
  type AssessmentDraft,
  type DraftStorage,
} from "./assessmentDraft";

function createMemoryStorage(initial: Record<string, string> = {}): DraftStorage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function sampleDraft(overrides: Partial<AssessmentDraft> = {}): AssessmentDraft {
  return {
    version: 1,
    screen: "quiz",
    currentQ: 2,
    answers: ["Building something cool", ["The person who builds/codes things"], null, null, null, null, null, null, null, null, null, null, null],
    textInput: "",
    userType: "student",
    department: "Computer Science & Engineering",
    year: "3rd Year",
    batch: "2023–2027",
    degree: "B.Tech Computer Science",
    graduationYear: 2027,
    availableHoursPerWeek: 15,
    consent: true,
    ...overrides,
  };
}

describe("Assessment Navigation — Start Request Detection", () => {
  it("detects ?start=true as an assessment start request", () => {
    assert.equal(isAssessmentStartRequested("?start=true"), true);
    assert.equal(isAssessmentStartRequested("start=true"), true);
  });

  it("detects ?start=assessment and ?quiz=true", () => {
    assert.equal(isAssessmentStartRequested("?start=assessment"), true);
    assert.equal(isAssessmentStartRequested("?quiz=true"), true);
  });

  it("detects /assessment route as an assessment start request", () => {
    assert.equal(isAssessmentStartRequested("", "/assessment"), true);
  });

  it("returns false for standard home visit without start query parameter", () => {
    assert.equal(isAssessmentStartRequested("", "/"), false);
    assert.equal(isAssessmentStartRequested("?ref=google", "/"), false);
  });
});

describe("Assessment Navigation — Home Redirect Loop Prevention", () => {
  it("signed-in user with no submission lands on discovery without redirect", () => {
    const decision = resolveHomeNavigation({
      isSignedIn: true,
      submissionId: null,
      search: "",
      pathname: "/",
    });
    assert.equal(decision.action, "render_discovery");
  });

  it("signed-in user with existing completed report redirects to /student/status on normal visit", () => {
    const decision = resolveHomeNavigation({
      isSignedIn: true,
      submissionId: "submission-uuid-1234",
      search: "",
      pathname: "/",
    });
    assert.equal(decision.action, "redirect_status");
    assert.equal(decision.redirectPath, "/student/status");
  });

  it("signed-in user clicking 'Start the assessment' (?start=true) NEVER redirects back to /student/status even if a stale submissionId exists", () => {
    const decision = resolveHomeNavigation({
      isSignedIn: true,
      submissionId: "stale-submission-id",
      search: "?start=true",
      pathname: "/",
    });
    assert.equal(decision.action, "render_discovery");
  });

  it("signed-in user visiting /assessment route directly NEVER redirects back to /student/status", () => {
    const decision = resolveHomeNavigation({
      isSignedIn: true,
      submissionId: "stale-submission-id",
      search: "",
      pathname: "/assessment",
    });
    assert.equal(decision.action, "render_discovery");
  });

  it("signed-out visitor on normal home route renders discovery", () => {
    const decision = resolveHomeNavigation({
      isSignedIn: false,
      submissionId: null,
      search: "",
      pathname: "/",
    });
    assert.equal(decision.action, "render_discovery");
  });
});

describe("Assessment Navigation — Screen and Question Initialization", () => {
  it("new user with no draft clicking 'Start the assessment' starts directly at Question 1 (index 0)", () => {
    const state = resolveAssessmentInitialState({
      isStarting: true,
      draft: null,
    });
    assert.equal(state.screen, "quiz");
    assert.equal(state.currentQ, 0);
    assert.equal(state.hasSavedAnswers, false);
  });

  it("normal homepage visit with no draft opens intro hero screen", () => {
    const state = resolveAssessmentInitialState({
      isStarting: false,
      draft: null,
    });
    assert.equal(state.screen, "intro");
    assert.equal(state.currentQ, 0);
    assert.equal(state.hasSavedAnswers, false);
  });

  it("existing draft with saved answers preserves draft progress and marks hasSavedAnswers", () => {
    const draft = sampleDraft({ currentQ: 3 });
    const state = resolveAssessmentInitialState({
      isStarting: true,
      draft,
    });
    assert.equal(state.screen, "quiz");
    assert.equal(state.currentQ, 3);
    assert.equal(state.hasSavedAnswers, true);
  });

  it("existing draft on result screen preserves result screen and marks hasSavedAnswers", () => {
    const draft = sampleDraft({ screen: "result", currentQ: 12 });
    const state = resolveAssessmentInitialState({
      isStarting: true,
      draft,
    });
    assert.equal(state.screen, "result");
    assert.equal(state.hasSavedAnswers, true);
  });

  it("clearing draft for a fresh restart resets progress to Question 1", () => {
    const storage = createMemoryStorage();
    writeAssessmentDraft(storage, sampleDraft());
    assert.ok(readAssessmentDraft(storage, 13) !== null);

    // User chooses to restart from Question 1
    storage.removeItem(DRAFT_STORAGE_KEY);
    const freshDraft = readAssessmentDraft(storage, 13);
    const state = resolveAssessmentInitialState({
      isStarting: true,
      draft: freshDraft,
    });
    assert.equal(state.screen, "quiz");
    assert.equal(state.currentQ, 0);
    assert.equal(state.hasSavedAnswers, false);
  });
});

describe("Assessment Navigation — Submission Storage Synchronization", () => {
  it("removes stale submission ID when server returns 404 No Assessment Found", () => {
    const storage = createMemoryStorage({
      [SUBMISSION_STORAGE_KEY]: "stale-prev-user-id",
    });

    syncSubmissionStorageOnStatusCheck(storage, {
      resultId: null,
      errorStatus: 404,
    });

    assert.equal(storage.getItem(SUBMISSION_STORAGE_KEY), null);
  });

  it("stores active submission ID when valid report/submission is fetched", () => {
    const storage = createMemoryStorage();

    syncSubmissionStorageOnStatusCheck(storage, {
      resultId: "active-submission-5555",
      errorStatus: null,
    });

    assert.equal(storage.getItem(SUBMISSION_STORAGE_KEY), "active-submission-5555");
  });

  it("does not remove submission ID on transient errors (e.g. 500 or network offline)", () => {
    const storage = createMemoryStorage({
      [SUBMISSION_STORAGE_KEY]: "existing-valid-id",
    });

    syncSubmissionStorageOnStatusCheck(storage, {
      resultId: null,
      errorStatus: 500,
    });

    assert.equal(storage.getItem(SUBMISSION_STORAGE_KEY), "existing-valid-id");
  });
});

describe("Faculty Navigation & Return-After-Sign-In — Admin Route Protection", () => {
  it("signed-in visitor accessing /institution/dashboard is allowed to render dashboard", () => {
    const decision = resolveAdminRouteNavigation({
      isSignedIn: true,
      pathname: "/institution/dashboard",
    });
    assert.equal(decision.action, "render_dashboard");
    assert.equal(decision.redirectPath, undefined);
  });

  it("signed-out visitor accessing /institution/dashboard redirects to sign-in preserving destination", () => {
    const decision = resolveAdminRouteNavigation({
      isSignedIn: false,
      pathname: "/institution/dashboard",
    });
    assert.equal(decision.action, "redirect_signin");
    assert.equal(decision.redirectPath, "/sign-in?redirect_url=%2Finstitution%2Fdashboard");
  });

  it("signed-out visitor preserves cohort filter query parameters when redirected to sign-in", () => {
    const decision = resolveAdminRouteNavigation({
      isSignedIn: false,
      pathname: "/institution/dashboard",
      search: "?department=Computer+Science+%26+Engineering&year=3rd+Year",
    });
    assert.equal(decision.action, "redirect_signin");
    assert.equal(
      decision.redirectPath,
      `/sign-in?redirect_url=${encodeURIComponent("/institution/dashboard?department=Computer+Science+%26+Engineering&year=3rd+Year")}`
    );
  });
});

describe("Faculty Navigation & Return-After-Sign-In — URL Sanitization & Post-Sign-In Target", () => {
  it("sanitizeRedirectUrl allows safe relative internal paths", () => {
    assert.equal(sanitizeRedirectUrl("/institution/dashboard"), "/institution/dashboard");
    assert.equal(sanitizeRedirectUrl("/student/status"), "/student/status");
    assert.equal(sanitizeRedirectUrl("/institution/dashboard?batch=2023-2027"), "/institution/dashboard?batch=2023-2027");
  });

  it("sanitizeRedirectUrl rejects open redirect attacks and protocol-relative URLs", () => {
    assert.equal(sanitizeRedirectUrl("https://malicious-site.com"), undefined);
    assert.equal(sanitizeRedirectUrl("http://attacker.com"), undefined);
    assert.equal(sanitizeRedirectUrl("//attacker.com"), undefined);
    assert.equal(sanitizeRedirectUrl("/\\attacker.com"), undefined);
    assert.equal(sanitizeRedirectUrl("javascript:alert(1)"), undefined);
  });

  it("sanitizeRedirectUrl prevents self-referential auth loop URLs", () => {
    assert.equal(sanitizeRedirectUrl("/sign-in"), undefined);
    assert.equal(sanitizeRedirectUrl("/sign-in?redirect_url=/foo"), undefined);
    assert.equal(sanitizeRedirectUrl("/sign-up"), undefined);
  });

  it("buildSignInUrl builds encoded return URL for faculty destination", () => {
    assert.equal(
      buildSignInUrl("/institution/dashboard"),
      "/sign-in?redirect_url=%2Finstitution%2Fdashboard"
    );
    assert.equal(buildSignInUrl(null), "/sign-in");
    assert.equal(buildSignInUrl("https://evil.com"), "/sign-in");
  });

  it("resolvePostSignInDestination returns requested faculty dashboard if valid", () => {
    assert.equal(
      resolvePostSignInDestination("/institution/dashboard"),
      "/institution/dashboard"
    );
    assert.equal(
      resolvePostSignInDestination("/institution/dashboard?department=CSE"),
      "/institution/dashboard?department=CSE"
    );
  });

  it("resolvePostSignInDestination falls back to /student/status if no target or target is invalid", () => {
    assert.equal(resolvePostSignInDestination(null), "/student/status");
    assert.equal(resolvePostSignInDestination(""), "/student/status");
    assert.equal(resolvePostSignInDestination("https://evil.com"), "/student/status");
  });
});

