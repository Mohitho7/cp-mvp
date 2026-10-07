import { getDb } from "../../src/db.js";
import {
  ensureConfiguredInstitution,
  getSessionUserId,
} from "../../src/auth.js";
import { DrizzleStore } from "../../src/store.js";
import { handleGetSubmission } from "../../src/handlers.js";
import { generateCareerReport, llmConfigFromEnv } from "../../src/llm.js";
import { drainQueue } from "../../src/worker.js";
import {
  adapt,
  authHeaders,
  queryParam,
  type HandlerResult,
} from "../../src/http.js";

function routeId(req: { query: Record<string, string | string[] | undefined>; url?: string }): string | undefined {
  const value = req.query["id"];
  const fromQuery = Array.isArray(value) ? value[0] : value;
  if (fromQuery) return fromQuery;
  const match = req.url?.match(/\/api\/result\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

// GET /api/result/:id — own status/report. Opportunistically pumps the
// durable queue (serverless-safe: row locking prevents double processing;
// stale recovery heals truncated invocations).
export default adapt(async (req): Promise<HandlerResult> => {
  if (req.method !== "GET") {
    return { status: 405, body: { error: "Method not allowed." } };
  }
  const { authorization, cookie } = authHeaders(req);
  const clerkUserId = await getSessionUserId(authorization, cookie);
  if (!clerkUserId) {
    return { status: 401, body: { error: "Sign in required." } };
  }
  const db = getDb();
  const institution = await ensureConfiguredInstitution(db);
  const store = new DrizzleStore(db);
  const ctx = { store, institution, clerkUserId, now: new Date() };

  let result = await handleGetSubmission(ctx, routeId(req));
  if (
    result.status === 200 &&
    ((result.body as { status: string }).status === "pending" ||
      (result.body as { status: string }).status === "processing")
  ) {
    try {
      const config = llmConfigFromEnv();
      await drainQueue(store, (job) => generateCareerReport(job, config), {
        maxJobs: 2,
        timeBudgetMs: 200_000,
      });
      result = await handleGetSubmission(
        { ...ctx, now: new Date() },
        routeId(req),
      );
    } catch {
      // Pump failures must never break the status read; cron retries later.
    }
  }
  return result;
});
