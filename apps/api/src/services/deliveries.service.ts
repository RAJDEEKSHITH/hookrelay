import { enqueueDeliveries } from "@hookrelay/queue";
import { logger } from "../utils/logger";
import { deliveryQueue } from "../utils/queue";

// While Redis is down, ioredis queues and retries commands, which would hold the HTTP response for many
// seconds. The rows are already committed, so we stop waiting and let the sweeper (or the still-pending
// add, which is a no-op duplicate thanks to deterministic job ids) deliver them.
const ENQUEUE_TIMEOUT_MS = 2000;

/** Call only after the transaction that created these pending deliveries has committed. */
export async function enqueueFirstAttempts(deliveryIds: string[]): Promise<void> {
  if (deliveryIds.length === 0) return;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      enqueueDeliveries(
        deliveryQueue,
        deliveryIds.map((deliveryId) => ({ deliveryId, attemptNumber: 1, manual: false })),
      ),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`enqueue timed out after ${ENQUEUE_TIMEOUT_MS}ms`)), ENQUEUE_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    logger.warn({ err, deliveries: deliveryIds.length }, "enqueue failed; the sweeper will pick these deliveries up");
  } finally {
    clearTimeout(timer);
  }
}
