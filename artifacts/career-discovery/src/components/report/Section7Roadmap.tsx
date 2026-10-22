import React from "react";
import type { RoadmapMilestone } from "@workspace/api-client-react";
import { Calendar, CheckSquare, PackageCheck, AlertCircle } from "lucide-react";

export function Section7Roadmap({
  roadmap,
}: {
  roadmap: RoadmapMilestone[];
}) {
  const sortedMilestones = [...(roadmap ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <section id="section-roadmap" className="report-section-block" data-testid="section-roadmap">
      <header className="section-header">
        <div className="section-label">07 · A PRACTICAL YEAR</div>
        <h2>12-Month execution roadmap</h2>
        <p className="section-desc">
          Structured progression from foundations to practical deliverables, portfolio proof, and job readiness.
        </p>
      </header>

      <div className="roadmap-timeline-container" data-testid="roadmap-timeline">
        {sortedMilestones.map((milestone, idx) => (
          <article
            key={milestone.order ?? idx}
            className="milestone-timeline-item"
            data-testid={`milestone-item-${milestone.order ?? idx + 1}`}
          >
            {/* Timeline Column */}
            <div className="timeline-node-col">
              <div className="timeline-circle">
                <span>0{milestone.order ?? idx + 1}</span>
              </div>
              {idx < sortedMilestones.length - 1 && <div className="timeline-line" />}
            </div>

            {/* Content Card */}
            <div className="milestone-card">
              <div className="milestone-card-header">
                <div className="milestone-range-badge">
                  <Calendar size={13} className="inline mr-1" />
                  <span>{milestone.monthRange}</span>
                </div>
                <h3 className="milestone-focus">{milestone.focus}</h3>
              </div>

              <div className="milestone-details-grid">
                {/* Actions */}
                <div className="milestone-subblock actions-subblock">
                  <div className="subblock-heading">
                    <CheckSquare size={13} className="text-primary" />
                    <span>KEY ACTION STEPS</span>
                  </div>
                  <ul className="actions-list">
                    {(milestone.actions ?? []).map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </div>

                {/* Measurable Deliverables */}
                <div className="milestone-subblock outputs-subblock">
                  <div className="subblock-heading">
                    <PackageCheck size={13} className="text-secondary" />
                    <span>MEASURABLE OUTPUTS</span>
                  </div>
                  <ul className="outputs-list">
                    {(milestone.measurableOutputs ?? []).map((output, i) => (
                      <li key={i}>{output}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="roadmap-disclaimer-box">
        <AlertCircle size={15} className="text-muted-foreground flex-shrink-0" />
        <p>
          Milestones are calibrated to realistic student study hours and build demonstrable capability.
          Completing a milestone provides evidence of skill for hiring managers, not a guaranteed employment outcome.
        </p>
      </div>
    </section>
  );
}
