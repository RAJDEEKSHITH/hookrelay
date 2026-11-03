import { randomUUID } from "node:crypto";
import { and, deliveries, desc, endpoints, eq, events, isNull, sql } from "@hookrelay/db";
import type { EventDto, EventIngestDto } from "@hookrelay/shared";
import { stableStringify } from "@hookrelay/webhook-core";
import { AppError } from "../utils/app-error";
import { db } from "../utils/db";
import type { IngestEventInput, ListEventsQuery } from "../validators/events.validator";
import { enqueueFirstAttempts, listEventDeliveries } from "./deliveries.service";

const listColumns = {
  id: events.id,
  type: events.eventType,
  idempotencyKey: events.idempotencyKey,
  createdAt: events.createdAt,
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lists leave out the payload (up to 256 KB each); only the detail includes it. */
export async function listEvents(tenantId: string, query: ListEventsQuery): Promise<EventDto[]> {
  const rows = await db
    .select(listColumns)
    .from(events)
    .where(and(eq(events.tenantId, tenantId), query.type ? eq(events.eventType, query.type) : undefined))
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(query.limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getEvent(tenantId: string, id: string): Promise<EventDto> {
  const [row] = await db
    .select({ ...listColumns, payload: events.payload })
    .from(events)
    .where(and(eq(events.id, id), eq(events.tenantId, tenantId)));
  if (!row) throw new AppError(404, "not_found", "Event not found");
  return {
    ...row,
    // The database only accepts JSON objects (events_payload_object); the guard just narrows the type.
    payload: isJsonObject(row.payload) ? row.payload : {},
    createdAt: row.createdAt.toISOString(),
    deliveries: await listEventDeliveries(tenantId, id),
  };
}

/**
 * Stores the event and one pending delivery per matching endpoint in a single transaction (the outbox), then
 * enqueues the first attempts. If enqueueing fails the rows are already committed, so the sweeper delivers them.
 */
export async function ingestEvent(
  tenantId: string,
  input: IngestEventInput,
  idempotencyKey: string | undefined,
): Promise<EventIngestDto> {
  const result = await db.transaction(async (tx) => {
    // A concurrent request with the same key blocks on the unique index until this one commits, then
    // takes the duplicate path below, so a key can never produce two events.
    const [inserted] = await tx
      .insert(events)
      .values({ tenantId, idempotencyKey: idempotencyKey ?? randomUUID(), eventType: input.type, payload: input.data })
      .onConflictDoNothing({ target: [events.tenantId, events.idempotencyKey] })
      .returning({ id: events.id });

    if (!inserted) {
      const key = idempotencyKey ?? "";
      const [existing] = await tx
        .select({ id: events.id, eventType: events.eventType, payload: events.payload })
        .from(events)
        .where(and(eq(events.tenantId, tenantId), eq(events.idempotencyKey, key)));
      if (!existing) throw new Error("idempotency conflict but no existing event");
      // jsonb does not keep key order, so the payloads are compared in a canonical form.
      if (existing.eventType !== input.type || stableStringify(existing.payload) !== stableStringify(input.data)) {
        throw new AppError(422, "idempotency_mismatch", "This Idempotency-Key was already used with a different request");
      }
      const [count] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(deliveries)
        .where(eq(deliveries.eventId, existing.id));
      return { eventId: existing.id, deliveryIds: [], deliveries: count?.value ?? 0, duplicate: true };
    }

    const matching = await tx
      .select({ id: endpoints.id, maxAttempts: endpoints.maxAttempts })
      .from(endpoints)
      .where(
        and(
          eq(endpoints.tenantId, tenantId),
          eq(endpoints.status, "active"),
          isNull(endpoints.deletedAt),
          // Empty event_types means "subscribed to everything".
          sql`(${endpoints.eventTypes} = '{}' or ${input.type} = any(${endpoints.eventTypes}))`,
        ),
      );
    const created =
      matching.length === 0
        ? []
        : await tx
            .insert(deliveries)
            .values(
              matching.map((endpoint) => ({
                tenantId,
                eventId: inserted.id,
                endpointId: endpoint.id,
                // Copied now, so later edits to the endpoint do not change deliveries already in flight.
                attemptLimit: endpoint.maxAttempts,
              })),
            )
            .returning({ id: deliveries.id });
    const deliveryIds = created.map((delivery) => delivery.id);
    return { eventId: inserted.id, deliveryIds, deliveries: deliveryIds.length, duplicate: false };
  });

  // Only after commit: a job must never point at a row that is not committed yet.
  await enqueueFirstAttempts(result.deliveryIds);
  return { eventId: result.eventId, deliveries: result.deliveries, duplicate: result.duplicate };
}
