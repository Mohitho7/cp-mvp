# Career Pathfinder

Career Pathfinder turns a student's 13 structured answers into a private, validated career report and institution-level cohort insights.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/career-discovery run dev` — run the frontend dev server (set `VITE_PORT`, e.g. 5173, when running alongside the API; `/api/*` is proxied to `http://localhost:<PORT>` or `VITE_API_PROXY_TARGET`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required server env: `DATABASE_URL`, `PORT`, `OPENAI_API_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CAREER_INSTITUTION_NAME`, and `CAREER_INSTITUTION_ADMIN_EMAIL`.
- Required frontend env: `VITE_CLERK_PUBLISHABLE_KEY`; set `VITE_CLERK_PROXY_URL` when Clerk proxying is used.
- Apply the Drizzle schema with `pnpm --filter @workspace/db run push` before starting the API server.
- See `.env.example` for the full platform-neutral environment contract. On Replit these values are injected automatically (Replit PostgreSQL provides `DATABASE_URL`); locally and on other hosts, export them in your shell or a local untracked `.env` file.
- Database is provider-neutral standard PostgreSQL (`pg` + Drizzle): Replit PostgreSQL, Neon, or local Postgres all work through `DATABASE_URL` alone. Hosts requiring TLS (e.g. Neon) need `?sslmode=require` on the URL — no code changes required.
- AI report provider is configuration-driven via `AI_PROVIDER` (`openai` default, `gemini`, or `groq`); only the selected provider's `*_API_KEY` is required (`GEMINI_MODEL`/`GROQ_MODEL` optional overrides). The deterministic strategy stays authoritative regardless of provider; no automatic failover between providers.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API and report contract, including output enums and length bounds
- `lib/db/src/schema/careerDiscovery.ts` — PostgreSQL schema for institutions, students, submissions, results, and per-attempt model usage
- `artifacts/api-server/src/routes/careerDiscovery.ts` — authenticated submission, polling, retry, and dashboard endpoints
- `artifacts/api-server/src/lib/careerReportWorker.ts` — durable queue polling, structured model calls, validation, retries, and token logging
- `artifacts/api-server/src/lib/careerMarketContext.ts` — institution-maintained market context supplied to the model
- `artifacts/career-discovery/src/pages/ReportDetail.tsx` — student report rendering
- `artifacts/career-discovery/src/pages/InstitutionDashboard.tsx` — institution-only aggregate dashboard

## Architecture decisions

- Clerk identifies students; the server authorizes institution administrators against the configured, verified admin email.
- Submissions are durable PostgreSQL queue records. The worker uses row locking and retries twice after the initial attempt.
- A student has one submission per configured institution. Dashboard aggregates suppress report-derived charts until at least five reports match the filters.
- Individual reports and answers are never returned by the institution dashboard. Each model attempt records its model and token counts without logging answer or report contents.
- Submission and retry requests are limited to five per signed-in account per 15-minute window per API process. Use a shared limiter if the API is scaled across multiple instances.
- The included market context intentionally has no verified figures; update it with institution-reviewed quarterly data before making market statistics available.
- Career-fit salary ranges are nullable; when verified ranges are absent from market context, the report displays that salary data is unavailable rather than guessing.

## Product

- Students complete a 13-question assessment, consent to cohort-level institutional insights, and receive a private structured report.
- Institution administrators filter cohort aggregates by department, year, and batch.
- Seed a local demonstration cohort with `CAREER_DEMO_SEED=true` and `pnpm --filter @workspace/scripts run seed:demo`. Seed records are clearly synthetic and the command refuses to run in production.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
