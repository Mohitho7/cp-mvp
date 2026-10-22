import React, { useState } from "react";
import type {
  LongTermCareerOption,
  EntryLevelCareerOption,
  CareerComparison,
} from "@workspace/api-client-react";
import { Sparkles, Footprints, ChevronDown, ChevronUp, Clock, ShieldCheck, Briefcase, CheckCircle, AlertCircle, Layers } from "lucide-react";
import { formatAccessibility, formatDegreeAlignment, formatRunway } from "./formatters";

export function Section4Options({
  longTermOptions,
  entryOptions,
  careerComparison,
}: {
  longTermOptions: LongTermCareerOption[];
  entryOptions: EntryLevelCareerOption[];
  careerComparison?: CareerComparison;
}) {
  const [activeTab, setActiveTab] = useState<"longTerm" | "entryLevel">("longTerm");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState<boolean>(false);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isLongTerm = activeTab === "longTerm";

  // Source options based on active tab
  const fullList = isLongTerm ? (longTermOptions ?? []) : (entryOptions ?? []);
  const displayedList = showAll ? fullList : fullList.slice(0, 3);

  // Comparison map lookup for deep analysis
  const comparisonItems = isLongTerm
    ? (careerComparison?.longTerm ?? [])
    : (careerComparison?.entryLevel ?? []);

  return (
    <section id="section-options" className="report-section-block" data-testid="section-options">
      <header className="section-header">
        <div className="section-label">04 · COMPARE YOUR CAREER OPTIONS</div>
        <h2>Compare your options before choosing</h2>
        <p className="section-desc">
          Compare your top destinations and immediate entry wedges side by side. Explore alternatives without locking yourself into a single path.
        </p>
      </header>

      {/* Interactive Segmented Control / Tabs */}
      <div className="options-tabs-container">
        <div className="options-tabs-nav" role="tablist" aria-label="Career option categories">
          <button
            type="button"
            role="tab"
            aria-selected={isLongTerm}
            aria-controls="panel-long-term"
            id="tab-long-term"
            className={`options-tab-btn ${isLongTerm ? "active" : ""}`}
            onClick={() => {
              setActiveTab("longTerm");
              setShowAll(false);
            }}
            data-testid="tab-long-term-options"
          >
            <Sparkles size={14} className="tab-icon" />
            <span>Long-Term Destinations (3–5+ Yrs)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={!isLongTerm}
            aria-controls="panel-entry-level"
            id="tab-entry-level"
            className={`options-tab-btn ${!isLongTerm ? "active" : ""}`}
            onClick={() => {
              setActiveTab("entryLevel");
              setShowAll(false);
            }}
            data-testid="tab-entry-options"
          >
            <Footprints size={14} className="tab-icon" />
            <span>First-Job Entry Wedges (Day-One)</span>
          </button>
        </div>
      </div>

      {/* Active Options Panel */}
      <div
        role="tabpanel"
        id={isLongTerm ? "panel-long-term" : "panel-entry-level"}
        aria-labelledby={isLongTerm ? "tab-long-term" : "tab-entry-level"}
        className="options-panel"
        data-testid={isLongTerm ? "panel-long-term" : "panel-entry-level"}
      >
        <div className="options-list">
          {displayedList.map((role, idx) => {
            const roleId = role.id || `${activeTab}-${idx}`;
            const isExpanded = expandedIds.has(roleId);

            // Lookup corresponding comparison details
            const comp = comparisonItems.find(
              (c) => c.id === role.id || c.title?.toLowerCase() === role.title?.toLowerCase()
            ) ?? comparisonItems[idx];

            const workDescription = comp?.roleInvolves || role.rationale;
            const fitExplanation = comp?.whyFit || role.rationale;
            const mainTradeoff = comp?.tradeOff || "Demands dedicated focus and mastery of foundational tools.";
            const differentiation = comp?.differentiation || "Distinct path with focused domain application.";

            const entryRole = !isLongTerm ? (role as EntryLevelCareerOption) : null;
            const access = entryRole ? formatAccessibility(entryRole.accessibility) : null;
            const runway = entryRole ? formatRunway(entryRole.runwayWeeks) : null;

            return (
              <article
                key={roleId}
                className={`option-row-card ${isExpanded ? "expanded" : ""}`}
                data-testid={`card-option-${idx}`}
              >
                {/* Summary View (Always visible) */}
                <div className="option-row-summary">
                  <div className="option-rank-col">
                    <span className="option-rank-num">0{role.rank ?? idx + 1}</span>
                    <span className="option-rank-type">{isLongTerm ? "TARGET" : "WEDGE"}</span>
                  </div>

                  <div className="option-title-col">
                    <div className="option-title-header">
                      <h3 className="option-role-name">{role.title}</h3>
                      <span className="category-pill">{role.category}</span>
                      {isLongTerm && role.score && (
                        <span className="fit-pill" title="Long-term problem-solving suitability">
                          {role.fitScore ?? role.score}% Fit
                        </span>
                      )}
                    </div>
                    <p className="option-work-desc">{workDescription}</p>

                    {/* Entry-specific metadata chips */}
                    {entryRole && access && (
                      <div className="entry-chips-row">
                        <span className={`meta-chip chip-${access.tone}`}>
                          <ShieldCheck size={12} className="inline mr-1" />
                          {access.label}
                        </span>
                        <span className="meta-chip chip-neutral">
                          <Clock size={12} className="inline mr-1" />
                          {runway}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="option-action-col">
                    <button
                      type="button"
                      className="option-toggle-btn"
                      onClick={() => toggleExpand(roleId)}
                      aria-expanded={isExpanded}
                      aria-controls={`details-${roleId}`}
                      data-testid={`button-toggle-${idx}`}
                    >
                      <span>{isExpanded ? "Hide details" : "View details"}</span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Progressive Disclosure (Expanded View) */}
                {isExpanded && (
                  <div
                    id={`details-${roleId}`}
                    className="option-row-expanded-details"
                    data-testid={`details-${idx}`}
                  >
                    <div className="expanded-points-grid">
                      <div className="detail-point">
                        <div className="detail-point-label">
                          <CheckCircle size={13} className="text-secondary" />
                          <span>WHY IT MAY FIT YOU</span>
                        </div>
                        <p className="detail-point-text">{fitExplanation}</p>
                      </div>

                      <div className="detail-point">
                        <div className="detail-point-label">
                          <AlertCircle size={13} className="text-amber-400" />
                          <span>MAIN CHALLENGE / TRADE-OFF</span>
                        </div>
                        <p className="detail-point-text">{mainTradeoff}</p>
                      </div>

                      <div className="detail-point highlight-point">
                        <div className="detail-point-label">
                          <Layers size={13} className="text-primary" />
                          <span>WHAT DISTINGUISHES THIS ROLE</span>
                        </div>
                        <p className="detail-point-text">{differentiation}</p>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* View all options toggle (if more than 3 options exist) */}
        {fullList.length > 3 && (
          <div className="view-all-options-container">
            <button
              type="button"
              className="view-all-btn"
              onClick={() => setShowAll((prev) => !prev)}
              data-testid="button-view-all-options"
            >
              {showAll ? "Show Top 3 Only" : `View All ${fullList.length} Options (${fullList.length - 3} more)`}
            </button>
          </div>
        )}

        <div className="options-legend-note">
          <span>
            {isLongTerm
              ? "Long-term suitability measures problem-solving alignment over a 3–5+ year horizon. You are not locked into any single path."
              : "First-job accessibility measures day-one market openness and typical preparation runway for freshers."}
          </span>
        </div>
      </div>
    </section>
  );
}
