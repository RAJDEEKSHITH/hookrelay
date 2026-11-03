import { createRedis } from "@hookrelay/queue";
import { env } from "../config/env";
import { logger } from "./logger";

export const redis = createRedis(env.REDIS_URL, { forWorker: false });

// ioredis reconnects by itself; without a listener every failed attempt is printed as an unhandled error event.
redis.on("error", (err) => {
  logger.error({ err }, "redis error");
});
