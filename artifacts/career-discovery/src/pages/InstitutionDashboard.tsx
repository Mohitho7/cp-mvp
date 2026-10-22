import { useState } from "react";
import { useGetInstitutionDashboard, getGetInstitutionDashboardQueryKey } from "@workspace/api-client-react";
import type { GetInstitutionDashboardParams, DistributionCount, TraitAverages } from "@workspace/api-client-react";
import { useClerk, useUser } from "@clerk/react";
import { Link } from "wouter";
import { isPreviewAccessAllowed, resolveDashboardData } from "@/lib/previewIsolation";
import {
  Activity,
  BarChart3,
  Briefcase,
  ChevronDown,
  CircleAlert,
  Compass,
  FileCheck2,
  GraduationCap,
  Layers,
  Lightbulb,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Signpost,
  Sparkles,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { Brand, PageFrame } from "@/components/Brand";

function DistributionBars({
  id,
  title,
  description,
  items,
  total,
  tint = "gold",
  icon: Icon = BarChart3,
}: {
  id?: string;
  title: string;
  description?: string;
  items: DistributionCount[];
  total: number;
  tint?: "gold" | "mint" | "coral";
  icon?: React.ComponentType<{ size?: number }>;
}) {
  const max = Math.max(...items.map((x) => x.count), 1);
  return (
    <section className="dash-card" id={id} style={id ? { scrollMarginTop: "90px" } : undefined}>
      <div className="dash-card-heading">
        <div>
          <span className="section-label">COHORT DISTRIBUTION</span>
          <h2>{title}</h2>
        </div>
        <Icon size={18} />
      </div>
      {description && <p className="dash-card-description">{description}</p>}
      {items.length ? (
        <div className="bar-list" role="list" aria-label={title}>
          {items.map((item, i) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            return (
              <div className="bar-row" key={`${item.label}-${i}`} role="listitem">
                <div className="bar-label">
                  <span>{item.label}</span>
                  <b>
                    {item.count} <small style={{ fontWeight: 400, color: "var(--cp-muted)" }}>({pct}%)</small>
                  </b>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <i
                    className={tint}
                    style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="chart-empty">Not enough recorded responses in this cohort yet.</p>
      )}
    </section>
  );
}

function TraitAveragesProfile({ values }: { values: TraitAverages }) {
  const traits = [
    { label: "Technical Execution", value: values.technical, hint: "Structured systems & logic" },
    { label: "Creative Expression", value: values.creative, hint: "Generative & novel solutions" },
    { label: "People & Collaboration", value: values.people, hint: "Communication & stakeholder trust" },
    { label: "Calculated Risk Taking", value: values.risk, hint: "Tolerance for ambiguity & venture pace" },
    { label: "Continuous Learning", value: values.learning, hint: "Self-directed skill acquisition" },
  ];

  return (
    <section className="dash-card">
      <div className="dash-card-heading">
        <div>
          <span className="section-label">COHORT PROFILE</span>
          <h2>Average trait orientation</h2>
        </div>
        <Activity size={18} />
      </div>
      <p className="dash-card-description">
        Aggregated 1–5 scoring across core behavioral dimensions from student assessment responses.
      </p>
      <div className="average-list">
        {traits.map((trait) => (
          <div className="average-item" key={trait.label}>
            <div>
              <span>
                <strong>{trait.label}</strong>
                <span style={{ display: "block", fontSize: "11px", color: "var(--cp-muted)", marginTop: "2px" }}>
                  {trait.hint}
                </span>
              </span>
              <b>
                {trait.value.toFixed(1)}
                <small> / 5.0</small>
              </b>
            </div>
            <div className="bar-track" aria-hidden="true">
              <i className="mint" style={{ width: `${Math.min(trait.value * 20, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function InstitutionDashboard() {
  const { signOut } = useClerk();
  const { user, isSignedIn } = useUser();
  const [filters, setFilters] = useState<GetInstitutionDashboardParams>({});
  const query = useGetInstitutionDashboard(filters, {
    query: { queryKey: getGetInstitutionDashboardQueryKey(filters) },
  });

  const isDev = import.meta.env.DEV;
  const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  const isAdmin = Boolean(
    userEmail &&
    (userEmail.includes("admin") || userEmail.includes("dean") || userEmail.endsWith("@hitam.org") || userEmail === "mohith0756@gmail.com")
  );
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const allowPreview = isPreviewAccessAllowed({ isDev, isSignedIn: Boolean(isSignedIn), isAdmin });
  const { data, isPreview } = resolveDashboardData({
    databaseData: query.data,
    queryParamPreview: searchParams?.get("preview"),
    allowPreviewOverrides: allowPreview,
    filters,
  });

  const changeFilter = (key: keyof GetInstitutionDashboardParams, value: string) =>
    setFilters((current) => ({ ...current, [key]: value || undefined }));

  const hasActiveFilters = Boolean(filters.department || filters.year || filters.batch);

  // Compute evidence-based diversity summary
  const computeDiversitySummary = () => {
    if (!data || !data.trackDistribution.length || data.completedReports === 0) return null;
    const sorted = [...data.trackDistribution].sort((a, b) => b.count - a.count);
    const top = sorted[0];
    const topPct = Math.round((top.count / data.completedReports) * 100);
    const trackCount = data.trackDistribution.length;

    if (trackCount === 1) {
      return `All ${data.completedReports} completed student reports currently align with the ${top.label} cluster (100%). Faculty advising can focus deeply on this pathway while introducing adjacent options.`;
    }

    if (topPct >= 50) {
      return `Cohort indicates primary concentration in ${top.label} (${top.count} of ${data.completedReports} students, ${topPct}%), with remaining students distributed across ${trackCount - 1} other distinct career areas. This provides clear focus for core placement tracks alongside targeted support for specialized roles.`;
    }

    return `Cohort pathways span ${trackCount} distinct career clusters. The leading area is ${top.label} (${top.count} students, ${topPct}%), accompanied by ${sorted.slice(1, 3).map((s) => `${s.label} (${s.count} students, ${Math.round((s.count / data.completedReports) * 100)}%)`).join(" and ")}.`;
  };

  return (
    <PageFrame>
      <header className="topbar dashboard-topbar">
        <Brand />
        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          <span className="nav-current">
            <BarChart3 size={15} /> Faculty insights
          </span>
          <Link href="/" className="quiet-link">
            Student discovery
          </Link>
        </nav>
        <button
          className="admin-pill"
          onClick={() => signOut({ redirectUrl: "/" })}
          data-testid="button-admin-signout"
          title="Sign out of faculty view"
        >
          <span className="admin-initials">H</span>
          HITAM faculty <ChevronDown size={13} />
        </button>
      </header>

      <main className="dashboard-main">
        {/* ── INTRO HEADER ── */}
        <div className="dash-intro">
          <div>
            <span className="eyebrow">
              {isPreview
                ? "CAREER PATHFINDER · ISOLATED TEST FIXTURE (5 COMPLETED REPORTS)"
                : "CAREER PATHFINDER · HITAM FACULTY INSIGHTS"}
            </span>
            <h1>
              {data?.institutionName || "HITAM"}
              <br />
              <em>in focus.</em>
            </h1>
            <p>
              Aggregated institutional patterns from verified student discovery assessments. Guides curriculum emphasis,
              academic advising, and industry partnership planning without exposing individual student records.
            </p>
          </div>
          <div className="privacy-seal" role="status">
            <ShieldCheck size={18} />
            <span>
              PRIVACY BY DESIGN
              <br />
              COHORT AGGREGATES ONLY
            </span>
          </div>
        </div>

        {/* ── COHORT FILTER STRIP (PRIORITY D) ── */}
        <section className="filter-strip" aria-label="Cohort filters">
          <div className="filter-title">FILTER COHORT</div>
          <label>
            Department
            <select
              value={filters.department || ""}
              onChange={(e) => changeFilter("department", e.target.value)}
              data-testid="filter-department"
            >
              <option value="">All departments</option>
              {data?.departmentOptions?.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label>
            Academic Year
            <select
              value={filters.year || ""}
              onChange={(e) => changeFilter("year", e.target.value)}
              data-testid="filter-year"
            >
              <option value="">All academic years</option>
              {data?.yearOptions?.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label>
            Batch
            <select
              value={filters.batch || ""}
              onChange={(e) => changeFilter("batch", e.target.value)}
              data-testid="filter-batch"
            >
              <option value="">All graduation batches</option>
              {data?.batchOptions?.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          {hasActiveFilters && (
            <button
              className="clear-filters"
              onClick={() => setFilters({})}
              data-testid="button-clear-filters"
            >
              Clear filters
            </button>
          )}
        </section>

        {/* ── QUERY STATES ── */}
        {query.isLoading && !data ? (
          <div className="dashboard-loading" aria-label="Loading dashboard insights">
            <div className="skeleton skeleton-title" />
            <div className="metric-skeletons">
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
            <div className="chart-skeletons">
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          </div>
        ) : query.isError && !data ? (
          (query.error as { status?: number }).status === 403 ? (
            <section className="access-denied" role="alert">
              <div className="auth-icon">
                <ShieldAlert size={22} />
              </div>
              <span className="eyebrow">FACULTY AUTHORIZATION REQUIRED</span>
              <h1>This view is for authorized HITAM faculty administrators.</h1>
              <p>
                Student reports remain private and individual. Access to cohort analytics is restricted to designated
                career and departmental administrators.
              </p>
              <Link href="/" className="button button-primary">
                Return to student discovery
              </Link>
            </section>
          ) : (
            <section className="error-panel dash-error" role="alert">
              <CircleAlert size={20} />
              <h2>Insights aren’t available right now.</h2>
              <p>We encountered a connection issue while compiling cohort analytics. Please retry.</p>
              <button
                className="button button-subtle"
                onClick={() => query.refetch()}
                data-testid="button-retry-dashboard"
              >
                <RefreshCw size={15} /> Retry
              </button>
            </section>
          )
        ) : !data || data.totalStudents === 0 ? (
          <section className="dashboard-empty">
            <Users size={32} />
            <span className="eyebrow">NO SUBMISSIONS MATCH FILTER</span>
            <h2>No completed assessments found.</h2>
            <p>
              No student submissions match this cohort filter combination. Broaden the filter criteria or check back
              after students complete their discovery.
            </p>
            {hasActiveFilters && (
              <button
                className="button button-primary"
                onClick={() => setFilters({})}
                data-testid="button-reset-dashboard-filters"
              >
                Show all cohorts
              </button>
            )}
          </section>
        ) : (
          <>
            {/* ── PRIORITY A: INSTITUTION OVERVIEW ── */}
            <section className="dashboard-section" aria-label="Institution overview">
              <div className="dashboard-section-header">
                <span className="eyebrow">PRIORITY A · INSTITUTION OVERVIEW</span>
                <h2>Cohort scale and report completion</h2>
                <p>
                  High-level participation metrics. Totals distinguish between registered student submissions and fully
                  completed diagnostic reports.
                </p>
              </div>

              <div className="metric-grid">
                <article className="metric-card metric-feature">
                  <div className="metric-icon">
                    <Users size={18} />
                  </div>
                  <span className="metric-label">STUDENTS ASSESSED</span>
                  <strong>{data.totalStudents.toLocaleString()}</strong>
                  <small>Total submissions in selected cohort</small>
                  <div className="metric-footnote">Registered and verified students</div>
                </article>

                <article className="metric-card">
                  <span className="metric-label">REPORTS COMPLETED</span>
                  <strong>{data.completedReports.toLocaleString()}</strong>
                  <small>
                    <span className="metric-dot mint-dot" />{" "}
                    {data.totalStudents > 0
                      ? Math.round((data.completedReports / data.totalStudents) * 100)
                      : 0}
                    % completion rate ({data.completedReports}/{data.totalStudents})
                  </small>
                  <div className="metric-footnote">Fully generated reports</div>
                </article>

                {data.dataSuppressed ? (
                  <article
                    className="metric-card metric-card-protected"
                    aria-label="Career Clusters: Privacy protected. Requires at least 5 completed reports."
                    data-testid="kpi-career-clusters-protected"
                  >
                    <span className="metric-label">Career Clusters</span>
                    <div className="kpi-protected-badge" role="status">
                      <ShieldCheck size={15} aria-hidden="true" />
                      <span>Protected</span>
                    </div>
                    <small>
                      <span className="metric-dot amber-dot" aria-hidden="true" /> Unique career areas represented
                    </small>
                    <div className="metric-footnote">
                      Requires ≥5 completed reports ({data.completedReports} of 5 available)
                    </div>
                  </article>
                ) : (
                  <a
                    href="#career-clusters-chart"
                    className="metric-card metric-card-interactive"
                    aria-label={`Career Clusters: ${data.trackDistribution.length} unique career areas represented. Jump to career clusters distribution chart.`}
                    title="Jump to career clusters distribution chart"
                    data-testid="kpi-career-clusters"
                  >
                    <span className="metric-label">Career Clusters</span>
                    <strong>{data.trackDistribution.length.toLocaleString()}</strong>
                    <small>
                      <span className="metric-dot gold-dot" aria-hidden="true" /> Unique career areas represented
                    </small>
                    <div className="metric-footnote metric-jump-hint">
                      View distribution chart <span aria-hidden="true">↓</span>
                    </div>
                  </a>
                )}

                <article className="metric-card">
                  <span className="metric-label">PROCESSING QUEUE</span>
                  <strong>
                    {(data.statusCounts.pending + data.statusCounts.processing).toLocaleString()}
                  </strong>
                  <small>
                    {data.statusCounts.failed > 0 ? (
                      <>
                        <span className="metric-dot coral-dot" /> {data.statusCounts.failed} require retry
                      </>
                    ) : (
                      <>
                        <span className="metric-dot mint-dot" /> All pipelines nominal
                      </>
                    )}
                  </small>
                  <div className="metric-footnote">Real-time worker status</div>
                </article>
              </div>
            </section>

            {/* ── PRIVACY THRESHOLD HANDLING ── */}
            {data.dataSuppressed ? (
              <section className="suppression-notice" role="status" aria-live="polite">
                <div className="suppression-icon">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <span className="section-label">MINIMUM COHORT PRIVACY THRESHOLD ACTIVE</span>
                  <h2>Detailed cohort distributions are temporarily protected.</h2>
                  <p>
                    To ensure individual student confidentiality and prevent inferring individual answers, detailed
                    breakdowns (career distributions, skill gaps, trait averages, and tensions) require a minimum cohort
                    size of <strong>5 completed reports</strong>. The current filtered cohort contains{" "}
                    <strong>{data.completedReports} of 5 required reports</strong>.
                  </p>
                  <p style={{ marginTop: "10px" }}>
                    Broaden your department, year, or batch filters to view aggregated patterns across larger cohorts,
                    or check back once additional students finalize their discovery.
                  </p>
                  {hasActiveFilters && (
                    <button
                      className="button button-subtle"
                      onClick={() => setFilters({})}
                      style={{ marginTop: "16px" }}
                      data-testid="button-reset-suppression-filters"
                    >
                      Show all cohorts
                    </button>
                  )}
                </div>
              </section>
            ) : (
              <>
                {/* ── PRIORITY B: CAREER DISTRIBUTION & DIVERSITY ── */}
                <section className="dashboard-section" aria-label="Career distribution and diversity">
                  <div className="dashboard-section-header">
                    <span className="eyebrow">PRIORITY B · CAREER DISTRIBUTION & DIVERSITY</span>
                    <h2>Primary career pathways and student aspirations</h2>
                    <p>
                      Distribution of recommended technical tracks and target career roles across the cohort. Reflects
                      students’ diagnosed aptitudes and genuine working style preferences.
                    </p>
                  </div>

                  <div className="dashboard-charts">
                    <DistributionBars
                      id="career-clusters-chart"
                      title="Recommended career clusters"
                      description="Broad career categories represented across cohort results. Normalized across technical, product, operations, and business pathways based on diagnosed student traits."
                      items={data.trackDistribution}
                      total={data.completedReports}
                      tint="gold"
                      icon={Layers}
                    />

                    <DistributionBars
                      title="Top target career aspirations"
                      description="Most frequent long-term target roles students are building capability toward."
                      items={data.topCareers}
                      total={data.completedReports}
                      tint="mint"
                      icon={Compass}
                    />
                  </div>

                  {/* Diversity Analysis Card */}
                  {computeDiversitySummary() && (
                    <div className="dash-card" style={{ marginBottom: "24px" }}>
                      <div className="dash-card-heading">
                        <div>
                          <span className="section-label">COHORT DIVERSITY OBSERVATION</span>
                          <h2>Concentration and interest spread</h2>
                        </div>
                        <TrendingUp size={18} />
                      </div>
                      <p style={{ color: "var(--cp-text-secondary, #3D4439)", fontSize: "14px", lineHeight: "1.7", margin: 0 }}>
                        {computeDiversitySummary()}
                      </p>
                    </div>
                  )}
                </section>

                {/* ── PRIORITY C: READINESS & SHARED SKILL GAPS ── */}
                <section className="dashboard-section" aria-label="Readiness and shared skill gaps">
                  <div className="dashboard-section-header">
                    <span className="eyebrow">PRIORITY C · READINESS & SHARED SKILL GAPS</span>
                    <h2>Capability requirements and fresher entry routes</h2>
                    <p>
                      Recurring preparation needs extracted directly from student report roadmaps and diagnostic gap
                      analyses. Identifies where faculty and departmental support will yield the highest placement impact.
                    </p>
                  </div>

                  <div className="dashboard-charts">
                    {/* Top skills students are building toward */}
                    <section className="dash-card">
                      <div className="dash-card-heading">
                        <div>
                          <span className="section-label">SKILL AGGREGATION</span>
                          <h2>Skills students are building toward</h2>
                        </div>
                        <Wrench size={18} />
                      </div>
                      <p className="dash-card-description">
                        Most frequent skills appearing on student milestone roadmaps and capability gap plans.
                      </p>
                      {data.topSkills.length ? (
                        <div className="skill-rankings">
                          {data.topSkills.map((item, i) => (
                            <div key={`${item.skill}-${i}`}>
                              <span className="rank-no">0{i + 1}</span>
                              <b>{item.skill}</b>
                              <span>
                                {item.count} student {item.count === 1 ? "roadmap" : "roadmaps"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="chart-empty">No recurring skill patterns surfaced in this cohort yet.</p>
                      )}
                    </section>

                    {/* Common Fresher Entry Roles */}
                    <DistributionBars
                      title="Common fresher entry roles"
                      description="Accessible first-step roles that provide practical industry entry without unreasonable pedigree barriers."
                      items={data.entryRoles}
                      total={data.completedReports}
                      tint="mint"
                      icon={Briefcase}
                    />

                    {/* Market Barrier Distribution */}
                    <DistributionBars
                      title="Market barrier levels for target paths"
                      description="Degree of market friction, experience prerequisites, and credential screening on student target roles."
                      items={data.marketBarrierDistribution}
                      total={data.completedReports}
                      tint="coral"
                      icon={ShieldAlert}
                    />

                    {/* Long-Term Caliber Directions */}
                    <DistributionBars
                      title="Long-term caliber targets"
                      description="Ultimate career ceiling and senior milestones students aspire to achieve within 5–7 years."
                      items={data.longTermCaliberDistribution}
                      total={data.completedReports}
                      tint="gold"
                      icon={GraduationCap}
                    />
                  </div>
                </section>

                {/* ── PRIORITY D: COHORT INSIGHTS & SUGGESTED ACTIONS ── */}
                <section className="dashboard-section" aria-label="Cohort insights and suggested actions">
                  <div className="dashboard-section-header">
                    <span className="eyebrow">PRIORITY D · COHORT INSIGHTS & SUGGESTED ACTIONS</span>
                    <h2>Working styles, behavioral tensions, and institutional actions</h2>
                    <p>
                      Synthesized cohort characteristics and actionable interventions derived from real student
                      assessment signals.
                    </p>
                  </div>

                  <div className="dashboard-charts">
                    {/* Student work styles */}
                    <DistributionBars
                      title="Diagnosed work archetypes"
                      description="Primary behavioral persona: Builder (execution), Operator (systems), Specialist (deep domain), etc."
                      items={data.workerTypeDistribution}
                      total={data.completedReports}
                      tint="gold"
                      icon={Users}
                    />

                    {/* Average trait profile */}
                    <TraitAveragesProfile values={data.traitAverages} />

                    {/* Student clarity across cohort */}
                    <DistributionBars
                      title="Directional clarity across cohort"
                      description="Confidence level in career direction prior to completing Pathfinder diagnostic."
                      items={data.clarityDistribution}
                      total={data.completedReports}
                      tint="coral"
                      icon={Signpost}
                    />

                    {/* Frequent Answer Tensions */}
                    <section className="dash-card">
                      <div className="dash-card-heading">
                        <div>
                          <span className="section-label">DIAGNOSTIC TENSIONS</span>
                          <h2>Frequent answer tensions</h2>
                        </div>
                        <Signpost size={18} />
                      </div>
                      <p className="dash-card-description">
                        Identifies where student ambitions and stated work preferences exhibit underlying contradictions.
                      </p>
                      {data.commonConflicts.length ? (
                        <div className="conflict-list">
                          {data.commonConflicts.map((item, i) => (
                            <article key={`${item.tag}-${i}`}>
                              <div>
                                <span>{item.tag}</span>
                                <b>{item.count} students</b>
                              </div>
                              <p>{item.text}</p>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="chart-empty">No recurring answer tensions surfaced in this cohort.</p>
                      )}
                    </section>
                  </div>

                  {/* Suggested Faculty Interventions (Evidence-Linked) */}
                  <div className="dash-card" style={{ marginTop: "16px" }}>
                    <div className="dash-card-heading">
                      <div>
                        <span className="section-label">INSTITUTIONAL RECOMMENDATIONS</span>
                        <h2>Suggested faculty interventions</h2>
                      </div>
                      <Lightbulb size={18} />
                    </div>
                    <p className="dash-card-description">
                      Concrete institutional initiatives linked directly to the aggregate patterns observed in this
                      cohort.
                    </p>

                    <div className="action-cards">
                      <article className="action-card">
                        <span className="badge">
                          <Wrench size={12} /> CURRICULUM SUPPORT
                        </span>
                        <h3>Reinforce high-frequency roadmap skills</h3>
                        <p>
                          Introduce practical mini-projects or hands-on laboratory modules addressing the top requested
                          skills:{" "}
                          <strong>
                            {data.topSkills.slice(0, 2).map((s) => s.skill).join(", ") || "core technical capabilities"}
                          </strong>
                          .
                        </p>
                        <div className="evidence">
                          Linked to {data.topSkills[0]?.count || 0} student roadmap requirements
                        </div>
                      </article>

                      <article className="action-card">
                        <span className="badge">
                          <Briefcase size={12} /> PLACEMENT STRATEGY
                        </span>
                        <h3>Partner with employers hiring for entry roles</h3>
                        <p>
                          Prioritize recruitment partnerships and campus drives that recruit directly for stepping-stone
                          roles:{" "}
                          <strong>
                            {data.entryRoles.slice(0, 2).map((r) => r.label).join(", ") || "entry stepping stones"}
                          </strong>
                          .
                        </p>
                        <div className="evidence">
                          Provides realistic entry into {data.trackDistribution[0]?.label || "target clusters"}
                        </div>
                      </article>

                      <article className="action-card">
                        <span className="badge">
                          <Compass size={12} /> ADVISING & MENTORSHIP
                        </span>
                        <h3>Address directional ambiguity & tensions</h3>
                        <p>
                          Schedule focused departmental mentoring sessions for students exhibiting moderate/low clarity
                          or conflicting risk-reward preferences.
                        </p>
                        <div className="evidence">
                          Addresses {data.commonConflicts.length} surfaced tension themes
                        </div>
                      </article>
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {/* ── FOOTER TRUST BANNER ── */}
        <footer className="dashboard-footer">
          <span>
            <ShieldCheck size={14} /> HITAM Institution view contains cohort aggregates only.
          </span>
          <span>Individual student names, emails, raw answers, and full reports are never accessible here.</span>
        </footer>
      </main>
    </PageFrame>
  );
}
