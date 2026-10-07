import { getDb } from "../../../src/db.js";
import {
  ensureConfiguredInstitution,
  getSessionUserId,
} from "../../../src/auth.js";
import { DrizzleStore } from "../../../src/store.js";
import { handleRetrySubmission } from "../../../src/handlers.js";
import {
  adapt,
  authHeaders,
  queryParam,
  type HandlerResult,
} from "../../../src/http.js";

function routeId(req: { query: Record<string, string | string[] | undefined>; url?: string }): string | undefined {
  const value = req.query["id"];
  const fromQuery = Array.isArray(value) ? value[0] : value;
  if (fromQuery) return fromQuery;
  const match = req.url?.match(/\/api\/result\/([^/?]+)\/retry/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

// POST /api/result/:id/retry — requeue a failed report.
export default adapt(async (req): Promise<HandlerResult> => {
  if (req.method !== "POST") {
    return { status: 405, body: { error: "Method not allowed." } };
  }
  const { authorization, cookie } = authHeaders(req);
  const clerkUserId = await getSessionUserId(authorization, cookie);
  if (!clerkUserId) {
    return { status: 401, body: { error: "Sign in required." } };
  }
  const db = getDb();
  const institution = await ensureConfiguredInstitution(db);
  return handleRetrySubmission(
    {
      store: new DrizzleStore(db),
      institution,
      clerkUserId,
      now: new Date(),
    },
    routeId(req),
  );
});
