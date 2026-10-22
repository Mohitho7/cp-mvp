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

startCareerReportWorker();

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close((serverError) => {
      if (serverError) {
        logger.error(
          { errorType: serverError.name },
          "HTTP server shutdown failed",
        );
      }
      void closeCareerReportWorker()
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
