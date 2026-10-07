import { useState, useEffect, useCallback } from "react";
import { getDashboard, type InstitutionDashboard as DashboardData, type DistributionCount, type TraitAverages } from "../api";
import { useClerk } from "@clerk/react";
import { Link } from "wouter";
import { Activity, BarChart3, BriefcaseBusiness, ChevronDown, CircleAlert, RefreshCw, ShieldCheck, Signpost, Users } from "lucide-react";
import { Brand, PageFrame } from "../components/Brand";

function Bars({ title, items, tint = "gold" }: { title: string; items: DistributionCount[]; tint?: string }) {
  const max = Math.max(...items.map((x) => x.count), 1);
  return <section className="dash-card chart-card"><div className="dash-card-heading"><div><span className="section-label">COHORT SIGNAL</span><h2>{title}</h2></div><BarChart3 size={17} /></div>
    {items.length ? <div className="bar-list">{items.map((item, i) => <div className="bar-row" key={`${item.label}-${i}`}><div className="bar-label"><span>{item.label}</span><b>{item.count}</b></div><div className="bar-track"><i className={tint} style={{ width: `${Math.max(5, item.count / max * 100)}%` }} /></div></div>)}</div> : <p className="chart-empty">Not enough responses in this cohort yet.</p>}
  </section>;
}

function TraitBars({ values }: { values: TraitAverages }) {
  const traits = [["Technical", values.technical], ["Creative", values.creative], ["People", values.people], ["Risk", values.risk], ["Learning", values.learning]] as const;
  return <section className="dash-card"><div className="dash-card-heading"><div><span className="section-label">COHORT SIGNAL</span><h2>Average trait profile</h2></div><Activity size={17} /></div>
    <div className="average-list">{traits.map(([label, value]) => <div className="average-item" key={label}><div><span>{label}</span><b>{value.toFixed(1)}<small> / 5</small></b></div><div className="bar-track"><i className="mint" style={{ width: `${Math.min(value * 20, 100)}%` }} /></div></div>)}</div>
  </section>;
}

interface Filters { department?: string; year?: string; batch?: string; }

export default function InstitutionDashboard() {
  const { signOut } = useClerk();
  const [filters, setFilters] = useState<Filters>({});
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fetchDashboard = useCallback(async (next: Filters) => {
    setLoading(true);
    setLoadError(false);
    try {
      const dashboard = await getDashboard(next);
      setData(dashboard);
      setForbidden(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (/403|administrator/i.test(message)) {
        setForbidden(true);
      } else {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchDashboard(filters); }, [fetchDashboard, filters.department, filters.year, filters.batch]);

  const changeFilter = (key: keyof Filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value || undefined }));

  return <PageFrame>
    <header className="topbar dashboard-topbar"><Brand /><nav className="dashboard-nav"><span className="nav-current"><BarChart3 size={15} /> Institution overview</span><Link href="/" className="quiet-link">Student discovery</Link></nav><button className="admin-pill" onClick={() => signOut({ redirectUrl: "/" })} data-testid="button-admin-signout"><span className="admin-initials">A</span> Admin <ChevronDown size={13} /></button></header>
    <main className="dashboard-main">
      <div className="dash-intro"><div><span className="eyebrow">CAREER DISCOVERY · COHORT INSIGHTS</span><h1>{data?.institutionName || "Institution"}<br /><em>in focus.</em></h1><p>Aggregate patterns from student answers—useful signals, never individual reports.</p></div><div className="privacy-seal"><ShieldCheck size={17} /><span>PRIVACY<br />BY DESIGN</span></div></div>
      <div className="filter-strip" aria-label="Dashboard filters">
        <div className="filter-title">VIEW COHORT</div>
        <label>Department<select value={filters.department || ""} onChange={(e) => changeFilter("department", e.target.value)} data-testid="filter-department"><option value="">All departments</option>{data?.departmentOptions?.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label>Year<select value={filters.year || ""} onChange={(e) => changeFilter("year", e.target.value)} data-testid="filter-year"><option value="">All years</option>{data?.yearOptions?.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label>Batch<select value={filters.batch || ""} onChange={(e) => changeFilter("batch", e.target.value)} data-testid="filter-batch"><option value="">All batches</option>{data?.batchOptions?.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        {(filters.department || filters.year || filters.batch) && <button className="clear-filters" onClick={() => setFilters({})} data-testid="button-clear-filters">Clear filters</button>}
      </div>
      {loading ? <div className="dashboard-loading" aria-label="Loading dashboard"><div className="skeleton skeleton-title" /><div className="metric-skeletons"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div><div className="chart-skeletons"><div className="skeleton" /><div className="skeleton" /></div></div> : forbidden ? <section className="access-denied"><div className="auth-icon"><ShieldCheck size={21} /></div><span className="eyebrow">INSTITUTION ACCESS</span><h1>This view is for institution administrators.</h1><p>Your student report remains private. This dashboard only contains cohort-level summaries.</p><Link href="/" className="button button-primary">Return to discovery</Link></section> : loadError ? <section className="error-panel dash-error" role="alert"><CircleAlert /><h2>Insights aren’t available right now.</h2><p>Try again. This does not affect any student reports.</p><button className="button button-subtle" onClick={() => fetchDashboard(filters)} data-testid="button-retry-dashboard"><RefreshCw size={15} /> Retry</button></section> : !data || data.totalStudents === 0 ? <section className="dashboard-empty"><Users size={25} /><span className="eyebrow">A COHORT TAKES SHAPE HERE</span><h2>No responses match this view yet.</h2><p>Try clearing a filter or check back after students have submitted their discovery.</p><button className="button button-subtle" onClick={() => setFilters({})} data-testid="button-reset-dashboard-filters">Show all cohorts</button></section> : <>
        <section className="metric-grid">
          <article className="metric-card metric-feature"><div className="metric-icon"><Users size={17} /></div><span className="metric-label">STUDENT SUBMISSIONS</span><strong>{data.totalStudents.toLocaleString()}</strong><small>In the selected cohort</small><div className="metric-footnote">Aggregated responses only</div></article>
          <article className="metric-card"><span className="metric-label">REPORTS READY</span><strong>{data.completedReports.toLocaleString()}</strong><small><span className="metric-dot mint-dot" /> {data.totalStudents ? Math.round(data.completedReports / data.totalStudents * 100) : 0}% completed</small></article>
          <article className="metric-card"><span className="metric-label">IN PROGRESS</span><strong>{(data.statusCounts.pending + data.statusCounts.processing).toLocaleString()}</strong><small><span className="metric-dot gold-dot" /> Reports processing</small></article>
          <article className="metric-card"><span className="metric-label">NEEDS RETRY</span><strong>{data.statusCounts.failed.toLocaleString()}</strong><small><span className="metric-dot coral-dot" /> Generation interrupted</small></article>
        </section>
        {data.dataSuppressed ? <section className="suppression-notice" role="status" aria-live="polite">
          <div className="suppression-icon"><ShieldCheck size={19} /></div>
          <div><span className="section-label">PRIVACY THRESHOLD ACTIVE</span><h2>Cohort insights are temporarily hidden.</h2><p>Fewer than five reports are complete for this filtered group. Chart-level patterns stay private until the cohort reaches five completed reports. Broaden the filters or check back as more reports are ready.</p></div>
        </section> : <>
        {data.totalStudents > 0 && data.completedReports === 0 && <div className="pending-notice"><Activity size={15} /> Reports are still being prepared. Career patterns appear here once enough reports are complete.</div>}
        {data.completedReports > 0 && <div className="dashboard-charts">
          <Bars title="Recommended tech tracks" items={data.trackDistribution} />
          <TraitBars values={data.traitAverages} />
          <Bars title="Student work styles" items={data.workerTypeDistribution} tint="mint" />
          <Bars title="Clarity across the cohort" items={data.clarityDistribution} tint="coral" />
          <Bars title="Most selected career fits" items={data.topCareers} />
          <Bars title="Common fresher entry roles" items={data.entryRoles} tint="mint" />
          <Bars title="Market barriers for long-term paths" items={data.marketBarrierDistribution} tint="coral" />
          <Bars title="Long-term caliber directions" items={data.longTermCaliberDistribution} />
          <Bars title="Career paths students may want to avoid" items={data.careersToAvoid} tint="coral" />
          <section className="dash-card skill-card"><div className="dash-card-heading"><div><span className="section-label">COHORT SIGNAL</span><h2>Skills students are building toward</h2></div><BriefcaseBusiness size={17} /></div><div className="skill-rankings">{data.topSkills.map((item, i) => <div key={`${item.skill}-${i}`}><span className="rank-no">0{i + 1}</span><b>{item.skill}</b><span>{item.count} mentions</span></div>)}</div>{!data.topSkills.length && <p className="chart-empty">No skill patterns in this cohort yet.</p>}</section>
          <section className="dash-card conflicts-card"><div className="dash-card-heading"><div><span className="section-label">COHORT SIGNAL</span><h2>Frequent answer tensions</h2></div><Signpost size={17} /></div><div className="conflict-list">{data.commonConflicts.map((item, i) => <article key={`${item.tag}-${i}`}><div><span>{item.tag}</span><b>{item.count}</b></div><p>{item.text}</p></article>)}</div>{!data.commonConflicts.length && <p className="chart-empty">No recurring tensions to surface.</p>}</section>
        </div>}
        </>}
      </>}
      <footer className="dashboard-footer"><span><ShieldCheck size={14} /> Institution view contains cohort aggregates only.</span><span>Student names, emails, answers, and full reports are never displayed.</span></footer>
    </main>
  </PageFrame>;
}
