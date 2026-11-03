import { createDeliveryQueue } from "@hookrelay/queue";
import { logger } from "./logger";
import { redis } from "./redis";

export const deliveryQueue = createDeliveryQueue(redis);

deliveryQueue.on("error", (err) => {
  logger.error({ err }, "delivery queue error");
});
