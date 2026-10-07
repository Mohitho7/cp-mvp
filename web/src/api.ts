/** Typed client for the Career Pathfinder API (same-origin `/api`). */

const BASE = "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* keep default message */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Shared types (mirror the server contract)
// ---------------------------------------------------------------------------

export interface SubmissionInput {
  answers: {
    q1: string | null;
    q2: string[];
    q3: string[];
    q4: string[];
    q5: string | null;
    q6: string[];
    q7: string[];
    q8: string[];
    q9: string[];
    q10: string[];
    q11: string[];
    q12: string | null;
    q13: string;
  };
  department: string;
  year: string;
  batch: string;
  consent: true;
}

export interface SubmissionAccepted {
  id: string;
  status: "pending";
  submittedAt: string;
}

export interface SubmissionStatus {
  id: string;
  status: "pending" | "processing" | "done" | "failed";
  submittedAt: string;
  report: CareerReport | null;
  error: string | null;
}

export interface TraitScore {
  score: number;
  reason: string;
  label: "Low" | "Medium" | "High";
}

export interface CareerFit {
  title: string;
  roleType: "Stepping-stone" | "Long-term fit";
  salaryInrLpa: { min: number; max: number } | null;
  entryDifficulty: string;
  careerHealth: string;
  aiThreat: string;
  naturalFitScore: number;
  dailyWork: string;
  whyFits: string;
  fiveYearGrowth: string;
}

export interface CareerReport {
  profile: {
    archetype: string;
    workerType: string;
    clarityLevel: "Clear" | "Mixed" | "Exploratory";
    summary: string;
    strengths: string[];
    risks: string[];
    survivalEnvironment: string;
  };
  traits: {
    technical: TraitScore;
    creative: TraitScore;
    people: TraitScore;
    risk: TraitScore;
    learning: TraitScore;
  };
  answerPatterns: {
    clear: string[];
    conflicts: Array<{ tag: string; text: string }>;
    worthExploring: string[];
  };
  caliberVsEntry: {
    longTermCaliber: string;
    marketBarrier: string;
    marketBarrierLevel: "Low" | "Moderate" | "High";
    firstEntryRoles: string[];
    bridgePath: string;
  };
  careerFits: CareerFit[];
  careersToAvoid: Array<{ title: string; why: string }>;
  recommendedTrack: string;
  trackDetail: {
    why: string;
    fresherDemand: string;
    skillsToLearn: string[];
  };
  roadmap: Array<{ months: string; focus: string; actions: string[] }>;
  brutalTruth: string;
}

export interface DistributionCount {
  label: string;
  count: number;
}

export interface TraitAverages {
  technical: number;
  creative: number;
  people: number;
  risk: number;
  learning: number;
}

export interface SkillCount {
  skill: string;
  count: number;
}

export interface ConflictCount {
  tag: string;
  text: string;
  count: number;
}

export interface InstitutionDashboard {
  institutionName: string;
  totalStudents: number;
  statusCounts: {
    pending: number;
    processing: number;
    done: number;
    failed: number;
  };
  completedReports: number;
  dataSuppressed: boolean;
  trackDistribution: DistributionCount[];
  clarityDistribution: DistributionCount[];
  workerTypeDistribution: DistributionCount[];
  traitAverages: TraitAverages;
  topSkills: SkillCount[];
  topCareers: DistributionCount[];
  entryRoles: DistributionCount[];
  marketBarrierDistribution: DistributionCount[];
  longTermCaliberDistribution: DistributionCount[];
  careersToAvoid: DistributionCount[];
  commonConflicts: ConflictCount[];
  departmentOptions: string[];
  yearOptions: string[];
  batchOptions: string[];
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function submitAssessment(
  input: SubmissionInput,
): Promise<SubmissionAccepted> {
  return apiFetch<SubmissionAccepted>("/submit", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getMySubmission(): Promise<SubmissionStatus> {
  return apiFetch<SubmissionStatus>("/submissions/me");
}

export async function getSubmission(id: string): Promise<SubmissionStatus> {
  return apiFetch<SubmissionStatus>(`/result/${encodeURIComponent(id)}`);
}

export async function retrySubmission(id: string): Promise<SubmissionAccepted> {
  return apiFetch<SubmissionAccepted>(
    `/submissions/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
  );
}

export async function getDashboard(filters?: {
  department?: string;
  year?: string;
  batch?: string;
}): Promise<InstitutionDashboard> {
  const params = new URLSearchParams();
  if (filters?.department) params.set("department", filters.department);
  if (filters?.year) params.set("year", filters.year);
  if (filters?.batch) params.set("batch", filters.batch);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<InstitutionDashboard>(`/dashboard${qs}`);
}

export async function healthCheck(): Promise<{
  status: string;
  db: string;
}> {
  return apiFetch("/healthz");
}
