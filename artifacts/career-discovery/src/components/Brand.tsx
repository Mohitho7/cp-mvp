import { Link } from "wouter";
import type { ReactNode } from "react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand-lockup" aria-label="Career Pathfinder home" data-testid="link-brand-home">
      <span className="brand-mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1915" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      </span>
      {!compact && (
        <span className="brand-name">
          Pathfinder
        </span>
      )}
    </Link>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="app-frame">{children}</div>;
}

