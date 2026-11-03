import { createApp } from "./app";
import { env } from "./config/env";
import { pool } from "./utils/db";
import { logger } from "./utils/logger";
import { deliveryQueue } from "./utils/queue";
import { redis } from "./utils/redis";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = createApp().listen(env.PORT, (error) => {
  if (error) {
    logger.fatal({ err: error }, "api failed to start");
    process.exit(1);
  }
  logger.info({ port: env.PORT }, "api listening");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "api shutting down");

  // A stuck keep-alive connection or query must not keep the process alive forever.
  setTimeout(() => {
    logger.error("api shutdown timed out");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    // Stop accepting requests and let in-flight ones finish before closing what they use.
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await deliveryQueue.close();
    await redis.quit();
    await pool.end();
    logger.info("api shutdown complete");
  } catch (err) {
    logger.error({ err }, "api shutdown failed");
    process.exitCode = 1;
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}
