import { createDb } from "@hookrelay/db";
import {
  createDeliveryQueue,
  createRedis,
  DELIVERY_QUEUE_NAME,
  Worker,
} from "@hookrelay/queue";
import { pino } from "pino";
import { env } from "./env";
import { createProcessor } from "./processor";
import { startSweeper } from "./sweeper";

// Longer than the 15 s request timeout, so a slow attempt is never treated as stalled and run twice.
const LOCK_DURATION_MS = 60_000;
// worker.close() waits for running jobs, which can take a full request timeout.
const SHUTDOWN_TIMEOUT_MS = 30_000;

const logger = pino({ level: env.LOG_LEVEL, base: { service: "worker" } });

const { db, pool } = createDb(env.DATABASE_URL);
// pg emits "error" when an idle pooled connection dies; unhandled, it would crash the process.
pool.on("error", (err) => logger.error({ err }, "postgres pool error"));

// Commands (queue adds, breaker state) fail fast while Redis is down; the BullMQ worker needs its own connection
// with maxRetriesPerRequest: null for its blocking reads.
const redis = createRedis(env.REDIS_URL, { forWorker: false });
const workerRedis = createRedis(env.REDIS_URL, { forWorker: true });
for (const client of [redis, workerRedis]) {
  // ioredis reconnects by itself; without a listener every failed attempt is an unhandled error event.
  client.on("error", (err) => logger.error({ err }, "redis error"));
}

const queue = createDeliveryQueue(redis);
queue.on("error", (err) => logger.error({ err }, "delivery queue error"));

// Job data is typed `unknown`: the processor validates it with zod rather than trusting what is in Redis.
const worker = new Worker<unknown, void>(
  DELIVERY_QUEUE_NAME,
  createProcessor({ db, redis, queue, logger }),
  {
    connection: workerRedis,
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: LOCK_DURATION_MS,
  },
);
worker.on("failed", (job, err) => {
  logger.error(
    { err, jobId: job?.id },
    "job failed; the sweeper will retry the delivery",
  );
});
worker.on("error", (err) => logger.error({ err }, "worker error"));

const stopSweeper = startSweeper({ db, queue, logger });
logger.info({ concurrency: env.WORKER_CONCURRENCY }, "worker started");

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "worker shutting down");

  setTimeout(() => {
    logger.error("worker shutdown timed out");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    await stopSweeper();
    await worker.close();
    await queue.close();
    await Promise.all([redis.quit(), workerRedis.quit()]);
    await pool.end();
    logger.info("worker shutdown complete");
  } catch (err) {
    logger.error({ err }, "worker shutdown failed");
    process.exitCode = 1;
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}
