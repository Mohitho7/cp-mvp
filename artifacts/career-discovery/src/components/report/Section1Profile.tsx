import React from "react";
import type { CareerProfile, WorkArchetype, AnswerPatterns } from "@workspace/api-client-react";
import { Sparkles, Compass, CheckCircle2, Info } from "lucide-react";

const WORKER_TYPE_EXPLANATIONS: Record<string, string> = {
  Specialist: "Depth-first: excels when mastering a specialized technical or domain craft.",
  Operator: "Execution-first: keeps operational workflows, delivery, and systems moving forward.",
  Builder: "Maker-first: thrives on designing and constructing tangible, working products.",
  Analyst: "Evidence-first: investigates systematically and grounds decisions in concrete data.",
  Communicator: "People-first: creates organizational momentum and clarity through human connection.",
  Entrepreneur: "Outcome-first: turns ideas into market results with high personal accountability.",
  Manager: "Coordination-first: aligns cross-functional people, timelines, and deliverables.",
};

const CLARITY_EXPLANATIONS: Record<string, string> = {
  Clear: "Your assessment responses show strong internal consistency toward a cohesive direction.",
  Mixed: "Your responses demonstrate multiple complementary inclinations — test options via focused projects.",
  Exploratory: "Your direction is still forming — prioritize low-risk, hands-on experiments to test fit.",
};

export function Section1Profile({
  profile,
  workArchetype,
  answerPatterns,
}: {
  profile: CareerProfile;
  workArchetype: WorkArchetype | null;
  answerPatterns?: AnswerPatterns;
}) {
  const archetypeTitle = workArchetype?.name ?? profile.archetype;
  const archetypeSummary =
    profile.summary ||
    workArchetype?.definition ||
    (profile.archetype
      ? `${profile.archetype}: strategic working profile synthesized from your assessment answers.`
      : "Working profile synthesized from your assessment answers.");

  // Up to three relevant original assessment responses supporting the profile
  const signals = Array.isArray(workArchetype?.evidence) && workArchetype.evidence.length > 0
    ? workArchetype.evidence.slice(0, 3)
    : Array.isArray(answerPatterns?.clear) && answerPatterns.clear.length > 0
    ? answerPatterns.clear.slice(0, 3)
    : (profile.strengths ?? []).slice(0, 3);

  return (
    <section id="section-profile" className="report-section-block" data-testid="section-profile">
      <header className="section-header">
        <div className="section-label">01 · YOUR CAREER PROFILE</div>
        <h2>Discover your working style</h2>
        <p className="section-desc">
          Synthesizing your assessment responses into a foundational working identity.
        </p>
      </header>

      {/* Primary Visual Element: Working Archetype Card (when archetype exists) */}
      {workArchetype && (
        <div className="archetype-hero-card" data-testid="archetype-card">
          <div className="archetype-hero-badge">
            <Sparkles size={14} />
            <span>Working Archetype</span>
          </div>
          <h3 className="archetype-hero-title" data-testid="report-archetype-name">
            {archetypeTitle}
          </h3>
          <p className="archetype-hero-def" data-testid="report-archetype-summary">
            {archetypeSummary}
          </p>

          <div className="archetype-signal-row">
            <span className="signal-pill" data-testid="report-archetype-strength">
              {workArchetype?.strength ?? "Strong"} Signal
            </span>
            <span className="signal-subtext">Derived from assessment answer consistency</span>
          </div>

          {/* Compact Strong Signals Area */}
          {signals.length > 0 && (
            <div className="archetype-evidence-box" data-testid="archetype-signals">
              <span className="evidence-title">STRONG SIGNALS FROM YOUR ANSWERS:</span>
              <ul className="evidence-list evidence-list-grid">
                {signals.map((item, i) => (
                  <li key={i}>
                    <CheckCircle2 size={13} className="text-secondary inline-icon" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Operational Style & Preferred Environment */}
      <div className="profile-summary-card">
        <div className="profile-attributes-grid">
          <div className="attribute-block">
            <span className="attr-label">WORKING STYLE</span>
            <strong className="attr-value">{profile.workerType}</strong>
            <p className="attr-desc">
              {WORKER_TYPE_EXPLANATIONS[profile.workerType] ?? "Core operational style in team contexts."}
            </p>
          </div>
          <div className="attribute-block">
            <span className="attr-label">DECISION CLARITY</span>
            <strong className="attr-value">{profile.clarityLevel}</strong>
            <p className="attr-desc">
              {CLARITY_EXPLANATIONS[profile.clarityLevel] ?? "Clarity of directional signal in your answers."}
            </p>
          </div>
        </div>

        {profile.survivalEnvironment && (
          <div className="environment-callout">
            <Compass size={16} className="callout-icon" />
            <div>
              <strong>Preferred Working Environment</strong>
              <p>{profile.survivalEnvironment}</p>
            </div>
          </div>
        )}

        <div className="archetype-disclaimer-note">
          <Info size={13} className="text-muted-foreground flex-shrink-0" />
          <span>
            This working archetype is a practical navigation guide derived from your self-reported preferences.
            It is not a fixed diagnostic label or psychological constraint.
          </span>
        </div>
      </div>
    </section>
  );
}
