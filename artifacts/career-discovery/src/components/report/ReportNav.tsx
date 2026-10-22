import React, { useState, useEffect } from "react";
import { Compass, Sparkles } from "lucide-react";

export interface SectionNavItem {
  id: string;
  number: string;
  label: string;
}

const SECTIONS: SectionNavItem[] = [
  { id: "section-profile", number: "01", label: "Profile" },
  { id: "section-strengths", number: "02", label: "Strengths" },
  { id: "section-readiness", number: "03", label: "Readiness" },
  { id: "section-options", number: "04", label: "Compare Options" },
  { id: "section-action-plan", number: "05", label: "Action Plan" },
];

export function ReportNav() {
  const [activeSection, setActiveSection] = useState<string>("section-profile");
  const navInnerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );

    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = navInnerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLElement>(".report-nav-btn.active");
    if (!activeBtn) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const offset = (btnRect.left + btnRect.width / 2) - (containerRect.left + containerRect.width / 2);
    if (Math.abs(offset) > 10) {
      container.scrollBy({ left: offset, behavior: "smooth" });
    }
  }, [activeSection]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="report-nav-sticky" aria-label="Report sections navigation">
      <div className="report-nav-inner" ref={navInnerRef}>
        <div className="report-nav-label">
          <Compass size={13} className="text-primary" />
          <span>Report Index</span>
        </div>
        <div className="report-nav-links">
          {SECTIONS.map((sec) => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => scrollTo(sec.id)}
                className={`report-nav-btn ${isActive ? "active" : ""}`}
                aria-current={isActive ? "true" : undefined}
                data-testid={`nav-${sec.id}`}
              >
                <span className="nav-num">{sec.number}</span>
                <span className="nav-title">{sec.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="report-nav-gradient-cue" aria-hidden="true">
        <span>›</span>
      </div>
    </nav>
  );
}
