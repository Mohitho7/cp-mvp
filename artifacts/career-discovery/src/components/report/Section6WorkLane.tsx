import React from "react";
import type { WorkLaneRecommendation, CareerSubmissionResult } from "@workspace/api-client-react";
import { Compass, Sparkles, Route, ArrowRight, Layers, Target, GraduationCap, Clock, Shuffle, Info } from "lucide-react";
import { formatRouteType } from "./formatters";

function getInsufficientContextNotice(strategy?: CareerSubmissionResult["strategy"]) {
  if (!strategy || !strategy.insufficientContext) return null;
  const targetRationale = strategy.rationale?.target ?? "";

  if (targetRationale.includes("degree context is missing")) {
    return {
      explanation: "Your assessment responses are saved, but your degree program was not specified.",
      nextStep: "Add your degree in student details to enable degree-aligned career pathways.",
    };
  }
  if (targetRationale.includes("weekly availability is invalid")) {
    return {
      explanation: "Weekly preparation availability was not provided or is invalid.",
      nextStep: "Specify your realistic weekly study hours to calculate accurate preparation timelines.",
    };
  }
  if (targetRationale.includes("no recognizable fit signals")) {
    return {
      explanation: "Your assessment answers did not contain sufficient distinctive signals to formulate high-confidence recommendations.",
      nextStep: "Consider retaking the assessment with more detailed responses.",
    };
  }
  return {
    explanation: strategy.explanation?.route || "Additional student context is needed to formulate a personalized strategic route.",
    nextStep: "Review your profile responses and student context to ensure complete information.",
  };
}

export function Section6WorkLane({
  recommendedWorkLane,
  strategy,
}: {
  recommendedWorkLane: WorkLaneRecommendation;
  strategy?: CareerSubmissionResult["strategy"];
}) {
  const routeMeta = formatRouteType(recommendedWorkLane.entryRoute?.routeType);
  const insufficientNotice = getInsufficientContextNotice(strategy);

  return (
    <section id="section-work-lane" className="report-section-block" data-testid="section-work-lane">
      <header className="section-header">
        <div className="section-label">06 · YOUR BEST-FIT WORK LANE</div>
        <h2>Your primary strategic direction</h2>
        <p className="section-desc">
          Synthesizing your top options and trade-offs into an actionable, cohesive professional lane.
        </p>
      </header>

      {insufficientNotice && (
        <aside className="insufficient-context-callout" data-testid="insufficient-context-notice">
          <div className="callout-header">
            <Info size={16} />
            <span>Additional Context Recommended</span>
          </div>
          <p className="callout-explanation">{insufficientNotice.explanation}</p>
          <p className="callout-next-step">
            <strong>Next step:</strong> {insufficientNotice.nextStep}
          </p>
        </aside>
      )}

      {/* Hero Work Lane Card */}
      <div className="hero-work-lane-card" data-testid="card-work-lane-recommendation">
        <div className="lane-header-row">
          <div className="lane-kicker">
            <Compass size={14} />
            <span>RECOMMENDED CAREER LANE</span>
          </div>
          <span className="strategic-priority-tag">Primary Strategic Recommendation</span>
        </div>

        <h3 className="lane-title" data-testid="report-recommended-lane">
          {recommendedWorkLane.lane}
        </h3>
        <p className="lane-why-summary">{recommendedWorkLane.why}</p>

        {/* Roles Alignment within Lane */}
        <div className="lane-roles-architecture">
          {/* Primary Career */}
          <div className="lane-role-column primary-column">
            <div className="col-label">
              <Target size={13} className="text-primary" />
              <span>PRIMARY CAREER TARGET</span>
            </div>
            <strong className="col-title" data-testid="lane-primary-career">
              {recommendedWorkLane.primaryCareer.title}
            </strong>
            <p className="col-sub">The anchor destination for this work lane.</p>
          </div>

          {/* Supporting Careers */}
          {Array.isArray(recommendedWorkLane.supportingCareers) &&
            recommendedWorkLane.supportingCareers.length > 0 && (
              <div className="lane-role-column supporting-column">
                <div className="col-label">
                  <Layers size={13} className="text-secondary" />
                  <span>SUPPORTING / ADJACENT ROLES</span>
                </div>
                <div className="supporting-roles-pills">
                  {recommendedWorkLane.supportingCareers.map((sc, i) => (
                    <span key={sc.id || i} className="supporting-pill">
                      {sc.title}
                    </span>
                  ))}
                </div>
                <p className="col-sub">Flexible adjacent tracks sharing overlapping capabilities.</p>
              </div>
            )}
        </div>

        {/* Realistic Entry Route */}
        {recommendedWorkLane.entryRoute && (
          <div className="lane-entry-route-box" data-testid="lane-entry-route">
            <div className="route-box-header">
              <div className="route-pill-badge">
                <Route size={13} />
                <span>{routeMeta.label}</span>
              </div>
              <span className="route-desc-small">{routeMeta.description}</span>
            </div>

            <div className="route-flow-diagram">
              {recommendedWorkLane.entryRoute.entryCareer.title === recommendedWorkLane.primaryCareer.title ? (
                <div className="flow-step destination-step direct-entry-step">
                  <span className="flow-label">DIRECT ENTRY MILESTONE</span>
                  <span className="flow-role">{recommendedWorkLane.primaryCareer.title}</span>
                </div>
              ) : (
                <>
                  <div className="flow-step entry-step">
                    <span className="flow-label">START HERE (DAY 1)</span>
                    <span className="flow-role">{recommendedWorkLane.entryRoute.entryCareer.title}</span>
                  </div>

                  {recommendedWorkLane.entryRoute.bridgeCareer && (
                    <>
                      <div className="flow-connector">
                        <ArrowRight size={13} />
                      </div>
                      <div className="flow-step bridge-step">
                        <span className="flow-label">INTERMEDIATE BRIDGE</span>
                        <span className="flow-role">{recommendedWorkLane.entryRoute.bridgeCareer.title}</span>
                      </div>
                    </>
                  )}

                  <div className="flow-connector">
                    <ArrowRight size={13} />
                  </div>

                  <div className="flow-step destination-step">
                    <span className="flow-label">LONG-TERM TARGET</span>
                    <span className="flow-role">{recommendedWorkLane.primaryCareer.title}</span>
                  </div>
                </>
              )}
            </div>

            <p className="route-rationale-text">{recommendedWorkLane.entryRoute.rationale}</p>
          </div>
        )}

        {/* Strategic Context from Strategy Engine (Academic, Runway, Alternative Route) */}
        {strategy && (strategy.explanation.academic || strategy.explanation.time || strategy.alternativeRoute) && (
          <div className="lane-strategy-context-box">
            <span className="context-box-heading">ADDITIONAL STRATEGY CONTEXT:</span>
            <div className="strategy-context-grid">
              {strategy.explanation.academic && (
                <div className="context-chip-block">
                  <GraduationCap size={14} className="text-primary flex-shrink-0" />
                  <div>
                    <strong>ACADEMIC FIT</strong>
                    <p>{strategy.explanation.academic}</p>
                  </div>
                </div>
              )}
              {strategy.explanation.time && (
                <div className="context-chip-block">
                  <Clock size={14} className="text-secondary flex-shrink-0" />
                  <div>
                    <strong>PREPARATION RUNWAY</strong>
                    <p>{strategy.explanation.time}</p>
                  </div>
                </div>
              )}
              {strategy.alternativeRoute && (
                <div className="context-chip-block alternative-block">
                  <Shuffle size={14} className="text-amber-400 flex-shrink-0" />
                  <div>
                    <strong>ALTERNATIVE CONSIDERED: {strategy.alternativeRoute.title}</strong>
                    <p>{strategy.explanation.alternative || "Ranked below the primary route."}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Narrative Strategic Explanation following Sections 4 & 5 */}
        {recommendedWorkLane.explanation && (
          <div className="lane-narrative-explanation">
            <span className="narrative-label">STRATEGIC RATIONALE (CONNECTING SECTIONS 4 & 5):</span>
            <p className="narrative-text">{recommendedWorkLane.explanation}</p>
          </div>
        )}
      </div>
    </section>
  );
}
