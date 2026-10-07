import { sql } from "drizzle-orm";
import { getDb } from "../src/db.js";
import { adapt, type HandlerResult } from "../src/http.js";

// GET /api/healthz — liveness probe (DB connectivity included).
export default adapt(async (req): Promise<HandlerResult> => {
  if (req.method !== "GET") {
    return { status: 405, body: { error: "Method not allowed." } };
  }
  let dbOk = false;
  try {
    await getDb().execute(sql`select 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return {
    status: dbOk ? 200 : 503,
    body: { status: dbOk ? "ok" : "degraded", db: dbOk ? "connected" : "unavailable" },
  };
});
