import React from "react";
import type { CareerSubmissionResult } from "@workspace/api-client-react";
import { ArrowDown, Compass, FlaskConical, Route as RouteIcon, Hourglass, GraduationCap, Shuffle } from "lucide-react";
import { getCareerPathState, getPathSteps, getRouteLabel } from "../lib/careerPathModel";

type CareerPathStrategy = NonNullable<CareerSubmissionResult["strategy"]>;

function WhyBlock({ label, text, testid }: { label: string; text: string; testid: string }) {
  return <div className="path-why-block"><span>{label}</span><p data-testid={testid}>{text}</p></div>;
}

function UnavailableState() {
  return <section className="report-section report-card path-panel" data-testid="career-path-unavailable">
    <div className="section-label">YOUR CAREER PATH</div><h2>Your career path isn't ready yet.</h2>
    <p>This report was generated before entry strategies were added. Your assessment answers are safe — retry the report to generate a fresh strategy.</p>
  </section>;
}

function InsufficientState({ strategy }: { strategy: CareerPathStrategy }) {
  return <section className="report-section report-card path-panel" data-testid="career-path-insufficient">
    <div className="section-label">YOUR CAREER PATH</div><h2>Your career path isn't ready yet.</h2>
    <p>{strategy.explanation.route}</p>
    <p>{strategy.explanation.target}</p>
  </section>;
}

export function CareerPath({ strategy }: { strategy: CareerPathStrategy | null | undefined }) {
  const state = getCareerPathState(strategy);
  if (state === "unavailable" || !strategy) return <UnavailableState />;
  if (state === "insufficient") return <InsufficientState strategy={strategy} />;

  const { steps, mergedTargetEntry } = getPathSteps(strategy);
  const routeLabel = getRouteLabel(strategy.routeType);

  return <section className="report-section report-card path-panel" data-testid={`career-path-${state}`}>
    <div className="section-label">YOUR CAREER PATH</div>
    <h2>What to aim for. How to enter.</h2>
    <div className="path-steps">
      {steps.map((step, i) => (
        <div key={`${step.kind}-${i}`}>
          {i > 0 && <div className="path-arrow" aria-hidden="true"><ArrowDown size={15} /></div>}
          <article className={`path-node path-node-${step.kind}`} data-testid={`path-step-${step.kind}`}>
            <span>{step.kind === "target" ? (mergedTargetEntry ? "TARGET & ENTRY" : "YOUR LONG-TERM DIRECTION") : step.kind === "bridge" ? "THE BRIDGE" : "BEST WAY TO ENTER"}</span>
            <h3>{step.title}</h3>
          </article>
        </div>
      ))}
    </div>
    <div className="path-route"><RouteIcon size={15} /><span data-testid="path-route-label">{routeLabel} ROUTE</span>{mergedTargetEntry && <small>No intermediate step is required.</small>}</div>
    <div className="path-why">
      <div className="section-label">WHY THIS PATH</div>
      <WhyBlock label="Target" text={strategy.explanation.target} testid="path-why-target" />
      <WhyBlock label="Entry" text={strategy.explanation.entry} testid="path-why-entry" />
      <WhyBlock label="Route" text={strategy.explanation.route} testid="path-why-route" />
      <div className="path-why-row">
        <div className="path-why-inline"><GraduationCap size={14} /><WhyBlock label="Academic fit" text={strategy.explanation.academic} testid="path-why-academic" /></div>
        <div className="path-why-inline"><Hourglass size={14} /><WhyBlock label="Time / runway" text={strategy.explanation.time} testid="path-why-time" /></div>
      </div>
    </div>
    {strategy.alternativeRoute && <div className="path-alternative" data-testid="path-alternative"><Shuffle size={14} /><div><span>ALTERNATIVE ROUTE</span><h4>{strategy.alternativeRoute.title}</h4>{strategy.explanation.alternative && <p>{strategy.explanation.alternative}</p>}</div></div>}
    {strategy.bridgeCareer && !mergedTargetEntry && state === "bridge" && <div className="path-note" data-testid="path-bridge-note"><Compass size={14} /><p>{strategy.explanation.bridge}</p></div>}
    {state === "adjacent" && <div className="path-note"><FlaskConical size={14} /><p>Adjacent routes build transferable experience — the entry role is a means, not the destination.</p></div>}
  </section>;
}
