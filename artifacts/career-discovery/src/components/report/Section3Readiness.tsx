import React from "react";
import type {
  CaliberVsEntry,
  CareerDirection,
  LongTermCareerOption,
  EntryLevelCareerOption,
  CareerComparison,
  WorkLaneRecommendation,
  CareerProfile,
} from "@workspace/api-client-react";
import { Target, Footprints, Route, ShieldAlert, CheckCircle, ArrowRight, Clock, AlertCircle } from "lucide-react";
import { formatAccessibility, formatRouteType, formatRunway } from "./formatters";

export function Section3Readiness({
  caliberVsEntry,
  careerDirection,
  longTermOptions,
  entryOptions,
  careerComparison,
  recommendedWorkLane,
  profile,
}: {
  caliberVsEntry: CaliberVsEntry;
  careerDirection: CareerDirection | null;
  longTermOptions?: LongTermCareerOption[];
  entryOptions?: EntryLevelCareerOption[];
  careerComparison?: CareerComparison;
  recommendedWorkLane?: WorkLaneRecommendation;
  profile?: CareerProfile;
}) {
  const targetTitle =
    careerDirection?.target?.title ??
    recommendedWorkLane?.primaryCareer?.title ??
    longTermOptions?.[0]?.title ??
    "Target Career";
  const targetWhy =
    careerDirection?.target?.why ??
    recommendedWorkLane?.why ??
    longTermOptions?.[0]?.rationale ??
    "Strong composite alignment between your problem-solving strengths and career leverage.";
  const topLongTerm = longTermOptions?.[0];
  const targetScore = topLongTerm?.fitScore ?? topLongTerm?.score ?? null;
  const targetTradeoff =
    careerComparison?.longTerm?.[0]?.tradeOff ??
    profile?.risks?.[0] ??
    "Requires disciplined effort and deliberate capability building.";

  const entryTitle =
    careerDirection?.entry?.title ??
    recommendedWorkLane?.entryRoute?.entryCareer?.title ??
    entryOptions?.[0]?.title ??
    "Entry Role";
  const topEntry = entryOptions?.[0];
  const accessMeta = formatAccessibility(topEntry?.accessibility ?? null);
  const runwayText = formatRunway(topEntry?.runwayWeeks ?? null);
  const entryEvidence =
    careerDirection?.routeWhy ??
    recommendedWorkLane?.entryRoute?.rationale ??
    "Focusing on high-accessibility entry roles builds verifiable proof of competence for hiring managers.";

  const isDirect =
    careerDirection?.entry?.title === careerDirection?.target?.title ||
    careerDirection?.route === "DIRECT" ||
    recommendedWorkLane?.entryRoute?.entryCareer?.title === recommendedWorkLane?.primaryCareer?.title;

  const routeMeta = careerDirection ? formatRouteType(careerDirection.route) : null;

  // Alternative entry options (up to 2)
  const alternatives =
    Array.isArray(caliberVsEntry?.firstEntryRoles) && caliberVsEntry.firstEntryRoles.length > 1
      ? caliberVsEntry.firstEntryRoles.filter((r) => r.toLowerCase() !== entryTitle.toLowerCase()).slice(0, 2)
      : Array.isArray(entryOptions) && entryOptions.length > 1
      ? entryOptions.slice(1, 3).map((e) => e.title)
      : [];

  return (
    <section id="section-readiness" className="report-section-block" data-testid="section-readiness">
      <header className="section-header">
        <div className="section-label">03 · YOUR CAREER READINESS</div>
        <h2>Your recommended direction versus entry reality</h2>
        <p className="section-desc">
          Balancing your 3–5 year target destination with the practical day-one requirements of entering the market.
        </p>
      </header>

      {/* Grid: Long-Term Caliber Direction vs Realistic Day-One Entry */}
      <div className="readiness-comparison-grid">
        {/* A. Long-Term Direction */}
        <div className="readiness-card target-caliber-card" data-testid="card-readiness-target">
          <div className="readiness-card-kicker">
            <Target size={15} className="text-primary" />
            <span>A · LONG-TERM DIRECTION</span>
          </div>
          <div className="readiness-title-row">
            <h3 className="readiness-title" data-testid="report-direction-target">{targetTitle}</h3>
            {targetScore && (
              <span className="fit-pill" title="Problem-solving suitability score">
                {targetScore}% Match
              </span>
            )}
          </div>
          <p className="aim-why">{targetWhy}</p>

          <div className="tradeoff-callout">
            <div className="tradeoff-label">
              <AlertCircle size={13} className="text-amber-400" />
              <span>KEY CHALLENGE / TRADE-OFF:</span>
            </div>
            <p className="tradeoff-text">{targetTradeoff}</p>
          </div>
        </div>

        {/* B. Realistic Day-One Entry Route */}
        <div className="readiness-card entry-reality-card" data-testid="card-readiness-entry">
          <div className="readiness-card-kicker">
            <Footprints size={15} className="text-secondary" />
            <span>B · REALISTIC DAY-ONE ENTRY</span>
          </div>

          <div className="barrier-header">
            <span
              className={`barrier-tag barrier-${(caliberVsEntry.marketBarrierLevel || "moderate").toLowerCase()}`}
              data-testid="market-barrier-level"
            >
              Market Barrier: {caliberVsEntry.marketBarrierLevel}
            </span>
            <span className={`meta-chip chip-${accessMeta.tone}`}>
              {accessMeta.label}
            </span>
          </div>

          <div className="first-job-heading">
            <span className="subhead-label">RECOMMENDED FIRST JOB WEDGE:</span>
            <strong className="first-job-title" data-testid="report-direction-entry">{entryTitle}</strong>
          </div>

          <div className="runway-row">
            <Clock size={13} className="text-muted-foreground" />
            <span>Estimated runway: <strong>{runwayText}</strong></span>
          </div>

          <p className="market-barrier-text">{entryEvidence}</p>
        </div>
      </div>

      {/* C & D: Transition Pathway & Alternative Entry Roles */}
      <div className="bridge-strategy-card" data-testid="readiness-bridge">
        <div className="bridge-card-header">
          <Route size={16} className="text-primary" />
          <h4 className="bridge-card-title">Transition Bridge & Route Reality</h4>
        </div>

        <div className="route-details-box">
          <div className="route-summary-line">
            <span className="route-badge" data-testid="report-direction-route">
              {isDirect ? "Direct Route" : (routeMeta?.label ?? "Staged Bridge Route")}
            </span>
            <span className="route-entry-target">
              {isDirect ? (
                <span className="font-semibold text-primary" data-testid="direct-target-role">
                  {targetTitle} <span className="text-xs font-normal text-muted-foreground">(Direct Entry)</span>
                </span>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{entryTitle}</span>
                  <ArrowRight size={14} className="inline mx-2 text-muted-foreground" />
                  <span className="font-semibold text-primary">{targetTitle}</span>
                </>
              )}
            </span>
          </div>

          <p className="route-why-text">
            {isDirect
              ? "Direct route feasible: your profile indicates strong alignment with this role's core execution requirements. Focus directly on verified proof-of-work repositories."
              : (careerDirection?.routeWhy ?? caliberVsEntry.bridgePath)}
          </p>

          {/* C. Alternative entry options as compact labels */}
          {alternatives.length > 0 && (
            <div className="alt-entries-row" data-testid="readiness-alternatives">
              <span className="alt-label">ALTERNATIVE FIRST-JOB OPTIONS:</span>
              <div className="alt-chips-wrap">
                {alternatives.map((alt, i) => (
                  <span key={i} className="alt-role-chip">{alt}</span>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(careerDirection?.barriers) && careerDirection.barriers.length > 0 && (
            <div className="barriers-to-plan">
              <div className="barriers-header">
                <ShieldAlert size={14} className="text-amber-400" />
                <span>Entry barriers to proactively address:</span>
              </div>
              <ul className="barriers-list">
                {careerDirection.barriers.map((barrier, i) => (
                  <li key={i}>{barrier}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="timeline-disclaimer">
            <AlertCircle size={13} className="text-muted-foreground flex-shrink-0" />
            <span>
              Preparation timelines are calibrated estimates based on dedicated study hours, not a guarantee of employment or placement.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
