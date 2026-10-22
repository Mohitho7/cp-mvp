import React from "react";
import type { CareerTraits, AnswerPatterns, CareerProfile } from "@workspace/api-client-react";
import { AlertTriangle, Info } from "lucide-react";

interface TraitItemProps {
  name: string;
  score: number;
  label: string;
  reason: string;
}

function TraitMeter({ name, score, label, reason }: TraitItemProps) {
  // Score is 1..5
  const clamped = Math.max(1, Math.min(5, score));
  const percent = (clamped / 5) * 100;

  return (
    <div className="trait-meter-card" data-testid={`trait-${name.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="trait-meter-header">
        <strong className="trait-name">{name}</strong>
        <span className="trait-score-badge">
          {label} · {score}/5
        </span>
      </div>
      <div
        className="trait-progress-bar"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={1}
        aria-valuemax={5}
        aria-label={`${name}: ${score} out of 5 (${label})`}
      >
        <div className="trait-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="trait-reason">{reason}</p>
    </div>
  );
}

export function Section2Strengths({
  traits,
  profile,
  answerPatterns,
}: {
  traits: CareerTraits;
  profile?: CareerProfile;
  answerPatterns?: AnswerPatterns;
}) {
  // Key development area sourced from existing assessment evidence
  const developmentArea =
    profile?.risks?.[0] ||
    answerPatterns?.conflicts?.[0]?.text ||
    "Prioritize structured feedback early to bridge transitional gaps.";

  return (
    <section id="section-strengths" className="report-section-block" data-testid="section-strengths">
      <header className="section-header">
        <div className="section-label">02 · YOUR STRENGTHS & WORKING STYLE</div>
        <h2>Understand how you prefer to work</h2>
        <p className="section-desc">
          Reported preferences across five core dimensions. These represent task inclinations, not fixed abilities or intelligence.
        </p>
      </header>

      {/* Traits Grid */}
      <div className="traits-display-container">
        <div className="traits-cards-grid">
          <TraitMeter
            name="Technical Inclination"
            score={traits.technical.score}
            label={traits.technical.label}
            reason={traits.technical.reason}
          />
          <TraitMeter
            name="Creative Drive"
            score={traits.creative.score}
            label={traits.creative.label}
            reason={traits.creative.reason}
          />
          <TraitMeter
            name="People Orientation"
            score={traits.people.score}
            label={traits.people.label}
            reason={traits.people.reason}
          />
          <TraitMeter
            name="Risk Appetite"
            score={traits.risk.score}
            label={traits.risk.label}
            reason={traits.risk.reason}
          />
          <TraitMeter
            name="Learning Agility"
            score={traits.learning.score}
            label={traits.learning.label}
            reason={traits.learning.reason}
          />
        </div>

        <div className="trait-disclaimer-note">
          <Info size={14} className="text-muted-foreground flex-shrink-0" />
          <span>
            These five dimensions describe task preferences reported during the assessment. They are not
            standardized psychometric tests and do not define the limits of what you can learn.
          </span>
        </div>
      </div>

      {/* Compact Key Development Area Callout */}
      <div className="development-area-card" data-testid="key-development-area">
        <div className="development-header">
          <AlertTriangle size={16} className="text-amber-400" />
          <h4 className="development-title">Your Key Development Area</h4>
        </div>
        <p className="development-text">{developmentArea}</p>
        <span className="development-caption">
          Focus on building demonstrable proof in this area during early project work.
        </span>
      </div>
    </section>
  );
}
