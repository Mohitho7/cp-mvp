import { Link } from "wouter";
import type { ReactNode } from "react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand-lockup" aria-label="HITAM Career Discovery home" data-testid="link-brand-home">
      <span className="brand-mark" aria-hidden="true"><span /></span>
      {!compact && <span className="brand-name">career<span> / </span>discovery<small>HITAM · A candid guide</small></span>}
    </Link>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="app-frame grain">{children}</div>;
}
