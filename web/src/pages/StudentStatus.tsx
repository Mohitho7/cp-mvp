import { useState, useEffect, useCallback } from "react";
import { getMySubmission, getSubmission, retrySubmission, type SubmissionStatus } from "../api";
import { Link, useRoute } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { ArrowLeft, CircleCheck, Clock3, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { ReportDetail } from "./ReportDetail";
import { Brand, PageFrame } from "../components/Brand";

export default function StudentStatus() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, params] = useRoute("/student/status/:id");
  const routeId = params?.id;

  const [result, setResult] = useState<SubmissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = routeId ? await getSubmission(routeId) : await getMySubmission();
      setResult(data);
      setNotFound(false);
      setLoadError(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (/404|not found/i.test(message)) {
        setNotFound(true);
      } else {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    setLoading(true);
    setResult(null);
    setNotFound(false);
    setLoadError(false);
    void fetchStatus();
  }, [fetchStatus]);

  // Poll every 5s while the report is being generated.
  useEffect(() => {
    if (!result || (result.status !== "pending" && result.status !== "processing")) return;
    const timer = setInterval(() => { void fetchStatus(); }, 5000);
    return () => clearInterval(timer);
  }, [result, fetchStatus]);

  async function retryReport() {
    if (!result || retrying) return;
    setRetrying(true);
    setRetryError(false);
    try {
      await retrySubmission(result.id);
      await fetchStatus();
    } catch {
      setRetryError(true);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <PageFrame>
      <header className="topbar"><Brand /><div className="topbar-right"><span className="signed-user">{user?.firstName || "Student"} · private report</span><button className="quiet-link signout-link" onClick={() => signOut({ redirectUrl: "/" })} data-testid="button-student-signout"><LogOut size={14} /> Sign out</button></div></header>
      <main className="student-main enter">
        <Link href="/" className="back-link" data-testid="link-back-home"><ArrowLeft size={15} /> Home</Link>
        {notFound ? <section className="empty-state">
          <span className="eyebrow">YOUR DISCOVERY</span><h1>No assessment found yet.</h1>
          <p>Complete the 13-question discovery to see your personal report here.</p><Link href="/" className="button button-primary" data-testid="link-start-assessment">Start the assessment <span>→</span></Link>
        </section> : loading ? <section className="status-panel" aria-live="polite"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /><p>Checking your report status…</p></section> : loadError ?
          <section className="error-panel" role="alert"><ShieldAlert /><h1>We couldn't load your report.</h1><p>Your assessment is safe. Try again in a moment.</p><button className="button button-subtle" onClick={() => { setLoading(true); setLoadError(false); void fetchStatus(); }} data-testid="button-retry-report">Try again</button></section> :
          (result?.status === "pending" || result?.status === "processing") ? <section className="status-panel pending-panel" aria-live="polite">
            <div className="status-icon pending"><Clock3 size={24} /></div><span className="eyebrow">{result.status === "processing" ? "REPORT BEING PREPARED" : "REPORT IN PROGRESS"}</span><h1>{result.status === "processing" ? "Your answers are being shaped into a report." : "Your answers are being read carefully."}</h1>
            <p>This usually takes a few minutes. This page checks automatically, so you can leave it open or return later.</p>
            <div className="poll-note"><RefreshCw size={14} /> Checking again every few seconds</div>
            <div className="submitted-meta">Submitted {result.submittedAt ? new Date(result.submittedAt).toLocaleString() : "recently"}</div>
          </section> : result?.status === "failed" ? <section className="error-panel" role="alert">
            <div className="status-icon failed"><ShieldAlert size={24} /></div><span className="eyebrow">REPORT COULDN'T BE COMPLETED</span><h1>Your answers are still here.</h1>
            <p>{result.error || "Something interrupted report generation. Your original answers are safely saved."}</p>
            {retryError && <div className="form-error" role="alert"><ShieldAlert size={15} />We couldn't restart report generation. Please try again.</div>}
            <button className="button button-primary" onClick={retryReport} disabled={retrying} data-testid="button-retry-report"><RefreshCw size={15} />{retrying ? "Queueing another attempt…" : "Retry report generation"}</button>
          </section> : result?.status === "done" && result.report ? <div>
            <div className="report-success"><div className="status-icon done"><CircleCheck size={23} /></div><div><span className="eyebrow">YOUR PRIVATE REPORT</span><p>Only you can see the full details below.</p></div></div>
            <ReportDetail report={result.report} />
          </div> : <section className="error-panel"><h1>Report unavailable</h1><p>The submission returned an unexpected status.</p><button className="button button-subtle" onClick={() => void fetchStatus()}>Refresh status</button></section>}
      </main>
    </PageFrame>
  );
}
