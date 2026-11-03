import { Queue, type DefaultJobOptions } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

// Re-exported so the worker uses this package's single copy of BullMQ; `instanceof DelayedError` checks inside
// BullMQ only work when the error class comes from the same copy.
export { DelayedError, Worker, type Job } from "bullmq";
export type { Redis } from "ioredis";

export const DELIVERY_QUEUE_NAME = "deliveries";
export const DELIVERY_JOB_NAME = "deliver";

export const deliveryJobDataSchema = z.object({
  deliveryId: z.uuid(),
  attemptNumber: z.number().int().positive(),
  manual: z.boolean(),
});
export type DeliveryJobData = z.infer<typeof deliveryJobDataSchema>;

export type DeliveryQueue = Queue<DeliveryJobData, void, typeof DELIVERY_JOB_NAME>;

const defaultJobOptions: DefaultJobOptions = {
  // Retries are recorded in Postgres by the worker, not by BullMQ.
  attempts: 1,
  // A finished job would otherwise keep its deterministic id, and the sweeper could never re-add it.
  removeOnComplete: true,
  removeOnFail: true,
};

/** BullMQ forbids ":" in custom job ids. Deterministic, so adding the same attempt twice is a no-op. */
export function deliveryJobId(deliveryId: string, attemptNumber: number): string {
  return `${deliveryId}_${attemptNumber}`;
}

/**
 * `forWorker`: BullMQ workers run blocking commands and require `maxRetriesPerRequest: null`. Other clients keep
 * the ioredis default so a call fails after a few retries instead of hanging while Redis is down.
 */
export function createRedis(url: string, { forWorker }: { forWorker: boolean }): Redis {
  return forWorker ? new Redis(url, { maxRetriesPerRequest: null }) : new Redis(url);
}

export function createDeliveryQueue(redis: Redis): DeliveryQueue {
  return new Queue<DeliveryJobData, void, typeof DELIVERY_JOB_NAME>(DELIVERY_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions,
  });
}

export async function enqueueDelivery(
  queue: DeliveryQueue,
  data: DeliveryJobData,
  { delayMs = 0 }: { delayMs?: number } = {},
): Promise<void> {
  await queue.add(DELIVERY_JOB_NAME, data, {
    jobId: deliveryJobId(data.deliveryId, data.attemptNumber),
    delay: Math.max(0, delayMs),
  });
}

/** One round trip for many deliveries (event fan-out), each with no delay. */
export async function enqueueDeliveries(queue: DeliveryQueue, jobs: DeliveryJobData[]): Promise<void> {
  if (jobs.length === 0) return;
  await queue.addBulk(
    jobs.map((data) => ({
      name: DELIVERY_JOB_NAME,
      data,
      opts: { jobId: deliveryJobId(data.deliveryId, data.attemptNumber) },
    })),
  );
}
