import React from "react";
import type {
  CareerReport,
  LegacyCareerReport,
  CareerFit,
  TraitScore,
  CareerSubmissionResult,
} from "@workspace/api-client-react";
import { ArrowUpRight, Compass, Flame, Sparkles } from "lucide-react";
import { CareerPath } from "../components/CareerPath";
import { isNewReport } from "../lib/reportShape";
import { ReportNav } from "../components/report/ReportNav";
import { Section1Profile } from "../components/report/Section1Profile";
import { Section2Strengths } from "../components/report/Section2Strengths";
import { Section3Readiness } from "../components/report/Section3Readiness";
import { Section4Options } from "../components/report/Section4Options";
import { Section5ActionPlan } from "../components/report/Section5ActionPlan";

/* Legacy Report Helpers */
function TraitRow({ name, trait }: { name: string; trait: TraitScore }) {
  return (
    <div className="trait-row">
      <div className="trait-heading">
        <strong>{name}</strong>
        <span>
          {trait.label} · {trait.score}/5
        </span>
      </div>
      <div className="trait-track" aria-label={`${name}: ${trait.score} out of 5`}>
        <i style={{ width: `${trait.score * 20}%` }} />
      </div>
      <p>{trait.reason}</p>
    </div>
  );
}

function CareerCard({ career, index }: { career: CareerFit; index: number }) {
  return (
    <article className="career-card" data-testid={`card-career-fit-${index}`}>
      <div className="career-card-head">
        <span className="career-index">0{index + 1}</span>
        <div>
          <h3>{career.title}</h3>
          <span className="career-role">{career.roleType}</span>
        </div>
        <span className="fit-score">
          {career.naturalFitScore}
          <small>/10</small>
        </span>
      </div>
      <p className="career-daily">{career.dailyWork}</p>
      <p>{career.whyFits}</p>
      <div className="career-meta">
        <span>
          {career.salaryInrLpa
            ? `₹${career.salaryInrLpa.min}–${career.salaryInrLpa.max} LPA`
            : "Salary data unavailable"}
        </span>
        <span>{career.entryDifficulty}</span>
        <span>{career.careerHealth}</span>
        <span>AI exposure: {career.aiThreat}</span>
      </div>
      <div className="growth-line">
        <ArrowUpRight size={15} /> {career.fiveYearGrowth}
      </div>
    </article>
  );
}

/**
 * Production-Grade 5-Section Canonical Career Report.
 * Rendered whenever the report satisfies the canonical 5-section contract.
 */
function NewReportDetail({
  report,
  strategy,
}: {
  report: CareerReport;
  strategy?: CareerSubmissionResult["strategy"];
}) {
  return (
    <div className="report-detail report-redesign" data-testid="report-new">
      {/* Quick-Jump Navigation Index */}
      <ReportNav />

      {/* Section 1 — Your Career Profile */}
      <Section1Profile
        profile={report.profile}
        workArchetype={report.workArchetype}
        answerPatterns={report.answerPatterns}
      />

      {/* Section 2 — Strengths and Working Style */}
      <Section2Strengths
        traits={report.traits}
        profile={report.profile}
        answerPatterns={report.answerPatterns}
      />

      {/* Section 3 — Your Current Readiness */}
      <Section3Readiness
        caliberVsEntry={report.caliberVsEntry}
        careerDirection={report.careerDirection}
        longTermOptions={report.longTermOptions}
        entryOptions={report.entryOptions}
        careerComparison={report.careerComparison}
        recommendedWorkLane={report.recommendedWorkLane}
        profile={report.profile}
      />

      {/* Section 4 — Compare Your Career Options */}
      <Section4Options
        longTermOptions={report.longTermOptions}
        entryOptions={report.entryOptions}
        careerComparison={report.careerComparison}
      />

      {/* Section 5 — Your Action Plan & Mentor Guidance */}
      <Section5ActionPlan
        roadmap={report.roadmap}
        mentorNote={report.mentorNote}
      />
    </div>
  );
}

/**
 * Legacy Report Renderer (Preserves Historical Compatibility).
 * Rendered when inspecting pre-Phase 3 submissions without data loss or mutation.
 */
function LegacyReportDetail({
  report,
  strategy,
}: {
  report: LegacyCareerReport;
  strategy?: CareerSubmissionResult["strategy"];
}) {
  return (
    <div className="report-detail" data-testid="report-legacy">
      <section className="report-hero">
        <div className="report-kicker">
          <Sparkles size={15} /> YOUR CAREER READOUT
        </div>
        <h1>{report.profile.archetype}</h1>
        <p className="report-summary">{report.profile.summary}</p>
        <div className="profile-tags">
          <span>{report.profile.workerType}</span>
          <span>{report.profile.clarityLevel} clarity</span>
        </div>
      </section>
      <section className="report-section profile-grid">
        <div className="report-card">
          <div className="section-label">01 · YOUR WORKING PROFILE</div>
          <h2>What seems to fit</h2>
          <p>{report.profile.summary}</p>
          <div className="inline-note">
            <Compass size={16} /> {report.profile.survivalEnvironment}
          </div>
        </div>
        <div className="report-card">
          <div className="section-label">WHAT YOU BRING</div>
          <h3>Strengths</h3>
          <ul>
            {report.profile.strengths.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <h3 className="subhead">Things to watch</h3>
          <ul className="risk-list">
            {report.profile.risks.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="report-section report-card">
        <div className="section-label">02 · TRAIT RATINGS</div>
        <h2>Your patterns, not a scorecard</h2>
        <div className="traits-grid">
          <TraitRow name="Technical inclination" trait={report.traits.technical} />
          <TraitRow name="Creative drive" trait={report.traits.creative} />
          <TraitRow name="People orientation" trait={report.traits.people} />
          <TraitRow name="Risk appetite" trait={report.traits.risk} />
          <TraitRow name="Learning agility" trait={report.traits.learning} />
        </div>
      </section>
      <section className="report-section pattern-grid">
        <div className="report-card">
          <div className="section-label">03 · CLEAR PATTERNS</div>
          <h2>What repeats</h2>
          <ul>
            {report.answerPatterns.clear.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="report-card tension-card">
          <div className="section-label">TENSIONS WORTH NOTICING</div>
          <h2>Where answers pull apart</h2>
          {report.answerPatterns.conflicts.map((x, i) => (
            <div className="conflict-item" key={i}>
              <b>{x.tag}</b>
              <p>{x.text}</p>
            </div>
          ))}
        </div>
        <div className="report-card">
          <div className="section-label">LOOK AGAIN</div>
          <h2>Worth exploring</h2>
          <ul>
            {report.answerPatterns.worthExploring.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="report-section caliber-card">
        <div className="section-label">04 · CALIBER VS. ENTRY REALITY</div>
        <h2>Think long-term. Start realistically.</h2>
        <div className="caliber-flow">
          <div>
            <span>YOUR LONG-TERM CALIBER</span>
            <p>{report.caliberVsEntry.longTermCaliber}</p>
          </div>
          <div>
            <span>WHY IT MAY TAKE TIME</span>
            <span
              className={`barrier-level barrier-${report.caliberVsEntry.marketBarrierLevel.toLowerCase()}`}
            >
              Market barrier · {report.caliberVsEntry.marketBarrierLevel}
            </span>
            <p>{report.caliberVsEntry.marketBarrier}</p>
          </div>
          <div>
            <span>REALISTIC FIRST STEP</span>
            {report.caliberVsEntry.firstEntryRoles.map((x, i) => (
              <p key={i}>{x}</p>
            ))}
          </div>
          <div>
            <span>THE BRIDGE</span>
            <p>{report.caliberVsEntry.bridgePath}</p>
          </div>
        </div>
      </section>
      <CareerPath strategy={strategy} />
      <section className="report-section">
        <div className="section-title-row">
          <div>
            <div className="section-label">05 · CAREER FITS</div>
            <h2>Roles worth taking seriously</h2>
          </div>
          <span className="small-note">
            Salary details appear only when verified data is configured.
          </span>
        </div>
        <div className="career-list">
          {report.careerFits.map((career, i) => (
            <CareerCard key={`${career.title}-${i}`} career={career} index={i} />
          ))}
        </div>
      </section>
      <section className="report-section avoid-panel">
        <div className="section-label">06 · NOT EVERY PATH IS YOUR PATH</div>
        <h2>Careers to think twice about</h2>
        <div className="avoid-list">
          {report.careersToAvoid.map((career, i) => (
            <article key={i}>
              <Flame size={16} />
              <div>
                <h3>{career.title}</h3>
                <p>{career.why}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="report-section track-panel">
        <div className="section-label">07 · YOUR BEST-FIT TECH TRACK</div>
        <span className="track-name">{report.recommendedTrack}</span>
        <p className="track-explanation">{report.trackDetail.why}</p>
        <div className="demand-line">
          Fresher demand <strong>{report.trackDetail.fresherDemand}</strong>
        </div>
        <h3>Skills to build</h3>
        <div className="skill-pills">
          {report.trackDetail.skillsToLearn.map((x, i) => (
            <span key={i}>{x}</span>
          ))}
        </div>
      </section>
      <section className="report-section roadmap-panel">
        <div className="section-label">08 · A PRACTICAL YEAR</div>
        <h2>Your 12-month roadmap</h2>
        <div className="roadmap-list">
          {report.roadmap.map((step, i) => (
            <article key={`${step.months}-${i}`}>
              <div className="roadmap-month">{step.months}</div>
              <div>
                <h3>{step.focus}</h3>
                <ul>
                  {step.actions.map((x, j) => (
                    <li key={j}>{x}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="report-section truth-panel">
        <div className="section-label">09 · THE CANDID PART</div>
        <h2>A mentor's honest read</h2>
        <p>{report.brutalTruth}</p>
      </section>
      <footer className="report-footer">
        This report is a guide, not a verdict. Use it to choose your next experiment.
      </footer>
    </div>
  );
}

export function ReportDetail({
  report,
  strategy,
}: {
  report: CareerReport | LegacyCareerReport;
  strategy?: CareerSubmissionResult["strategy"];
}) {
  if (isNewReport(report)) {
    return <NewReportDetail report={report} strategy={strategy} />;
  }
  return <LegacyReportDetail report={report as LegacyCareerReport} strategy={strategy} />;
}
