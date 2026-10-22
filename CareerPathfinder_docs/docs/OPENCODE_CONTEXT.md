# Career Pathfinder — OpenCode Project Context

> Read this file before making changes. The actual repository/code/tests are the final source of truth if they disagree with this document.

## Project
Career Pathfinder is a student career-discovery and career-direction product.

Core promise:
> Help a student understand what career direction fits them, what they can realistically enter first, and how that entry path connects to the longer-term target.

Core principle:
**Career fit ≠ career entry strategy.**

Reasoning:
`Student → What fits → Academic edge → Entry reality → Best entry → Bridge → Long-term direction`

## Current Architecture
- Frontend: Vite + React + TypeScript (`web/`)
- Backend: Vercel serverless functions (`api/`)
- Shared backend: `src/`
- Database: PostgreSQL + Drizzle
- Migrations: hand-authored SQL in `drizzle/`
- Auth: Clerk, server-side verification
- Validation: Zod
- AI:
  1. Gemini profile
  2. Groq career report/strategy
  3. deterministic merge/strategy
  4. Zod validation
  5. optional Groq strategy explanation
- Async generation: DB-backed queue + Vercel Cron + result-request poll-pump

## Completed Batches

### Batch 1 — Student Context
Added optional:
- degree/program
- expected graduation year
- available hours/week

Migration: `drizzle/0002_student_context.sql`

Additive, nullable, backward-compatible. Deterministic time-budget calculation. No LLM prompt changes.

### Batch 2 — Deterministic Career Strategy
Added `buildEntryStrategy()`.

Strategy:
- `targetCareer`
- `bestEntryCareer`
- `bridgeCareer`
- `alternativeRoute`
- `routeType`
- rationale
- insufficient-context state

Route types:
- `DIRECT`
- `ADJACENT`
- `BRIDGE`

Rules:
- Target is interest/fit-led.
- Entry considers accessibility, degree/department alignment, stepping-stone value, fit, and runway.
- Bridge is optional and meaningful.
- Alternative is optional and distinct.
- Unknown academic alignment is conservative.
- Strategy is deterministic.

### Batch 3 — Strategy Explanation
Added optional Groq explanation.

Invariant:
**LLM explains the deterministic strategy; it cannot override it.**

If explanation fails:
- report remains intact
- strategy remains intact
- explanation becomes null

### Batch 4 — Persistence + Career Path UI
Added nullable JSONB fields to `career_results`:
- `career_strategy`
- `career_strategy_explanation`

Migration: `drizzle/0003_strategy_columns.sql`

Strategy/explanation are persisted atomically with result completion.

Existing endpoint remains:
`GET /api/result/:id`

Career Path UI in `ReportDetail`:
- Quick mode
- Detailed mode
- target
- entry
- bridge when present
- rationale
- time/runway
- evidence
- watch-out
- alternative when present

Legacy reports with null strategy remain unchanged.

### Batch 5 + 6 — Validation + Production Hardening
Completed:
- realistic strategy persona tests
- edge-case and determinism tests
- career catalog review
- explanation safety checks
- environment audit
- migration audit
- API/auth/ownership audit
- worker audit
- security audit
- frontend/runtime audit
- production release documentation

Current assessment:
**READY FOR CONTROLLED PRODUCTION DEPLOYMENT**

## Strategy Contract

The deterministic strategy engine is authoritative.

LLMs must never override:
- `targetCareer`
- `bestEntryCareer`
- `bridgeCareer`
- `alternativeRoute`
- `routeType`

Do not add persona-specific hardcoded rules. Fix underlying ranking/catalog logic instead.

Valid nulls are allowed. Never manufacture certainty.

## V1 Boundary

### Implemented
- 13Q discovery
- student context
- AI profile
- structured AI report
- deterministic career strategy
- strategy explanation
- persistence/retrieval
- Career Path UI
- authentication/ownership
- durable queue
- retries/stale recovery
- worker/Cron
- production hardening

### NOT V1
- readiness inventory
- current skills database
- project evidence analysis
- live market data
- live salary intelligence
- paywall
- subscriptions/payments
- strategy-aware full roadmap
- internship matching
- portfolio evidence tracking

## Migrations
Expected order:
1. `drizzle/0001_init.sql`
2. `drizzle/0002_student_context.sql`
3. `drizzle/0003_strategy_columns.sql`

0002 and 0003 are additive/nullable.

Do not assume production migrations have run merely because the files exist.

## Production Status
**READY FOR CONTROLLED PRODUCTION DEPLOYMENT**

Production deployment/migration is a separate explicit operational step.

Sequence:
1. verify environment
2. deploy code
3. apply migrations
4. verify schema
5. smoke test
6. test auth/ownership
7. test generation/retry/worker
8. run a small real-student pilot

Do not deploy or migrate automatically.

## Important Environment Variable Names
- `DATABASE_URL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `LLM_PROVIDER`
- `MAX_ACTIVE_GENERATIONS`
- `CLERK_SECRET_KEY`
- `CAREER_INSTITUTION_NAME`
- `CAREER_INSTITUTION_ADMIN_EMAIL`
- `CRON_SECRET`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_CLERK_PROXY_URL`
- `NODE_ENV`
- `CAREER_DEMO_SEED`

Never expose server secrets through `VITE_`.

## Frozen / High-Risk Areas
Do not casually rewrite:
- auth/ownership
- worker/retry logic
- concurrency/stale recovery
- existing report schema
- existing prompts
- final report validation
- migration 0001
- 13Q behavior
- dashboard authorization
- Career Strategy authority model

Changes require evidence of a defect and regression tests.

## Quality Baseline
Previously verified:
- 153/153 tests after Batch 4
- typecheck clean
- production build clean
- SSR structure checks passed
- 1440/390/360 UI checks passed

Always verify the current repository rather than trusting an old count.

## Rules for Future OpenCode Sessions
1. Read this file first.
2. Inspect the actual repository before assuming a feature exists.
3. Treat code/tests as final truth.
4. Do not restart completed batches.
5. Do not add major features without an explicit request.
6. Preserve backward compatibility.
7. Prefer small, testable changes.
8. Add regression tests for behavior changes.
9. Do not run production migrations unless explicitly requested.
10. Do not deploy unless explicitly requested.
11. Do not commit/push unless explicitly requested.
12. Never expose secrets.
13. Never let LLM output override deterministic Career Strategy.
14. If context becomes large, update this file with the new stable project state before ending the session.

## Immediate Next Step
Controlled V1 production deployment and a small real-student pilot.

After real usage, use evidence to decide V1.1/V2.

Do not automatically start the readiness/skills/roadmap layer.
