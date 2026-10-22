# Career Pathfinder — Production Release V1

## 1. Release Status
**READY FOR CONTROLLED PRODUCTION DEPLOYMENT**

This document covers the current V1 architecture, environment requirements, migrations, deployment sequence, smoke tests, rollback considerations, and V1 boundary.

Production deployment and database migration are explicit operational steps.

## 2. Current Architecture
- Frontend: Vite + React + TypeScript in `web/`
- Build output: `web/dist`
- Backend: Vercel serverless functions in `api/`
- Shared backend: `src/`
- Database: PostgreSQL + Drizzle
- Auth: Clerk
- Validation: Zod
- AI: Gemini profile → Groq report/strategy → deterministic merge → Zod validation → optional Groq explanation
- Strategy: deterministic `buildEntryStrategy`
- Async: DB-backed queue + Vercel Cron + result-request poll-pump

## 3. Required Environment Variables

Names only; never place secret values here.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL |
| `OPENAI_API_KEY` | Only for legacy OpenAI provider | Legacy path |
| `OPENAI_MODEL` | No | Legacy model |
| `LLM_PROVIDER` | No | Provider selection |
| `GEMINI_API_KEY` | Yes for generation | Stage A |
| `GEMINI_MODEL` | No | Stage A model |
| `GROQ_API_KEY` | Yes for generation | Stage B/explanation |
| `GROQ_MODEL` | No | Stage B model |
| `MAX_ACTIVE_GENERATIONS` | No | Generation concurrency cap |
| `CLERK_SECRET_KEY` | Yes | Auth/admin verification |
| `CAREER_INSTITUTION_NAME` | Yes | Institution configuration |
| `CAREER_INSTITUTION_ADMIN_EMAIL` | Yes | Admin configuration |
| `CRON_SECRET` | Yes for cron | Worker authorization |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Client Clerk |
| `VITE_CLERK_PROXY_URL` | No | Clerk proxy |
| `NODE_ENV` | No | Production behavior |
| `CAREER_DEMO_SEED` | No | Demo seed control |

Server secrets must never use a `VITE_` prefix.

## 4. Database Migrations

Apply in order:
1. `drizzle/0001_init.sql`
2. `drizzle/0002_student_context.sql`
3. `drizzle/0003_strategy_columns.sql`

### 0002
Adds nullable:
- degree
- expected graduation year
- available hours/week

### 0003
Adds nullable JSONB:
- `career_strategy`
- `career_strategy_explanation`

All current migrations are additive/nullable.

**Migration files existing in the repository do not prove that production has been migrated.**

## 5. Deployment Sequence

1. Verify tests/typecheck/build.
2. Configure Vercel production environment.
3. Deploy application code.
4. Apply migrations in order.
5. Verify production schema.
6. Run smoke tests.
7. Begin controlled pilot.

Do not run destructive SQL.

## 6. Worker / Vercel Configuration

Verify the current `vercel.json` before deployment.

Expected architecture:
- serverless API functions
- `/api/worker/cron`
- DB-backed queue
- stale recovery
- bounded concurrency
- retries/backoff
- result-request poll-pump

Cron authorization uses `CRON_SECRET`.

Do not assume plan-specific duration/cadence behavior without checking the current Vercel configuration and account plan.

## 7. Production Smoke Test

### A. New student
Login → 13Q → context → submit → pending → processing → completed → report → Career Path.

### B. Legacy result
Load a result with no strategy.
Expected:
- report loads
- existing report stays intact
- Career Path is absent

### C. Ownership
Try to access another student's result.
Expected: existing 404/authorization behavior.

Student accessing admin dashboard should be rejected.

### D. Failure
In a safe environment, simulate provider failure.
Expected:
- generic safe failure
- no secret leakage
- retry follows existing behavior

### E. Mobile
Check 360px and 390px:
- no horizontal overflow
- controls usable
- Career Path stacks correctly

### F. Admin
Authorized admin works; unauthorized user rejected.

### G. Worker
Cron behaves correctly and queued jobs progress.

### H. Database
Confirm migrations and nullable columns exist.

## 8. Security / Privacy Checks

Verify:
- provider/database/auth secrets stay server-side
- no secrets in client bundle
- result ownership remains enforced
- admin authorization remains enforced
- malformed IDs fail safely
- provider errors are sanitized
- SQL remains parameterized/typed
- sensitive diagnostics remain server-side

## 9. Rollback Considerations

Code rollback should remain compatible because new fields are nullable and old code can ignore them.

Do not casually roll back database migrations. First determine whether production data uses the new columns.

Prefer forward-compatible fixes.

Never roll back the initial schema while the app depends on it.

## 10. Known Limitations

V1 intentionally lacks:
- live labor-market intelligence
- live salary intelligence
- readiness scoring
- current skill inventory
- project evidence analysis
- internship matching
- portfolio evidence tracking
- subscriptions/paywall
- strategy-aware full roadmap

If market/salary context is unavailable, the product must be honest rather than fabricate values.

## 11. V1 Feature Boundary

### IN V1
- 13Q assessment
- student context
- AI career profile
- structured career report
- deterministic strategy
- target/entry/bridge/alternative
- route type
- optional strategy explanation
- persistence/retrieval
- Career Path UI
- auth/ownership
- durable queue
- retries/stale recovery
- worker/Cron
- production hardening

### NOT IN V1
- readiness inventory
- current skills database
- project evidence analysis
- live market data
- live salary intelligence
- paywall
- subscriptions
- payments
- strategy-aware full roadmap
- internship matching
- portfolio evidence tracking

## 12. Release Gate

Do not call the product production-ready only because build passes.

Controlled deployment gate:

- tests pass
- typecheck passes
- build passes
- environment verified
- migrations reviewed/applied
- auth/ownership verified
- worker verified
- new-result smoke test passes
- legacy-result smoke test passes
- mobile smoke test passes

Then:
**V1 CONTROLLED PILOT**

## 13. Pilot Strategy

Start with 5–20 students across different:
- academic backgrounds
- career interests
- levels of certainty

Observe:
1. Does target feel relevant?
2. Does entry feel realistic?
3. Does bridge make sense?
4. Is the reasoning understandable?
5. Does the student know what to do next?
6. Does it feel generic/AI-generated?
7. Do they disagree with the recommendation?
8. Do they trust it?

Do not build major V2 features until these answers are understood.

## 14. Future Direction

Potential V2:

```text
WHERE AM I?
  ↓
Career Discovery
  ↓
WHERE SHOULD I GO?
  ↓
Career Strategy
  ↓
WHAT AM I MISSING?
  ↓
Readiness / Skills / Evidence
  ↓
WHAT SHOULD I DO?
  ↓
Personalized Roadmap / Missions
  ↓
WHAT PROVES I'M READY?
  ↓
Portfolio / Internship Readiness
```

This is future work, not V1.

## 15. Final Release State

**Career Pathfinder V1: READY FOR CONTROLLED PRODUCTION DEPLOYMENT**

Next:
1. verify environment
2. deploy code
3. apply migrations
4. verify schema
5. smoke test
6. controlled student pilot
7. collect evidence
8. decide V1.1/V2 from real usage
