import {
  and,
  deliveries,
  deliveryAttempts,
  endpoints,
  eq,
  events,
  sql,
  type Db,
} from "@hookrelay/db";
import {
  DelayedError,
  deliveryJobDataSchema,
  enqueueDelivery,
  type DeliveryQueue,
  type Job,
  type Redis,
} from "@hookrelay/queue";
import {
  AUTO_DISABLE_THRESHOLD,
  REQUEST_TIMEOUT_MS,
  RESPONSE_SNIPPET_BYTES,
} from "@hookrelay/shared";
import { decryptSecret } from "@hookrelay/webhook-core";
import type { Logger } from "pino";
import { z } from "zod";
import { checkBreaker, recordBreakerResult } from "./circuit-breaker";
import { env } from "./env";
import { sendWebhook } from "./http-client";
import { isSuccess, planAfterAttempt } from "./policy";

export interface ProcessorDeps {
  db: Db;
  redis: Redis;
  queue: DeliveryQueue;
  logger: Logger;
}

const customHeadersSchema = z.record(z.string(), z.string());

/**
 * The only update that may change a delivery for attempt n: still pending and exactly n - 1 attempts recorded.
 * A stale or duplicate job (sweeper re-add, replay racing a retry) matches no row and changes nothing.
 */
function expectedState(deliveryId: string, attemptNumber: number) {
  return and(
    eq(deliveries.id, deliveryId),
    eq(deliveries.status, "pending"),
    eq(deliveries.attemptCount, attemptNumber - 1),
  );
}

/** One BullMQ job = one delivery attempt (section 6). */
export function createProcessor({ db, redis, queue, logger }: ProcessorDeps) {
  return async function processDelivery(
    job: Job<unknown, void>,
    token?: string,
  ): Promise<void> {
    const parsed = deliveryJobDataSchema.safeParse(job.data);
    if (!parsed.success) {
      logger.error(
        { jobId: job.id, issues: parsed.error.issues },
        "invalid job data; dropping job",
      );
      return;
    }
    const { deliveryId, attemptNumber, manual } = parsed.data;
    const log = logger.child({ deliveryId, attemptNumber });

    const [row] = await db
      .select({
        status: deliveries.status,
        attemptCount: deliveries.attemptCount,
        attemptLimit: deliveries.attemptLimit,
        endpointId: endpoints.id,
        url: endpoints.url,
        endpointStatus: endpoints.status,
        endpointDeletedAt: endpoints.deletedAt,
        signingSecretEncrypted: endpoints.signingSecretEncrypted,
        customHeadersEncrypted: endpoints.customHeadersEncrypted,
        eventId: events.id,
        eventType: events.eventType,
        eventCreatedAt: events.createdAt,
        payload: events.payload,
      })
      .from(deliveries)
      .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
      .innerJoin(events, eq(events.id, deliveries.eventId))
      .where(eq(deliveries.id, deliveryId));

    if (
      !row ||
      row.status !== "pending" ||
      row.attemptCount + 1 !== attemptNumber
    ) {
      log.debug(
        { status: row?.status, attemptCount: row?.attemptCount },
        "stale or duplicate job; skipping",
      );
      return;
    }

    if (row.endpointStatus !== "active" || row.endpointDeletedAt !== null) {
      await db
        .update(deliveries)
        .set({ status: "dead", completedAt: sql`now()` })
        .where(expectedState(deliveryId, attemptNumber));
      log.info(
        { endpointId: row.endpointId },
        "endpoint disabled or deleted; delivery is dead",
      );
      return;
    }

    // Before the breaker check, so a decryption failure never holds the half-open probe slot. It throws: the job
    // fails without using an attempt, and the sweeper retries it later.
    const signingSecret = decryptSecret(
      row.signingSecretEncrypted,
      env.ENCRYPTION_KEY,
    );
    const customHeaders = row.customHeadersEncrypted
      ? customHeadersSchema.parse(
          JSON.parse(
            decryptSecret(row.customHeadersEncrypted, env.ENCRYPTION_KEY),
          ),
        )
      : {};

    const gate = await checkBreaker(redis, row.endpointId, Date.now());
    if (!gate.allowed) {
      // Not an attempt: the same job waits. next_attempt_at moves too, so the sweeper does not treat the delivery
      // as lost while it is parked.
      await db
        .update(deliveries)
        .set({ nextAttemptAt: new Date(gate.retryAt) })
        .where(expectedState(deliveryId, attemptNumber));
      await job.moveToDelayed(gate.retryAt, token);
      throw new DelayedError();
    }

    const body = JSON.stringify({
      id: row.eventId,
      type: row.eventType,
      createdAt: row.eventCreatedAt.toISOString(),
      data: row.payload,
    });
    const result = await sendWebhook({
      url: row.url,
      body,
      signingSecret,
      headers: {
        ...customHeaders,
        "hookrelay-event-id": row.eventId,
        "hookrelay-event-type": row.eventType,
        "hookrelay-delivery-id": deliveryId,
        "hookrelay-attempt": String(attemptNumber),
      },
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxResponseBytes: RESPONSE_SNIPPET_BYTES,
      allowHttp: env.ALLOW_HTTP_DESTINATIONS,
      allowPrivate: env.ALLOW_PRIVATE_DESTINATIONS,
    });
    const success = isSuccess(result);
    const plan = planAfterAttempt({
      result,
      attemptNumber,
      attemptLimit: row.attemptLimit,
      now: Date.now(),
    });

    const outcome = await db.transaction(async (tx) => {
      // First, so a concurrent duplicate blocks on the row lock and then matches nothing.
      const [updated] = await tx
        .update(deliveries)
        .set({
          status: plan.status,
          attemptCount: attemptNumber,
          lastAttemptAt: result.startedAt,
          ...(plan.status === "pending"
            ? {
                nextAttemptAt: sql`now() + make_interval(secs => ${plan.delayMs / 1000})`,
              }
            : { completedAt: sql`now()` }),
        })
        .where(expectedState(deliveryId, attemptNumber))
        .returning({ id: deliveries.id });
      if (!updated) return { recorded: false, autoDisabled: false };

      await tx.insert(deliveryAttempts).values({
        deliveryId,
        attemptNumber,
        statusCode: result.kind === "response" ? result.statusCode : null,
        error: result.kind === "error" ? result.error : null,
        durationMs: result.durationMs,
        responseSnippet:
          result.kind === "response" ? result.responseSnippet : null,
        isManual: manual,
        startedAt: result.startedAt,
      });

      if (success) {
        // Conditional, so the common case (already 0) does not rewrite the row and bump updated_at.
        await tx
          .update(endpoints)
          .set({ consecutiveFailures: 0 })
          .where(
            and(
              eq(endpoints.id, row.endpointId),
              sql`${endpoints.consecutiveFailures} <> 0`,
            ),
          );
        return { recorded: true, autoDisabled: false };
      }

      // One statement, so concurrent failures cannot lose increments. SET expressions all see the old row.
      const reachesLimit = sql`${endpoints.status} = 'active' and ${endpoints.consecutiveFailures} + 1 >= ${AUTO_DISABLE_THRESHOLD}`;
      const [endpoint] = await tx
        .update(endpoints)
        .set({
          consecutiveFailures: sql`${endpoints.consecutiveFailures} + 1`,
          status: sql`case when ${reachesLimit} then 'disabled'::endpoints_status else ${endpoints.status} end`,
          disabledAt: sql`case when ${reachesLimit} then now() else ${endpoints.disabledAt} end`,
        })
        .where(eq(endpoints.id, row.endpointId))
        .returning({
          consecutiveFailures: endpoints.consecutiveFailures,
          status: endpoints.status,
        });
      return {
        recorded: true,
        autoDisabled:
          endpoint?.status === "disabled" &&
          endpoint.consecutiveFailures === AUTO_DISABLE_THRESHOLD,
      };
    });

    if (!outcome.recorded) {
      log.info("delivery changed while sending; result discarded");
      return;
    }
    log.info(
      {
        status: plan.status,
        statusCode: result.kind === "response" ? result.statusCode : undefined,
        error: result.kind === "error" ? result.error : undefined,
        durationMs: result.durationMs,
      },
      "attempt recorded",
    );
    if (outcome.autoDisabled) {
      log.warn(
        { endpointId: row.endpointId },
        `endpoint auto-disabled after ${AUTO_DISABLE_THRESHOLD} consecutive failures`,
      );
    }

    // Everything below is after commit and best-effort: the outcome is already in Postgres.
    try {
      await recordBreakerResult(redis, row.endpointId, success, Date.now());
    } catch (err) {
      log.warn({ err }, "could not update the circuit breaker");
    }
    if (plan.status === "pending") {
      try {
        await enqueueDelivery(
          queue,
          { deliveryId, attemptNumber: attemptNumber + 1, manual: false },
          { delayMs: plan.delayMs },
        );
      } catch (err) {
        log.warn(
          { err },
          "could not enqueue the next attempt; the sweeper will pick it up",
        );
      }
    }
  };
}
