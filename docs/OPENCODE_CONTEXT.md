# Career Pathfinder — OpenCode Context (source-of-truth handoff)

> Read this file first in every session. The actual repository state is final truth.
> Verified against the real checkout on 2026-10-07. Where this file disagrees with
> older docs (notably `CareerPathfinder_docs/docs/OPENCODE_CONTEXT.md` and
> `PRODUCTION_RELEASE.md`), THIS file + the code win.

## 1. Project purpose

Career Pathfinder turns a student's 13 structured answers into a private,
validated career report plus institution-level cohort insights.

Core principle (product intent): **Career fit ≠ career entry strategy.**
Intended reasoning: `student → what fits → academic edge → realistic entry → bridge → long-term target`.

## 2. Actual current architecture (verified)

- **Monorepo:** pnpm workspaces (`pnpm-workspace.yaml`), Node 24, TypeScript 5.9.
- **Frontend:** Vite + React 19 + TS at `artifacts/career-discovery/` (NOT `web/`).
- **Backend:** Express 5 API server at `artifacts/api-server/src/` (NOT `api/` + Vercel functions).
  - Routes: `src/routes/careerDiscovery.ts`, `src/routes/health.ts`, mounted at `/api`.
  - App wiring: `src/app.ts` (Clerk middleware, optional `/api/__clerk` proxy, JSON parsing, safe error handler).
- **Shared contract:** OpenAPI spec `lib/api-spec/openapi.yaml` → Orval codegen → `lib/api-zod` (Zod) + `lib/api-client-react` (React Query hooks).
- **DB:** PostgreSQL + Drizzle ORM. Schema source: `lib/db/src/schema/careerDiscovery.ts`. Applied via `pnpm --filter @workspace/db run push` (drizzle-kit push). **There is NO `drizzle/*.sql` migration folder in this checkout.**
- **Auth:** Clerk (`@clerk/express` server, `@clerk/react` client). Server checks `CLERK_SECRET_KEY`; admin check against configured institution admin email in `src/lib/institutionAccess.ts`.
- **AI generation (actual):** single-stage **OpenAI** call in `artifacts/api-server/src/lib/careerReportWorker.ts` — model constant `gpt-5-mini`, `OPENAI_API_KEY`, JSON-schema response validated by `careerReportSchema`. Prompt embeds `careerMarketContext` + 13Q answer key.
- **Async pipeline (actual):** DB-backed queue (`career_submissions` status pending/processing/done/failed) + **in-process polling worker** (`setInterval` 1500ms, row locking `FOR UPDATE SKIP LOCKED`, max 3 attempts, 30s/120s backoff, 15-min stale recovery). There is NO `/api/worker/cron` route, NO `vercel.json`, NO `CRON_SECRET` usage in code.
- **Market context (actual):** `careerMarketContext.ts` is an explicit placeholder — no verified salary/hiring figures. Report must show "unavailable" rather than invent numbers; `salaryInrLpa` is nullable.
- **Other packages:** `artifacts/mockup-sandbox` (UI sandbox), `scripts/` (demo seed via `CAREER_DEMO_SEED=true`, refuses production).
- **Tests:** NO `tests/` directory and NO `*.test.*` files found in this checkout.

## 3. Historical handoff vs. reality — CORRECTION (important)

The prior handoff claimed Batches 1–6 complete (student context fields, `buildEntryStrategy()`, Groq explanation, `career_strategy` JSONB columns + migrations `0001→0003`, Career Path UI, Gemini/Groq two-stage pipeline, Vercel Cron, production hardening, 153/153 tests).

**Verification result (2026-10-07): NONE of Batches 1–4 code exists in this checkout:**

| Claimed | Actual |
|---|---|
| `degree` / grad-year / hours/week on student (Batch 1, `drizzle/0002`) | ABSENT. `career_students` has only `department, year, batch` + Clerk/institution keys. Submission input requires only `department/year/batch`. |
| `buildEntryStrategy()`, `targetCareer/bestEntryCareer/bridgeCareer/alternativeRoute/routeType` (Batch 2) | ABSENT. Zero code matches (`grep` hits only the docs). Closest existing concept is the LLM-written `caliberVsEntry` report section (longTermCaliber/marketBarrier/firstEntryRoles/bridgePath) — NOT deterministic. |
| Groq/Gemini two-stage + explanation layer (Batch 3) | ABSENT. Only `openai` dependency, only `OPENAI_API_KEY`. No `GEMINI_*`, `GROQ_*`, `LLM_PROVIDER`, `MAX_ACTIVE_GENERATIONS` in code. |
| `career_results.career_strategy` / `career_strategy_explanation` + `drizzle/0003` (Batch 4) | ABSENT. `career_results` has `report, archetype, workerType, clarityLevel, recommendedTrack, *_score, model, tokens`. No `drizzle/` dir at all. |
| Career Path UI Quick/Detailed modes in `ReportDetail` (Batch 4) | ABSENT. `ReportDetail.tsx` renders the 9-section report only; no strategy section. |
| `src/`, `api/`, `web/`, `drizzle/`, `tests/`, `docs/` layout | ABSENT. Real layout is `artifacts/*`, `lib/*`, `scripts`, `CareerPathfinder_docs/`. (`docs/` is created by this task solely for this handoff file.) |
| Batches 5+6 validation/hardening, 153/153 tests, `vercel.json` | No test files, no `vercel.json`, no cron route found. Treat old counts/audits as unverified for THIS checkout. |

Interpretation: `CareerPathfinder_docs/docs/*` describes a **planned or different-branch V1** (Vercel + Gemini/Groq + strategy). Do NOT assume it is implemented here. Do NOT "fix" this by rebuilding — the task forbids code changes and forbids starting V2 without evidence.

## 4. Strategy contract (intended — NOT yet implemented here)

When/if strategy is built, the agreed contract is:
- Deterministic engine is authoritative over `targetCareer, bestEntryCareer, bridgeCareer, alternativeRoute, routeType` (`DIRECT`/`ADJACENT`/`BRIDGE`).
- LLM may EXPLAIN the strategy but must never override it; explanation failure → `null`, report stays valid.
- Valid nulls allowed; never manufacture certainty; no persona-specific hardcodes (fix ranking/catalog instead).
- Status in THIS checkout: contract is design-only; no enforcement code exists.

## 5. Production status

- **NOT deployed; NOT migrated.** No production migration has run (there are no SQL migration files in this checkout to run — schema is pushed via drizzle-kit).
- The old label "READY FOR CONTROLLED PRODUCTION DEPLOYMENT" comes from the planned-branch docs and is **UNVERIFIED for this checkout** (no tests found here, no hardening evidence in code).
- Controlled deployment sequence (when explicitly ordered, never automatic): verify env → deploy code → `db push` / apply schema → verify schema → smoke test (new student, legacy result, ownership 404, failure sanitization, mobile 360/390, admin, worker) → 5–20 student pilot → collect feedback before V2.

## 6. Migrations / schema

- Source of truth: `lib/db/src/schema/careerDiscovery.ts` (institutions, institution_admins, career_students, career_submissions, career_results, career_generation_attempts).
- Method: `pnpm --filter @workspace/db run push` (dev). No ordered `0001/0002/0003.sql` files exist here — any doc referencing `drizzle/000X` refers to the other branch design.
- All claimed strategy/context columns are additive-nullable in that design, so IF later applied they should be backward compatible — but verify before assuming.

## 7. Environment variables (actual code usage)

Server (from code): `DATABASE_URL` (required, drizzle.config + db), `OPENAI_API_KEY` (required, worker), `CLERK_SECRET_KEY` (institutionAccess), `CLERK_PUBLISHABLE_KEY` (app.ts proxy), `CAREER_INSTITUTION_NAME`, `CAREER_INSTITUTION_ADMIN_EMAIL` (per replit.md), `PORT`. Client: `VITE_CLERK_PUBLISHABLE_KEY` (required), `VITE_CLERK_PROXY_URL` (optional). `CAREER_DEMO_SEED=true` enables demo seed (refuses production).
Names appearing ONLY in `CareerPathfinder_docs` (not in code): `GEMINI_API_KEY/MODEL`, `GROQ_API_KEY/MODEL`, `LLM_PROVIDER`, `MAX_ACTIVE_GENERATIONS`, `CRON_SECRET`, `OPENAI_MODEL`. Never expose server secrets via `VITE_`.

## 8. Frozen / high-risk areas (do not casually rewrite)

Auth/ownership (`institutionAccess.ts`, `getOwnedSubmission` 404-on-other-user), worker claim/retry/stale logic, rate limit (5/15min per user per process — note: in-memory, not shared across instances), report JSON schema + Zod validation, market-context honesty rule (null > invented salary), dashboard ≥5-reports suppression + never return individual reports/answers, Clerk proxy middleware.

## 9. V1 boundary

IN this checkout (verified): 13Q assessment, dept/year/batch context, consent-gated submission, one-submission-per-student, async OpenAI report (9 sections incl. `caliberVsEntry`), polling/retry/stale recovery, ownership + admin dashboard aggregates, demo seed.
NOT in this checkout: everything in §3 (student-context extras, deterministic strategy, explanation, strategy persistence/UI), plus never-V1 items: readiness/skills inventory, project evidence, live market/salary data, paywall/subscriptions, strategy-aware roadmap, internship matching, portfolio tracking.

## 10. Immediate next step

Per standing orders: STOP after this file. Do NOT implement strategy/context, run migrations, deploy, commit, or push. Next action requires an explicit human decision: (a) reconcile which branch is canonical (this checkout vs `CareerPathfinder_docs` design) and (b) only then plan controlled deployment + pilot. Do NOT start V2 automatically.

## 11. Rules for future OpenCode sessions

1. Read this file first, then `replit.md`, then the actual code paths in §2.
2. Treat code as truth; `CareerPathfinder_docs/docs/*` is design history, not implementation proof.
3. Do not claim Batches 1–6 as done in THIS checkout without `grep`-verifiable evidence.
4. No app-code changes, migrations, deploys, commits, or pushes without an explicit request.
5. Preserve backward compatibility; prefer small testable changes with regression tests.
6. Never let LLM output override a deterministic strategy (once it exists).
7. Never expose secrets; keep provider/DB/auth keys server-side.
8. If context grows, update THIS file (`docs/OPENCODE_CONTEXT.md`) with the new stable state before ending the session.
