import { getDb } from "../src/db.js";
import {
  ensureConfiguredInstitution,
  getSessionUserId,
} from "../src/auth.js";
import { DrizzleStore } from "../src/store.js";
import { handleCreateSubmission } from "../src/handlers.js";
import {
  adapt,
  authHeaders,
  readJsonBody,
  type HandlerResult,
} from "../src/http.js";

// POST /api/submit — validate, save answers as pending, return immediately.
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
  const body = await readJsonBody(req);
  return handleCreateSubmission(
    { store: new DrizzleStore(db), institution, clerkUserId, now: new Date() },
    body,
  );
});
