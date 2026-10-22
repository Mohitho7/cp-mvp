import React from "react";
import type { CareerComparison, ComparisonRoleItem } from "@workspace/api-client-react";
import { Briefcase, CheckCircle, AlertCircle, Sparkles, Footprints, Layers } from "lucide-react";

function ComparisonCard({
  item,
  index,
  groupType,
}: {
  item: ComparisonRoleItem;
  index: number;
  groupType: "longTerm" | "entryLevel";
}) {
  return (
    <article
      className={`comparison-role-card ${groupType === "longTerm" ? "card-long-term" : "card-entry"}`}
      data-testid={`comparison-${groupType}-${index}`}
    >
      <div className="card-top-bar">
        <span className="comparison-index">0{index + 1}</span>
        <h4 className="comparison-role-title">{item.title}</h4>
        <span className="comparison-type-badge">
          {groupType === "longTerm" ? "Target Destination" : "Entry Role"}
        </span>
      </div>

      <div className="comparison-points-grid">
        {/* Role Involves */}
        <div className="point-item">
          <div className="point-label">
            <Briefcase size={13} className="text-muted-foreground" />
            <span>WHAT THE WORK INVOLVES</span>
          </div>
          <p className="point-text">{item.roleInvolves || "Standard operational deliverable in this domain."}</p>
        </div>

        {/* Why Fits */}
        <div className="point-item">
          <div className="point-label">
            <CheckCircle size={13} className="text-secondary" />
            <span>WHY IT MAY FIT YOU</span>
          </div>
          <p className="point-text">{item.whyFit || "Direct alignment with your assessment answers."}</p>
        </div>

        {/* Trade-off */}
        <div className="point-item">
          <div className="point-label">
            <AlertCircle size={13} className="text-amber-400" />
            <span>MAIN TRADE-OFF / CHALLENGE</span>
          </div>
          <p className="point-text">{item.tradeOff || "Demands dedicated mastery and competitive focus."}</p>
        </div>

        {/* Differentiation */}
        <div className="point-item highlight-point">
          <div className="point-label">
            <Layers size={13} className="text-primary" />
            <span>HOW IT DIFFERS</span>
          </div>
          <p className="point-text">
            {item.differentiation || "Distinct path compared to adjacent alternative options."}
          </p>
        </div>
      </div>
    </article>
  );
}

export function Section5Comparison({
  careerComparison,
}: {
  careerComparison: CareerComparison;
}) {
  const longTermList = careerComparison?.longTerm ?? [];
  const entryLevelList = careerComparison?.entryLevel ?? [];

  return (
    <section id="section-comparison" className="report-section-block" data-testid="section-comparison">
      <header className="section-header">
        <div className="section-label">05 · CAREER OPTIONS COMPARED</div>
        <h2>Side-by-side trade-off analysis</h2>
        <p className="section-desc">
          Comparing the top 3 long-term career targets and top 3 entry-level roles across day-to-day work,
          strengths match, challenges, and distinguishing characteristics.
        </p>
      </header>

      {/* Comparison Group 1: Top 3 Long-Term Careers */}
      <div className="comparison-group-block" data-testid="comparison-long-term-group">
        <div className="comparison-group-header">
          <h3 className="group-badge long-term-badge">
            <Sparkles size={14} />
            <span>Top 3 Long-Term Destinations Compared</span>
          </h3>
          <span className="group-subcaption">Evaluating your primary career aspirations.</span>
        </div>

        <div className="comparison-cards-grid">
          {longTermList.map((item, idx) => (
            <ComparisonCard key={item.id || idx} item={item} index={idx} groupType="longTerm" />
          ))}
        </div>
      </div>

      {/* Comparison Group 2: Top 3 Entry-Level Roles */}
      <div className="comparison-group-block" data-testid="comparison-entry-group">
        <div className="comparison-group-header">
          <h3 className="group-badge entry-badge">
            <Footprints size={14} />
            <span>Top 3 Entry-Level First Steps Compared</span>
          </h3>
          <span className="group-subcaption">Evaluating your immediate market entry wedges.</span>
        </div>

        <div className="comparison-cards-grid">
          {entryLevelList.map((item, idx) => (
            <ComparisonCard key={item.id || idx} item={item} index={idx} groupType="entryLevel" />
          ))}
        </div>
      </div>
    </section>
  );
}
