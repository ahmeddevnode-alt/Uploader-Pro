import app from "./app";
import { logger } from "./lib/logger";
import { flushState, initializeStore, startWatcher } from "./lib/store";
import { resumeDecryptJobs } from "./routes/uploader";

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

async function start() {
  await initializeStore();
  startWatcher();
  resumeDecryptJobs();
  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
  const shutdown = async () => {
    server.close();
    await flushState();
    process.exit(0);
  };
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
}

void start().catch((error: unknown) => {
  logger.error({ err: error }, "Server startup failed.");
  process.exit(1);
});
