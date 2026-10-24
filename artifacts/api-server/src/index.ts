import app from "./app";
import {
  closeCareerReportWorker,
  startCareerReportWorker,
} from "./lib/careerReportWorker";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const embeddedWorkerEnabled =
  process.env.REPORT_WORKER_ENABLED !== "false" &&
  process.env.ENABLE_REPORT_WORKER !== "false";

if (embeddedWorkerEnabled) {
  startCareerReportWorker();
} else {
  logger.info("Embedded career report worker disabled via REPORT_WORKER_ENABLED=false");
}

const server = app.listen(port, () => {
  logger.info({ port, embeddedWorkerEnabled }, "Server listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close((serverError?: Error) => {
      if (serverError) {
        logger.error(
          { errorType: serverError.name },
          "HTTP server shutdown failed",
        );
      }
      const cleanup = embeddedWorkerEnabled
        ? closeCareerReportWorker()
        : import("@workspace/db").then((m) => m.pool.end());

      void cleanup
        .then(() => process.exit(serverError ? 1 : 0))
        .catch((error: unknown) => {
          logger.error(
            {
              errorType: error instanceof Error ? error.name : "UnknownError",
            },
            "Database pool shutdown failed",
          );
          process.exit(1);
        });
    });
  });
}
