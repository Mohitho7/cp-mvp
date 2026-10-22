import React from "react";
import type { MentorNote } from "@workspace/api-client-react";
import { Eye, AlertTriangle, FlaskConical, MessageSquare } from "lucide-react";

export function Section8MentorNote({
  mentorNote,
}: {
  mentorNote: MentorNote;
}) {
  return (
    <section id="section-mentor" className="report-section-block" data-testid="section-mentor-note">
      <header className="section-header">
        <div className="section-label">08 · A CANDID MENTOR'S NOTE</div>
        <h2>Direct feedback for your journey</h2>
        <p className="section-desc">
          Honest perspective from a senior mentor: one observed pattern, one realistic risk, and one experiment to run.
        </p>
      </header>

      <div className="mentor-notes-triptych">
        {/* 1. Observed Pattern */}
        <div className="mentor-piece-card card-pattern" data-testid="mentor-pattern-card">
          <div className="piece-header">
            <div className="piece-icon-circle icon-pattern">
              <Eye size={16} />
            </div>
            <div>
              <span className="piece-kicker">OBSERVED PATTERN</span>
              <h3 className="piece-title">What your assessment consistently shows</h3>
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
              <h3 className="piece-title">The trap or limitation to prepare for</h3>
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
              <span className="piece-kicker">CONCRETE EXPERIMENT</span>
              <h3 className="piece-title">What to test in the next 14 days</h3>
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
    </section>
  );
}
