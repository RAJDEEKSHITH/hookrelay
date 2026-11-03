import { randomUUID } from "node:crypto";
import { and, deliveries, desc, endpoints, eq, events, isNull, sql, tenants, type Endpoint } from "@hookrelay/db";
import { MAX_ENDPOINTS_PER_TENANT, type EndpointDto, type EventIngestDto } from "@hookrelay/shared";
import { decryptSecret, encryptSecret, randomToken, validateEndpointUrl } from "@hookrelay/webhook-core";
import { env } from "../config/env";
import { AppError } from "../utils/app-error";
import { db } from "../utils/db";
import { logger } from "../utils/logger";
import { redis } from "../utils/redis";
import type { CreateEndpointInput, UpdateEndpointInput } from "../validators/endpoints.validator";
import { enqueueFirstAttempts } from "./deliveries.service";

const TEST_EVENT_TYPE = "hookrelay.test";
const TEST_EVENT_PAYLOAD = { message: "Test event from Hookrelay" };

// The encrypted custom headers are selected only to derive their names; they never leave this module.
const rowColumns = {
  id: endpoints.id,
  url: endpoints.url,
  description: endpoints.description,
  status: endpoints.status,
  eventTypes: endpoints.eventTypes,
  maxAttempts: endpoints.maxAttempts,
  customHeadersEncrypted: endpoints.customHeadersEncrypted,
  consecutiveFailures: endpoints.consecutiveFailures,
  disabledAt: endpoints.disabledAt,
  createdAt: endpoints.createdAt,
  updatedAt: endpoints.updatedAt,
};
type EndpointRow = Pick<Endpoint, keyof typeof rowColumns>;

function toDto(row: EndpointRow): EndpointDto {
  const { customHeadersEncrypted, disabledAt, createdAt, updatedAt, ...rest } = row;
  return {
    ...rest,
    customHeaderNames: customHeadersEncrypted ? Object.keys(decryptHeaders(customHeadersEncrypted)) : [],
    disabledAt: disabledAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function decryptHeaders(encrypted: string): Record<string, string> {
  const parsed: unknown = JSON.parse(decryptSecret(encrypted, env.ENCRYPTION_KEY));
  if (typeof parsed !== "object" || parsed === null) return {};
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function encryptHeaders(headers: Record<string, string> | null | undefined): string | null {
  if (!headers || Object.keys(headers).length === 0) return null;
  return encryptSecret(JSON.stringify(headers), env.ENCRYPTION_KEY);
}

function newSigningSecret(): string {
  return `whsec_${randomToken(32)}`;
}

async function assertUrlAllowed(url: string): Promise<void> {
  const check = await validateEndpointUrl(url, {
    allowHttp: env.ALLOW_HTTP_DESTINATIONS,
    allowPrivate: env.ALLOW_PRIVATE_DESTINATIONS,
  });
  if (!check.ok) {
    throw new AppError(400, "validation_error", "Request validation failed", [
      { path: "body.url", message: check.reason },
    ]);
  }
}

const notFound = () => new AppError(404, "not_found", "Endpoint not found");

/** Not soft-deleted and owned by the tenant; another tenant's endpoint looks exactly like a missing one. */
const visible = (tenantId: string, id: string) =>
  and(eq(endpoints.id, id), eq(endpoints.tenantId, tenantId), isNull(endpoints.deletedAt));

async function findRow(tenantId: string, id: string): Promise<EndpointRow> {
  const [row] = await db.select(rowColumns).from(endpoints).where(visible(tenantId, id));
  if (!row) throw notFound();
  return row;
}

/** Best-effort: if this fails the breaker simply re-closes on the next success. */
async function resetCircuitBreaker(endpointId: string): Promise<void> {
  try {
    await redis.del(`cb:${endpointId}`);
  } catch (err) {
    logger.warn({ err, endpointId }, "could not reset circuit breaker");
  }
}

export async function listEndpoints(tenantId: string): Promise<EndpointDto[]> {
  const rows = await db
    .select(rowColumns)
    .from(endpoints)
    .where(and(eq(endpoints.tenantId, tenantId), isNull(endpoints.deletedAt)))
    .orderBy(desc(endpoints.createdAt), desc(endpoints.id));
  return rows.map(toDto);
}

export async function getEndpoint(tenantId: string, id: string): Promise<EndpointDto> {
  return toDto(await findRow(tenantId, id));
}

/** The signing secret is in this response (and rotate's) only; it is stored encrypted. */
export async function createEndpoint(tenantId: string, input: CreateEndpointInput): Promise<EndpointDto> {
  // DNS lookup happens before the transaction so no row lock is held while waiting on the network.
  await assertUrlAllowed(input.url);
  const signingSecret = newSigningSecret();

  const row = await db.transaction(async (tx) => {
    // Serialises creates per tenant, so two simultaneous requests cannot both pass the limit check.
    await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).for("update");
    const [count] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(endpoints)
      .where(and(eq(endpoints.tenantId, tenantId), isNull(endpoints.deletedAt)));
    if ((count?.value ?? 0) >= MAX_ENDPOINTS_PER_TENANT) {
      throw new AppError(409, "limit_reached", `A tenant can have at most ${MAX_ENDPOINTS_PER_TENANT} endpoints`);
    }
    const [inserted] = await tx
      .insert(endpoints)
      .values({
        tenantId,
        url: input.url,
        description: input.description ?? null,
        eventTypes: input.eventTypes,
        maxAttempts: input.maxAttempts,
        signingSecretEncrypted: encryptSecret(signingSecret, env.ENCRYPTION_KEY),
        customHeadersEncrypted: encryptHeaders(input.customHeaders),
      })
      .returning(rowColumns);
    if (!inserted) throw new Error("endpoint insert returned no row");
    return inserted;
  });
  return { ...toDto(row), signingSecret };
}

export async function updateEndpoint(tenantId: string, id: string, input: UpdateEndpointInput): Promise<EndpointDto> {
  const current = await findRow(tenantId, id);
  if (input.url !== undefined && input.url !== current.url) await assertUrlAllowed(input.url);

  const changes: Partial<typeof endpoints.$inferInsert> = {};
  if (input.url !== undefined) changes.url = input.url;
  if (input.description !== undefined) changes.description = input.description;
  if (input.eventTypes !== undefined) changes.eventTypes = input.eventTypes;
  if (input.maxAttempts !== undefined) changes.maxAttempts = input.maxAttempts;
  if (input.customHeaders !== undefined) changes.customHeadersEncrypted = encryptHeaders(input.customHeaders);
  if (input.status === "active") {
    // Re-enabling clears both failure counters: the long-term one here, the breaker in Redis below.
    changes.status = "active";
    changes.consecutiveFailures = 0;
    changes.disabledAt = null;
  } else if (input.status === "disabled" && current.status !== "disabled") {
    changes.status = "disabled";
    changes.disabledAt = new Date();
  }
  if (Object.keys(changes).length === 0) return toDto(current);

  const [row] = await db.update(endpoints).set(changes).where(visible(tenantId, id)).returning(rowColumns);
  if (!row) throw notFound();
  if (input.status === "active") await resetCircuitBreaker(id);
  return toDto(row);
}

/** Soft delete: deliveries keep pointing at the row, so history stays readable. */
export async function deleteEndpoint(tenantId: string, id: string): Promise<void> {
  const [row] = await db
    .update(endpoints)
    .set({ deletedAt: sql`now()` })
    .where(visible(tenantId, id))
    .returning({ id: endpoints.id });
  if (!row) throw notFound();
}

/** The old secret stops working immediately; there is no overlap window. */
export async function rotateSecret(tenantId: string, id: string): Promise<EndpointDto> {
  const signingSecret = newSigningSecret();
  const [row] = await db
    .update(endpoints)
    .set({ signingSecretEncrypted: encryptSecret(signingSecret, env.ENCRYPTION_KEY) })
    .where(visible(tenantId, id))
    .returning(rowColumns);
  if (!row) throw notFound();
  return { ...toDto(row), signingSecret };
}

/** A real event and delivery to this endpoint only, regardless of its eventTypes filter. */
export async function sendTestEvent(tenantId: string, id: string): Promise<EventIngestDto> {
  const { eventId, deliveryId } = await db.transaction(async (tx) => {
    const [endpoint] = await tx
      .select({ status: endpoints.status, maxAttempts: endpoints.maxAttempts })
      .from(endpoints)
      .where(visible(tenantId, id));
    if (!endpoint) throw notFound();
    if (endpoint.status !== "active") throw new AppError(409, "conflict", "Enable the endpoint before sending a test event");

    const [event] = await tx
      .insert(events)
      .values({ tenantId, idempotencyKey: randomUUID(), eventType: TEST_EVENT_TYPE, payload: TEST_EVENT_PAYLOAD })
      .returning({ id: events.id });
    if (!event) throw new Error("event insert returned no row");
    const [delivery] = await tx
      .insert(deliveries)
      .values({ tenantId, eventId: event.id, endpointId: id, attemptLimit: endpoint.maxAttempts })
      .returning({ id: deliveries.id });
    if (!delivery) throw new Error("delivery insert returned no row");
    return { eventId: event.id, deliveryId: delivery.id };
  });
  await enqueueFirstAttempts([deliveryId]);
  return { eventId, deliveries: 1, duplicate: false };
}
