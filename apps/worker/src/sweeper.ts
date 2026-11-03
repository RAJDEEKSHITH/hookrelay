import { and, deliveries, eq, lt, sql, type Db } from "@hookrelay/db";
import { enqueueDeliveries, type DeliveryQueue } from "@hookrelay/queue";
import {
  SWEEP_BATCH_SIZE,
  SWEEP_GRACE_MS,
  SWEEP_INTERVAL_MS,
} from "@hookrelay/shared";
import type { Logger } from "pino";

export interface SweeperDeps {
  db: Db;
  queue: DeliveryQueue;
  logger: Logger;
}

/**
 * The outbox loop: a pending delivery that is overdue by more than the grace period has no job (the enqueue after
 * commit failed, the worker crashed, Redis lost data), so it gets one. Re-adding a job that still exists is a
 * no-op because job ids are deterministic, which also makes it safe to run in every worker process.
 */
async function sweep({ db, queue, logger }: SweeperDeps): Promise<void> {
  const overdue = await db
    .select({ id: deliveries.id, attemptCount: deliveries.attemptCount })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.status, "pending"),
        // The database clock, so worker clock skew cannot make rows look overdue early.
        lt(
          deliveries.nextAttemptAt,
          sql`now() - make_interval(secs => ${SWEEP_GRACE_MS / 1000})`,
        ),
      ),
    )
    .orderBy(deliveries.nextAttemptAt)
    .limit(SWEEP_BATCH_SIZE);
  if (overdue.length === 0) return;

  await enqueueDeliveries(
    queue,
    overdue.map((row) => ({
      deliveryId: row.id,
      attemptNumber: row.attemptCount + 1,
      manual: false,
    })),
  );
  logger.info(
    { count: overdue.length },
    "sweeper re-enqueued overdue deliveries",
  );
}

/** Runs now and then every interval; returns a stop function that waits for a sweep in progress. */
export function startSweeper(deps: SweeperDeps): () => Promise<void> {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const run = () => {
    running = sweep(deps)
      .catch((err: unknown) => deps.logger.error({ err }, "sweep failed"))
      .finally(() => {
        // A timeout chain instead of setInterval, so a slow sweep never overlaps the next one.
        if (!stopped) timer = setTimeout(run, SWEEP_INTERVAL_MS);
      });
  };
  run();

  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
