import { and, deliveries, deliveryAttempts, desc, endpoints, eq, events, inArray, isNull, sql } from "@hookrelay/db";
import { enqueueDeliveries, type DeliveryJobData } from "@hookrelay/queue";
import type { DeliveryAttemptDto, DeliveryDto, EventDto } from "@hookrelay/shared";
import { AppError } from "../utils/app-error";
import { db } from "../utils/db";
import { logger } from "../utils/logger";
import { deliveryQueue } from "../utils/queue";
import type { ListDeliveriesQuery } from "../validators/deliveries.validator";

// events.service depends on this module (fan-out enqueue, an event's deliveries), so the event shown on the
// delivery detail is mapped here rather than imported back from there.
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// While Redis is down, ioredis queues and retries commands, which would hold the HTTP response for many
// seconds. The rows are already committed, so we stop waiting and let the sweeper (or the still-pending
// add, which is a no-op duplicate thanks to deterministic job ids) deliver them.
const ENQUEUE_TIMEOUT_MS = 2000;

/** Call only after the transaction that made these deliveries pending has committed. */
async function enqueueAfterCommit(jobs: DeliveryJobData[]): Promise<void> {
  if (jobs.length === 0) return;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      enqueueDeliveries(deliveryQueue, jobs),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`enqueue timed out after ${ENQUEUE_TIMEOUT_MS}ms`)), ENQUEUE_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    logger.warn({ err, deliveries: jobs.length }, "enqueue failed; the sweeper will pick these deliveries up");
  } finally {
    clearTimeout(timer);
  }
}

export async function enqueueFirstAttempts(deliveryIds: string[]): Promise<void> {
  await enqueueAfterCommit(deliveryIds.map((deliveryId) => ({ deliveryId, attemptNumber: 1, manual: false })));
}

// Joined with the endpoint (even a soft-deleted one, so history keeps its URL) and the event type.
const dtoColumns = {
  id: deliveries.id,
  eventId: deliveries.eventId,
  eventType: events.eventType,
  endpointId: deliveries.endpointId,
  endpointUrl: endpoints.url,
  status: deliveries.status,
  attemptCount: deliveries.attemptCount,
  attemptLimit: deliveries.attemptLimit,
  nextAttemptAt: deliveries.nextAttemptAt,
  lastAttemptAt: deliveries.lastAttemptAt,
  completedAt: deliveries.completedAt,
  createdAt: deliveries.createdAt,
};

function selectDeliveries() {
  return db
    .select(dtoColumns)
    .from(deliveries)
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId));
}

type DeliveryRow = Awaited<ReturnType<typeof selectDeliveries>>[number];

function toDto(row: DeliveryRow): DeliveryDto {
  return {
    ...row,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const notFound = () => new AppError(404, "not_found", "Delivery not found");

export async function listDeliveries(tenantId: string, query: ListDeliveriesQuery): Promise<DeliveryDto[]> {
  const rows = await selectDeliveries()
    .where(
      and(
        eq(deliveries.tenantId, tenantId),
        query.status ? eq(deliveries.status, query.status) : undefined,
        query.endpointId ? eq(deliveries.endpointId, query.endpointId) : undefined,
        query.eventId ? eq(deliveries.eventId, query.eventId) : undefined,
      ),
    )
    .orderBy(desc(deliveries.createdAt), desc(deliveries.id))
    .limit(query.limit);
  return rows.map(toDto);
}

/** Every delivery of one event (at most one per endpoint), for the event detail page. */
export async function listEventDeliveries(tenantId: string, eventId: string): Promise<DeliveryDto[]> {
  const rows = await selectDeliveries()
    .where(and(eq(deliveries.tenantId, tenantId), eq(deliveries.eventId, eventId)))
    .orderBy(desc(deliveries.createdAt), desc(deliveries.id));
  return rows.map(toDto);
}

async function findDelivery(tenantId: string, id: string): Promise<DeliveryDto> {
  const [row] = await selectDeliveries().where(and(eq(deliveries.id, id), eq(deliveries.tenantId, tenantId)));
  if (!row) throw notFound();
  return toDto(row);
}

export async function getDelivery(tenantId: string, id: string): Promise<DeliveryDto> {
  const delivery = await findDelivery(tenantId, id);
  const [attemptRows, eventRows] = await Promise.all([
    db
      .select({
        id: deliveryAttempts.id,
        attemptNumber: deliveryAttempts.attemptNumber,
        statusCode: deliveryAttempts.statusCode,
        error: deliveryAttempts.error,
        durationMs: deliveryAttempts.durationMs,
        responseSnippet: deliveryAttempts.responseSnippet,
        isManual: deliveryAttempts.isManual,
        startedAt: deliveryAttempts.startedAt,
      })
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.deliveryId, id))
      .orderBy(deliveryAttempts.attemptNumber),
    db
      .select({
        id: events.id,
        type: events.eventType,
        idempotencyKey: events.idempotencyKey,
        payload: events.payload,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(and(eq(events.id, delivery.eventId), eq(events.tenantId, tenantId))),
  ]);
  const attempts: DeliveryAttemptDto[] = attemptRows.map((row) => ({ ...row, startedAt: row.startedAt.toISOString() }));
  const [eventRow] = eventRows;
  const event: EventDto | undefined = eventRow && {
    ...eventRow,
    payload: isJsonObject(eventRow.payload) ? eventRow.payload : {},
    createdAt: eventRow.createdAt.toISOString(),
  };
  return { ...delivery, attempts, ...(event ? { event } : {}) };
}

/**
 * Re-opens a finished delivery with a fresh retry budget. A single conditional UPDATE, so a double click (or two
 * users) replays once: the second request finds the row already pending and gets 409.
 */
export async function replayDelivery(tenantId: string, id: string): Promise<DeliveryDto> {
  const [replayed] = await db
    .update(deliveries)
    .set({
      status: "pending",
      attemptLimit: sql`${deliveries.attemptCount} + ${endpoints.maxAttempts}`,
      nextAttemptAt: sql`now()`,
      completedAt: null,
    })
    .from(endpoints)
    .where(
      and(
        eq(deliveries.id, id),
        eq(deliveries.tenantId, tenantId),
        inArray(deliveries.status, ["dead", "success"]),
        eq(endpoints.id, deliveries.endpointId),
        eq(endpoints.status, "active"),
        isNull(endpoints.deletedAt),
      ),
    )
    .returning({ id: deliveries.id, attemptCount: deliveries.attemptCount });

  if (!replayed) {
    // Nothing changed; work out why for a useful error.
    const current = await findDelivery(tenantId, id);
    if (current.status === "pending") throw new AppError(409, "conflict", "This delivery is still pending");
    throw new AppError(409, "conflict", "The endpoint is disabled or deleted; enable it before replaying");
  }

  await enqueueAfterCommit([{ deliveryId: replayed.id, attemptNumber: replayed.attemptCount + 1, manual: true }]);
  return findDelivery(tenantId, id);
}
