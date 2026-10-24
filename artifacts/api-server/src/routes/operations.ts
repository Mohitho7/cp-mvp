/**
 * Operational metrics endpoint for authorized operators.
 *
 * Provides non-sensitive queue metrics, throughput, latency, AI provider errors/tokens,
 * and database connection pool stats. Strictly excludes student PII, answers, or report bodies.
 */
import { Router, type IRouter, type RequestHandler } from "express";
import { authorizeInstitutionAdmin, getSignedInUserId } from "../lib/institutionAccess";
import { operationalMetrics } from "../lib/operationalMetrics";

const router: IRouter = Router();

const authorizeOperator: RequestHandler = async (req, res, next) => {
  // Check optional operations API key header (e.g. for synthetic monitors/metrics scrapers)
  const opsKey = process.env.OPERATIONS_KEY?.trim();
  const headerKey = req.headers["x-operations-key"];
  if (opsKey && typeof headerKey === "string" && headerKey === opsKey) {
    return next();
  }

  // Otherwise require signed-in institution admin
  const userId = getSignedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Operator authentication required." });
    return;
  }

  const isAdmin = await authorizeInstitutionAdmin(userId);
  if (!isAdmin) {
    res.status(403).json({ error: "Operator access denied: institution admin required." });
    return;
  }

  next();
};

router.get("/operations/metrics", authorizeOperator, async (_req, res) => {
  try {
    const snapshot = await operationalMetrics.getSnapshot();
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({
      error: "Failed to collect operational metrics",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
