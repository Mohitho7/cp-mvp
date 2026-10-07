import { getDb } from "../../src/db.js";
import { DrizzleStore } from "../../src/store.js";
import { drainQueue } from "../../src/worker.js";
import { generateCareerReport, llmConfigFromEnv } from "../../src/llm.js";
import { adapt, header, type HandlerResult } from "../../src/http.js";

// GET /api/worker/cron — Vercel Cron drains the durable queue.
// Requires CRON_SECRET (Vercel sends it as the Bearer token automatically).
export default adapt(async (req): Promise<HandlerResult> => {
  if (req.method !== "GET" && req.method !== "POST") {
    return { status: 405, body: { error: "Method not allowed." } };
  }
  const configured = process.env.CRON_SECRET?.trim() ?? "";
  if (!configured) {
    return { status: 503, body: { error: "Worker cron is not configured." } };
  }
  const provided =
    header(req, "authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (provided !== configured) {
    return { status: 401, body: { error: "Unauthorized." } };
  }
  const config = llmConfigFromEnv();
  const { processed } = await drainQueue(
    new DrizzleStore(getDb()),
    (job) => generateCareerReport(job, config),
    { timeBudgetMs: 240_000, maxJobs: 25 },
  );
  return { status: 200, body: { processed } };
});
