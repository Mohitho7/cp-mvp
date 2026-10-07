import { getDb } from "../src/db.js";
import {
  authorizeInstitutionAdmin,
  getSessionUserId,
} from "../src/auth.js";
import { queryDashboard } from "../src/dashboard.js";
import { handleGetDashboard } from "../src/handlers.js";
import { adapt, authHeaders, type HandlerResult } from "../src/http.js";

// GET /api/dashboard — institution admins only; aggregates only.
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
  const admin = await authorizeInstitutionAdmin(db, clerkUserId);
  if (!admin.ok) {
    if (admin.reason === "unavailable") {
      return {
        status: 503,
        body: { error: "Institution access is not configured." },
      };
    }
    return {
      status: 403,
      body: { error: "Institution administrator access required." },
    };
  }
  return handleGetDashboard(admin.access, req.query ?? {}, (id, name, filters) =>
    queryDashboard(db, id, name, filters),
  );
});
