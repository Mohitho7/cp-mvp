/**
 * Dedicated Background Worker Process for Career Pathfinder Report Generation.
 *
 * Runs as an independent service (e.g. on Render Background Worker or container),
 * consuming the durable PostgreSQL queue with bounded concurrency and AI quota protection.
 */
import { pool } from "@workspace/db";
import {
  startCareerReportWorker,
  stopCareerReportWorker,
} from "./lib/careerReportWorker";
import { logger } from "./lib/logger";
import { globalWorkerRateLimiter } from "./lib/workerRateLimiter";

const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || "30000", 10) || 30_000;

logger.info(
  {
    concurrency: globalWorkerRateLimiter.getConcurrencyLimit(),
    rpmLimit: globalWorkerRateLimiter.getRpmLimit(),
  },
  "Initializing dedicated Career Pathfinder report worker process",
);

startCareerReportWorker();

let shuttingDown = false;

async function handleShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Received termination signal, initiating graceful worker shutdown...");

  try {
    await stopCareerReportWorker(SHUTDOWN_TIMEOUT_MS);
    await pool.end();
    logger.info("Worker process terminated cleanly");
    process.exit(0);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Error during worker shutdown",
    );
    process.exit(1);
  }
}

process.once("SIGINT", () => void handleShutdown("SIGINT"));
process.once("SIGTERM", () => void handleShutdown("SIGTERM"));
