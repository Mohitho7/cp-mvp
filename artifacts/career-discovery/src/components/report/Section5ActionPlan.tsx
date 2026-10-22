import React, { useState } from "react";
import type { RoadmapMilestone, MentorNote } from "@workspace/api-client-react";
import {
  Calendar,
  CheckSquare,
  PackageCheck,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Eye,
  AlertTriangle,
  FlaskConical,
  ArrowRight,
} from "lucide-react";

interface StructuredPhase {
  id: number;
  monthRange: string;
  title: string;
  focus: string;
  deliverable: string;
  actions: string[];
}

/**
 * Maps the roadmap milestones into four approved chronological phases:
 * Phase 1: Months 1–3 — Build the foundations
 * Phase 2: Months 4–6 — Build and integrate
 * Phase 3: Months 7–9 — Solve a real problem
 * Phase 4: Months 10–12 — Prepare for market entry
 * Preserves all original domain-specific actions and deliverables without losing student data.
 */
function organizeRoadmapPhases(milestones: RoadmapMilestone[]): StructuredPhase[] {
  const sorted = [...(milestones ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const phaseDefinitions = [
    { id: 1, monthRange: "Months 1–3", title: "Build the foundations" },
    { id: 2, monthRange: "Months 4–6", title: "Build and integrate" },
    { id: 3, monthRange: "Months 7–9", title: "Solve a real problem" },
    { id: 4, monthRange: "Months 10–12", title: "Prepare for market entry" },
  ];

  // If 4 milestones exist, map 1:1; if 5 exist, combine months 7-9 and 10-12 or map gracefully
  return phaseDefinitions.map((def, idx) => {
    let focus = "";
    let actions: string[] = [];
    let deliverables: string[] = [];

    if (sorted.length === 4) {
      const m = sorted[idx];
      focus = m?.focus || def.title;
      actions = m?.actions ?? [];
      deliverables = m?.measurableOutputs ?? [];
    } else if (sorted.length >= 5) {
      if (idx === 0) {
        // Phase 1 (Months 1-3) takes Milestone 1 (Months 1-2)
        const m = sorted[0];
        focus = m?.focus || "Core tooling, foundational competencies, and execution discipline";
        actions = m?.actions ?? [];
        deliverables = m?.measurableOutputs ?? [];
      } else if (idx === 1) {
        // Phase 2 (Months 4-6) takes Milestone 2 (Months 3-4)
        const m = sorted[1];
        focus = m?.focus || "Intermediate skill application, core workflows, and practical deliverables";
        actions = m?.actions ?? [];
        deliverables = m?.measurableOutputs ?? [];
      } else if (idx === 2) {
        // Phase 3 (Months 7-9) takes Milestone 3 (Months 5-6)
        const m = sorted[2];
        focus = m?.focus || "Applying capabilities to end-to-end practical problems";
        actions = m?.actions ?? [];
        deliverables = m?.measurableOutputs ?? [];
      } else {
        // Phase 4 (Months 10-12) combines Milestones 4 & 5 (Months 7-9 and 10-12)
        const m4 = sorted[3];
        const m5 = sorted[4];
        focus = m5?.focus || m4?.focus || "Portfolio polish, verified proof-of-work, and market entry";
        actions = [...(m4?.actions ?? []), ...(m5?.actions ?? [])];
        deliverables = [...(m4?.measurableOutputs ?? []), ...(m5?.measurableOutputs ?? [])];
      }
    } else {
      const m = sorted[idx];
      focus = m?.focus || def.title;
      actions = m?.actions ?? [];
      deliverables = m?.measurableOutputs ?? [];
    }

    return {
      id: def.id,
      monthRange: def.monthRange,
      title: def.title,
      focus: focus || `${def.title} in your chosen pathway`,
      deliverable: deliverables[0] || "Documented milestone deliverable and practical proof of completion.",
      actions: actions.length > 0 ? actions : ["Complete targeted project milestones and verify deliverables."],
    };
  });
}

export function Section5ActionPlan({
  roadmap,
  mentorNote,
}: {
  roadmap: RoadmapMilestone[];
  mentorNote: MentorNote;
}) {
  const phases = organizeRoadmapPhases(roadmap);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([1])); // Phase 1 open by default

  const togglePhase = (id: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Immediate Next Action from Phase 1
  const immediateAction =
    roadmap?.[0]?.actions?.[0] ||
    phases[0]?.actions[0] ||
    "Establish your workspace, core toolchain, and initial milestone tracker.";
  const immediateDeliverable =
    roadmap?.[0]?.measurableOutputs?.[0] ||
    phases[0]?.deliverable ||
    "Initial verified milestone artifact demonstrating foundational competence.";

  return (
    <section id="section-action-plan" className="report-section-block" data-testid="section-action-plan">
      <header className="section-header">
        <div className="section-label">05 · YOUR ACTION PLAN & MENTOR GUIDANCE</div>
        <h2>Your 12-month roadmap</h2>
        <p className="section-desc">
          A structured 12-month execution progression from foundation building to portfolio proof, market readiness, and mentor feedback.
        </p>
      </header>

      {/* Immediate Next Action Banner */}
      <div className="immediate-action-banner" data-testid="immediate-next-action">
        <div className="action-banner-kicker">
          <Sparkles size={14} className="text-primary" />
          <span>IMMEDIATE NEXT ACTION · START HERE TODAY</span>
        </div>
        <div className="action-banner-content">
          <div className="action-main">
            <h3 className="action-title">{immediateAction}</h3>
            <p className="action-deliverable">
              Target deliverable: <strong>{immediateDeliverable}</strong>
            </p>
          </div>
          <div className="action-tagline">
            <span>Start with this single concrete step to test your interest and build early momentum.</span>
          </div>
        </div>
      </div>

      {/* Four Chronological Phases with Progressive Disclosure */}
      <div className="roadmap-phases-container" data-testid="roadmap-timeline">
        {phases.map((phase) => {
          const isExpanded = expandedPhases.has(phase.id);

          return (
            <article
              key={phase.id}
              className={`phase-card ${isExpanded ? "expanded" : ""}`}
              data-testid={`milestone-item-${phase.id}`}
            >
              <div className="phase-card-header">
                <div className="phase-range-pill">
                  <Calendar size={13} className="inline mr-1 text-primary" />
                  <span>{phase.monthRange}</span>
                </div>
                <div className="phase-title-block">
                  <span className="phase-eyebrow">PHASE 0{phase.id}</span>
                  <h3 className="phase-heading">{phase.title}</h3>
                </div>

                <button
                  type="button"
                  className="phase-toggle-btn"
                  onClick={() => togglePhase(phase.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`phase-details-${phase.id}`}
                  data-testid={`button-toggle-phase-${phase.id}`}
                >
                  <span>{isExpanded ? "Hide actions" : "View actions"}</span>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              <div className="phase-summary-body">
                <p className="phase-focus-text">
                  <strong>Focus:</strong> {phase.focus}
                </p>
                <div className="phase-deliverable-line">
                  <PackageCheck size={14} className="text-secondary flex-shrink-0" />
                  <span>
                    <strong>Measurable milestone:</strong> {phase.deliverable}
                  </span>
                </div>
              </div>

              {/* Expandable Action Steps */}
              {isExpanded && (
                <div
                  id={`phase-details-${phase.id}`}
                  className="phase-expanded-actions"
                  data-testid={`phase-actions-${phase.id}`}
                >
                  <div className="actions-header">
                    <CheckSquare size={13} className="text-primary" />
                    <span>KEY ACTION STEPS:</span>
                  </div>
                  <ul className="actions-list">
                    {phase.actions.map((act, i) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="roadmap-disclaimer-box">
        <AlertCircle size={15} className="text-muted-foreground flex-shrink-0" />
        <p>
          Milestones are calibrated to realistic student study hours and build demonstrable capability.
          Completing a milestone provides evidence of skill for hiring managers, not a guaranteed employment outcome.
        </p>
      </div>

      {/* Integrated Mentor Guidance (Compact Final Area) */}
      <div className="integrated-mentor-section" data-testid="section-mentor-note">
        <div className="mentor-section-header">
          <h3 className="mentor-section-heading">Mentor Guidance</h3>
          <p className="mentor-section-subtext">
            Honest feedback from a senior mentor: an observed pattern, a realistic risk, and a concrete experiment for the next four weeks.
          </p>
        </div>

        <div className="mentor-notes-triptych">
          {/* 1. Observed Pattern */}
          <div className="mentor-piece-card card-pattern" data-testid="mentor-pattern-card">
            <div className="piece-header">
              <div className="piece-icon-circle icon-pattern">
                <Eye size={16} />
              </div>
              <div>
                <span className="piece-kicker">OBSERVED PATTERN</span>
                <h4 className="piece-title">What your assessment consistently shows</h4>
              </div>
            </div>
            <p className="piece-body" data-testid="mentor-observed-pattern">
              {mentorNote.observedPattern}
            </p>
          </div>

          {/* 2. Realistic Risk */}
          <div className="mentor-piece-card card-risk" data-testid="mentor-risk-card">
            <div className="piece-header">
              <div className="piece-icon-circle icon-risk">
                <AlertTriangle size={16} />
              </div>
              <div>
                <span className="piece-kicker">REALISTIC RISK</span>
                <h4 className="piece-title">The trap or limitation to prepare for</h4>
              </div>
            </div>
            <p className="piece-body" data-testid="mentor-realistic-risk">
              {mentorNote.realisticRisk}
            </p>
          </div>

          {/* 3. Actionable Experiment */}
          <div className="mentor-piece-card card-experiment" data-testid="mentor-experiment-card">
            <div className="piece-header">
              <div className="piece-icon-circle icon-experiment">
                <FlaskConical size={16} />
              </div>
              <div>
                <span className="piece-kicker">CONCRETE 4-WEEK EXPERIMENT</span>
                <h4 className="piece-title">What to test in the next 4 weeks</h4>
              </div>
            </div>
            <p className="piece-body" data-testid="mentor-actionable-experiment">
              {mentorNote.actionableExperiment}
            </p>
          </div>
        </div>

        <footer className="mentor-report-footer">
          <p>
            Career Pathfinder is a strategic navigation instrument, not a deterministic verdict on your future.
            Use this guidance to select your next concrete project, test your assumptions, and adapt your plan as you grow.
          </p>
        </footer>
      </div>
    </section>
  );
}
