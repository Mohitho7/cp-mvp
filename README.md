# Career Pathfinder

AI-powered career discovery for undergraduate students + privacy-safe
institution analytics. Independent, production-ready deployment:

```text
GitHub → Vercel → Managed PostgreSQL → Clerk → OpenAI
```

No Replit dependency. No persistent server process. No in-memory
production state.

## Product flow

```text
Student → 13-question assessment → POST /api/submit → pending
  → background processing (cron + poll-pump) → OpenAI strict JSON
  → Zod validation → report saved → done → frontend polling → report

Institution admin → GET /api/dashboard → privacy-safe aggregates
```

## Architecture

| Concern | Choice |
|---|---|
| Frontend | Vite + React + TypeScript (static, `web/`) |
| Backend | Vercel serverless functions (`api/`) + shared `src/` |
| Database | PostgreSQL + Drizzle ORM (`src/schema.ts`, `drizzle/0001_init.sql`) |
| Auth | Clerk (cookie session or Bearer, verified server-side) |
| AI | OpenAI strict structured outputs, server-side only |
| Validation | Zod (`src/reportSchema.ts` is the single source of truth) |
| Async work | Database-backed durable queue; Vercel Cron + poll-pump |
| Tests | Node built-in test runner (`tests/`, `pnpm test`) |

### Why no persistent worker

Vercel serverless has no always-on process. Instead:

1. `POST /api/submit` inserts a `pending` row and returns `201`
   immediately — it never generates inline.
2. `GET /api/worker/cron` (Vercel Cron, every 5 min, `CRON_SECRET`)
   drains due jobs with `FOR UPDATE SKIP LOCKED` claiming, stale-job
   recovery, 3 attempts max, and per-attempt token logging.
3. `GET /api/result/:id` opportunistically pumps the queue while a
   student polls (bounded: 2 jobs / 200 s), so reports complete even
   between cron ticks.

Job state lives entirely in PostgreSQL and survives restarts,
truncated invocations, and redeploys.

## API contract

```text
POST /api/submit              student: 13 answers → 201 {id, pending} | 400 | 409 | 429 | 503
GET  /api/result/:id          owner only → 200 (pending|processing|done|failed) | 400 | 401 | 404
POST /api/result/:id/retry    owner, failed only → 202 | 400 | 404 | 409 | 429
GET  /api/dashboard          admin only → 200 aggregates | 401 | 403 | 503
GET  /api/healthz             liveness (DB check) → 200 | 503

Compat aliases (same handlers, same security):
POST /api/submissions         GET /api/submissions/me
GET  /api/submissions/:id     POST /api/submissions/:id/retry
```

Ownership: students read only their own rows (`404` otherwise).
Dashboard: admins only (`403` for students). Aggregates never include
names, emails, answers, or individual reports; report-derived charts
are suppressed until **5** completed reports match the filters.

## Career report contract

Enforced by Zod on every LLM output (invalid output → retry):

- `careerFits`: 4–6 · `skillsToLearn`: 4–8 · `roadmap`: exactly 5 stages,
  ≤3 actions each · traits: integers 1–5 · lengths capped per field
- `careerHealth`: exactly `Stable | Fast-growth | High burnout |
  Oversaturated | High leverage`
- `salaryInrLpa`: a range **only** from verified market context,
  otherwise `null` (frontend shows “Salary data unavailable”)

## Local development

Requires Node 20+ and `pnpm`. This repo installs fully offline from a
warm pnpm store (`pnpm install --offline`); with network, plain
`pnpm install` works too.

```bash
cp .env.example .env   # fill DATABASE_URL, OPENAI_API_KEY, Clerk keys, ...
pnpm install
pnpm run db:migrate
CAREER_DEMO_SEED=true pnpm run seed:demo
pnpm run typecheck && pnpm run test
pnpm run dev:web       # UI only; API via `vercel dev` (needs Vercel CLI)
```

Seed guards: refuses to run when `NODE_ENV=production` and requires
`CAREER_DEMO_SEED=true`. Demo data is synthetic and schema-conformant.

## Deployment runbook (Vercel)

1. Push this repo to GitHub (`main`).
2. Create a Neon (or any managed) PostgreSQL database; use the **pooled**
   connection string for `DATABASE_URL`.
3. Import the repo in Vercel (build `pnpm build`, output `web/dist` —
   already in `vercel.json`). Set `maxDuration: 300` functions need a
   Pro/Fluid plan for generations past 60 s; Hobby truncates long runs
   (the queue heals via stale recovery, but expect slower reports).
4. Environment variables (Production + Preview as needed):
   `DATABASE_URL`, `OPENAI_API_KEY`, `CLERK_SECRET_KEY`,
   `CAREER_INSTITUTION_NAME`, `CAREER_INSTITUTION_ADMIN_EMAIL`,
   `CRON_SECRET`, `VITE_CLERK_PUBLISHABLE_KEY`
   (optional: `OPENAI_MODEL` default `gpt-5-mini`,
   `VITE_CLERK_PROXY_URL`).
5. Run migrations once against production (`pnpm run db:migrate` with
   production `DATABASE_URL` from a machine with DB access).
6. Seed demo **only** in preview/dev, never production.
7. Acceptance: student 13Q → pending → done → report persists on
   refresh; duplicate → `409`; cross-student → `404`; student dashboard
   → `403`; admin dashboard + filters + 5-student threshold; bundle
   contains no `OPENAI_API_KEY`/`sk-proj`/DB credentials/Clerk secret.

## Known limitations

- Live reports display **“Salary data unavailable”** until
  institution-reviewed quarterly market ranges are loaded into
  `src/marketContext.ts`. This is intentional — the system never
  fabricates market data.
- Rate limiting is database-backed (5 submits / 15 min / student).
- Vercel Cron below-Pro plans run daily: keep the poll-pump path in
  mind and prefer ≥5-minute cadence for demo responsiveness.
- Offline installs pin transitive versions in `pnpm-workspace.yaml`
  `overrides` to tarballs present in the local pnpm store; with network
  access these pins can be relaxed.
