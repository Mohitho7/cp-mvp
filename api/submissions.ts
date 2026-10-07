import { getDb } from "../src/db.js";
import {
  ensureConfiguredInstitution,
  getSessionUserId,
} from "../src/auth.js";
import { DrizzleStore } from "../src/store.js";
import {
  handleCreateSubmission,
  handleGetSubmission,
  handleRetrySubmission,
} from "../src/handlers.js";
import {
  adapt,
  authHeaders,
  readJsonBody,
  type HandlerResult,
} from "../src/http.js";

// Compatibility endpoints sharing the canonical handlers:
//   POST /api/submissions          (alias of POST /api/submit)
//   GET  /api/submissions/me       (current student's submission)
//   GET  /api/submissions/:id      (alias of GET /api/result/:id)
//   POST /api/submissions/:id/retry (alias of POST /api/result/:id/retry)
export default adapt(async (req): Promise<HandlerResult> => {
  const { authorization, cookie } = authHeaders(req);
  const clerkUserId = await getSessionUserId(authorization, cookie);
  if (!clerkUserId) {
    return { status: 401, body: { error: "Sign in required." } };
  }
  const db = getDb();
  const institution = await ensureConfiguredInstitution(db);
  const ctx = {
    store: new DrizzleStore(db),
    institution,
    clerkUserId,
    now: new Date(),
  };

  const path = (req.url ?? "").split("?")[0];
  const idMatch = path.match(/\/api\/submissions\/([^/]+)(\/retry)?$/);

  if (req.method === "POST" && /\/api\/submissions\/?$/.test(path)) {
    return handleCreateSubmission(ctx, await readJsonBody(req));
  }
  if (req.method === "GET" && /\/api\/submissions\/me\/?$/.test(path)) {
    return handleGetSubmission(ctx, undefined);
  }
  if (idMatch && req.method === "GET" && !idMatch[2]) {
    return handleGetSubmission(ctx, decodeURIComponent(idMatch[1]));
  }
  if (idMatch && req.method === "POST" && idMatch[2] === "/retry") {
    return handleRetrySubmission(ctx, decodeURIComponent(idMatch[1]));
  }
  return { status: 404, body: { error: "Not found." } };
});
