import { useEffect } from "react";
import { useGetMyCareerSubmission, getGetMyCareerSubmissionQueryKey, useRetryCareerSubmission } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { ArrowLeft, CircleCheck, Clock3, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { ReportDetail } from "./ReportDetail";
import { Brand, PageFrame } from "@/components/Brand";
import { resolveStudentReport } from "@/lib/previewIsolation";
import { syncSubmissionStorageOnStatusCheck } from "@/lib/assessmentNavigation";

export default function StudentStatus() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const query = useGetMyCareerSubmission({ query: { queryKey: getGetMyCareerSubmissionQueryKey(), refetchInterval: (q) => q.state.data?.status === "pending" || q.state.data?.status === "processing" ? 5000 : false } });
  const retry = useRetryCareerSubmission();
  const result = query.data;

  // Keep client-side submission ID in sync with the database record,
  // and clear stale submission IDs when no submission exists for this user.
  useEffect(() => {
    syncSubmissionStorageOnStatusCheck(localStorage, {
      resultId: result?.id,
      errorStatus: (query.error as { status?: number })?.status,
    });
  }, [result?.id, query.error]);
  
  // Ordinary authenticated students ALWAYS see their own database-backed report.
  // Query-parameter manipulation (?preview=canonical) cannot switch them to a representative demo report.
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const { report: activeReport, strategy: activeStrategy } = resolveStudentReport({
    databaseReport: result?.report,
    databaseStrategy: result?.strategy,
    queryParamPreview: searchParams?.get("preview"),
    allowPreviewOverrides: false,
  });

  function retryReport() {
    if (!result || retry.isPending) return;
    retry.mutate({ id: result.id }, { onSuccess: () => query.refetch() });
  }
  return (
    <PageFrame>
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <Link
            href="/institution/dashboard"
            className="quiet-link"
            data-testid="link-student-nav-faculty"
          >
            Faculty
          </Link>
          <span className="signed-user">{user?.firstName || "Student"} · private report</span>
          <button className="quiet-link signout-link" onClick={() => signOut({ redirectUrl: "/" })} data-testid="button-student-signout">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>
      <main className="student-main enter">
        <Link href="/" className="back-link" data-testid="link-back-home"><ArrowLeft size={15} /> Home</Link>
        {activeReport ? (
          <div>
            <div className="report-success" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                <div className="status-icon done"><CircleCheck size={23} /></div>
                <div>
                  <span className="eyebrow">YOUR PRIVATE REPORT</span>
                  <p>Only you can see the full details below.</p>
                </div>
              </div>
            </div>
            <ReportDetail report={activeReport} strategy={activeStrategy} />
          </div>
        ) : query.error && (query.error as { status?: number }).status === 404 ? <section className="empty-state">
          <span className="eyebrow">YOUR DISCOVERY</span><h1>No assessment found yet.</h1>
          <p>Complete the 13-question discovery to see your personal report here.</p>
          <Link
            href="/?start=true"
            className="button button-primary"
            data-testid="link-start-assessment"
            onClick={() => {
              syncSubmissionStorageOnStatusCheck(localStorage, { errorStatus: 404 });
            }}
          >
            Start the assessment <span>→</span>
          </Link>
        </section> : query.isLoading ? <section className="status-panel" aria-live="polite"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /><p>Checking your report status…</p></section> : query.isError ?
          <section className="error-panel" role="alert"><ShieldAlert /><h1>We couldn't load your report.</h1><p>Your assessment is safe. Try again in a moment.</p><button className="button button-subtle" onClick={() => query.refetch()} data-testid="button-retry-report">Try again</button></section> :
          (result?.status === "pending" || result?.status === "processing") ? <section className="status-panel pending-panel" aria-live="polite">
            <div className="status-icon pending"><Clock3 size={24} /></div><span className="eyebrow">{result.status === "processing" ? "REPORT BEING PREPARED" : "REPORT IN PROGRESS"}</span><h1>{result.status === "processing" ? "Your answers are being shaped into a report." : "Your answers are being read carefully."}</h1>
            <p>This usually takes a few minutes. This page checks automatically, so you can leave it open or return later.</p>
            <div className="poll-note"><RefreshCw size={14} /> Checking again every few seconds</div>
            <div className="submitted-meta">Submitted {result.submittedAt ? new Date(result.submittedAt).toLocaleString() : "recently"}</div>
          </section> : result?.status === "failed" ? <section className="error-panel" role="alert">
            <div className="status-icon failed"><ShieldAlert size={24} /></div><span className="eyebrow">REPORT COULDN'T BE COMPLETED</span><h1>Your answers are still here.</h1>
            <p>{result.error || "Something interrupted report generation. Your original answers are safely saved."}</p>
            {retry.isError && <div className="form-error" role="alert"><ShieldAlert size={15} />We couldn't restart report generation. Please try again.</div>}
            <button className="button button-primary" onClick={retryReport} disabled={retry.isPending} data-testid="button-retry-report"><RefreshCw size={15} />{retry.isPending ? "Queueing another attempt…" : "Retry report generation"}</button>
          </section> : <section className="error-panel"><h1>Report unavailable</h1><p>The submission returned an unexpected status.</p><button className="button button-subtle" onClick={() => query.refetch()}>Refresh status</button></section>}
      </main>
    </PageFrame>
  );
}
