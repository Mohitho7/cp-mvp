import { useGetMyCareerSubmission, getGetMyCareerSubmissionQueryKey, useRetryCareerSubmission } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { ArrowLeft, CircleCheck, Clock3, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { ReportDetail } from "./ReportDetail";
import { Brand, PageFrame } from "@/components/Brand";

export default function StudentStatus() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const query = useGetMyCareerSubmission({ query: { queryKey: getGetMyCareerSubmissionQueryKey(), refetchInterval: (q) => q.state.data?.status === "pending" || q.state.data?.status === "processing" ? 5000 : false } });
  const retry = useRetryCareerSubmission();
  const result = query.data;
  function retryReport() {
    if (!result || retry.isPending) return;
    retry.mutate({ id: result.id }, { onSuccess: () => query.refetch() });
  }
  return (
    <PageFrame>
      <header className="topbar"><Brand /><div className="topbar-right"><span className="signed-user">{user?.firstName || "Student"} · private report</span><button className="quiet-link signout-link" onClick={() => signOut({ redirectUrl: "/" })} data-testid="button-student-signout"><LogOut size={14} /> Sign out</button></div></header>
      <main className="student-main enter">
        <Link href="/" className="back-link" data-testid="link-back-home"><ArrowLeft size={15} /> Home</Link>
        {query.error && (query.error as { status?: number }).status === 404 ? <section className="empty-state">
          <span className="eyebrow">YOUR DISCOVERY</span><h1>No assessment found yet.</h1>
          <p>Complete the 13-question discovery to see your personal report here.</p><Link href="/" className="button button-primary" data-testid="link-start-assessment">Start the assessment <span>→</span></Link>
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
          </section> : result?.status === "done" && result.report ? <div>
            <div className="report-success"><div className="status-icon done"><CircleCheck size={23} /></div><div><span className="eyebrow">YOUR PRIVATE REPORT</span><p>Only you can see the full details below.</p></div></div>
            <ReportDetail report={result.report} />
          </div> : <section className="error-panel"><h1>Report unavailable</h1><p>The submission returned an unexpected status.</p><button className="button button-subtle" onClick={() => query.refetch()}>Refresh status</button></section>}
      </main>
    </PageFrame>
  );
}
