import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ─── Tenants, users, invitations ────────────────────────────────────────────

export const userRole = pgEnum("user_role", ["owner", "member"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: userRole("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    index("users_tenant_id_idx").on(t.tenantId),
    // Exactly one owner per tenant (there is no ownership transfer).
    uniqueIndex("users_one_owner_per_tenant_uq").on(t.tenantId).where(sql`${t.role} = 'owner'`),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

// Invitations are always for the "member" role, so there is no role column.
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    email: varchar("email", { length: 255 }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invitations_token_uq").on(t.tokenHash),
    // One open invitation per email per tenant. The predicate cannot use now(), so expired but
    // unrevoked rows still count: resending revokes them before inserting the new invitation.
    uniqueIndex("invitations_open_email_uq")
      .on(t.tenantId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    index("invitations_tenant_idx").on(t.tenantId),
    check("invitations_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

// ─── API keys (used by customer backends to call POST /v1/events) ──────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    name: varchar("name", { length: 128 }).notNull(),
    prefix: varchar("prefix", { length: 32 }).notNull(), // first characters of the key, shown in the dashboard
    keyHash: varchar("key_hash", { length: 128 }).notNull(), // sha256 of the full key; the key itself is never stored
    // Written at most once per minute per key (conditional UPDATE), not on every request.
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_uq").on(t.keyHash),
    index("api_keys_tenant_idx").on(t.tenantId),
  ],
);

// ─── Endpoints (where webhooks are delivered) ──────────────────────────────

export const endpointsStatus = pgEnum("endpoints_status", ["active", "disabled"]);

export const endpoints = pgTable(
  "endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 1024 }).notNull(),
    description: text("description"),
    status: endpointsStatus("status").notNull().default("active"),
    // AES-256-GCM encrypted (we must be able to read it back to sign requests).
    signingSecretEncrypted: text("signing_secret_encrypted").notNull(),
    // AES-256-GCM encrypted JSON of extra headers, so customers can authenticate us to their server.
    customHeadersEncrypted: text("custom_headers_encrypted"),
    // Empty array means "subscribe to all event types".
    eventTypes: text("event_types").array().notNull().default(sql`'{}'::text[]`),
    // Retry budget for each new delivery (copied onto the delivery when it is created).
    maxAttempts: integer("max_attempts").notNull().default(8),
    // Counted by the worker, reset to 0 on success. At the auto-disable threshold (application
    // constant) the endpoint is switched to "disabled" so we stop hammering a dead server.
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    // Soft delete: deliveries keep pointing at the endpoint so history stays readable.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("endpoints_tenant_idx").on(t.tenantId),
    check("endpoints_url_http", sql`${t.url} ~* '^https?://'`),
    check("endpoints_description_length", sql`char_length(${t.description}) <= 6000`),
    check("endpoints_max_attempts_range", sql`${t.maxAttempts} between 1 and 20`),
    check("endpoints_failures_nonneg", sql`${t.consecutiveFailures} >= 0`),
  ],
);

// ─── Events ─────────────────────────────────────────────────────────────────

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    // From the Idempotency-Key header; the API generates a random one when the header is absent.
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("events_idempotency_uq").on(t.tenantId, t.idempotencyKey),
    index("events_tenant_created_idx").on(t.tenantId, t.createdAt),
    check("events_payload_object", sql`jsonb_typeof(${t.payload}) = 'object'`),
  ],
);

// ─── Deliveries (the outbox) and attempts ──────────────────────────────────

export const deliveryStatus = pgEnum("delivery_status", ["pending", "success", "dead"]);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    // No cascade on purpose: endpoints are soft-deleted, so history keeps its endpoint.
    endpointId: uuid("endpoint_id").notNull().references(() => endpoints.id),
    status: deliveryStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    // Absolute cap on attemptCount. Set to endpoint.maxAttempts on creation, and to
    // attemptCount + endpoint.maxAttempts on replay, which gives a replay a fresh retry budget.
    attemptLimit: integer("attempt_limit").notNull().default(8),
    // When the next attempt is due. The sweeper re-enqueues pending rows that are overdue.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("deliveries_event_endpoint_uq").on(t.eventId, t.endpointId),
    index("deliveries_due_idx").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
    index("deliveries_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("deliveries_endpoint_status_idx").on(t.endpointId, t.status),
    check("deliveries_attempt_count_nonneg", sql`${t.attemptCount} >= 0`),
    check("deliveries_attempt_limit_positive", sql`${t.attemptLimit} >= 1`),
    check("deliveries_attempts_within_limit", sql`${t.attemptCount} <= ${t.attemptLimit}`),
  ],
);

export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id").notNull().references(() => deliveries.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    statusCode: integer("status_code"), // null when the request never got a response (timeout, DNS, blocked)
    error: text("error"),
    durationMs: integer("duration_ms"),
    responseSnippet: text("response_snippet"), // first 1 KB of the response body
    isManual: boolean("is_manual").notNull().default(false), // true for the first attempt after a replay
    // Set by the worker to the moment the HTTP request started (the row is inserted after it finishes).
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("attempts_delivery_number_uq").on(t.deliveryId, t.attemptNumber),
    check("attempts_number_positive", sql`${t.attemptNumber} >= 1`),
  ],
);

// ─── Types ──────────────────────────────────────────────────────────────────

export type Role = (typeof userRole.enumValues)[number];
export type EndpointStatus = (typeof endpointsStatus.enumValues)[number];
export type DeliveryStatus = (typeof deliveryStatus.enumValues)[number];

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Endpoint = typeof endpoints.$inferSelect;
export type NewEndpoint = typeof endpoints.$inferInsert;
// Not named `Event`: that would shadow the global DOM/Node `Event` type.
export type WebhookEvent = typeof events.$inferSelect;
export type NewWebhookEvent = typeof events.$inferInsert;
export type Delivery = typeof deliveries.$inferSelect;
export type NewDelivery = typeof deliveries.$inferInsert;
export type DeliveryAttempt = typeof deliveryAttempts.$inferSelect;
export type NewDeliveryAttempt = typeof deliveryAttempts.$inferInsert;