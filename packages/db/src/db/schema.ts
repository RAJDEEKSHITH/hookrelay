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


export const userRole = pgEnum("user_role", ["owner", "member"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
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
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ]
);

export const invitations = pgTable("invitations", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: userRole("role").notNull().default("member"),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invitations_token_uq").on(t.tokenHash),
    uniqueIndex("invitations_open_email_uq")
      .on(t.tenantId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    index("invitations_tenant_idx").on(t.tenantId),
    check("invitations_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ]
);

export const apiKeys = pgTable("api_keys", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id,{ onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id,{ onDelete: "set null" }),
    name: varchar("name", { length: 128 }).notNull(),
    prefix: varchar("prefix", { length: 32 }).notNull(),
    keyHash: varchar("key_hash", { length: 128 }).notNull(),
    // iam updating this field(lastUsedAt) for every 5 times, instead of updating for every request
    // which reduces unnecessary write load
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_uq").on(t.keyHash),
    index("api_keys_tenant_idx").on(t.tenantId),
  ]
);

export const endpointsStatus = pgEnum("endpoints_status", [
  "active",
  "disabled",
]);

export const endpoints = pgTable("endpoints",{
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 1024 }).notNull(),
    description: text("description"),
    status: endpointsStatus("status").notNull().default("active"),
    signingSecret: varchar("signing_secret", { length: 255 }).notNull(),
    customHeadersEncrypted: text("custom_headers_encrypted"), // we are giving flexbility to allow different authentication methods for our customers customer
    // We don't want our server to keep sending webhooks indefinitely
    // to an endpoint that repeatedly fails. so we maintain counter and
    // we will auto disable it after reaching certian limit(configured in application logic)
    consecutiveFailures: integer("consecutive_failures").notNull().default(0), // reset to zero after success
    // Empty array means "subscribe to all event types".
    maxAttempts: integer("max_attempts").notNull().default(8),
    eventTypes: text("event_types").array().notNull().default(sql`'{}'::text[]`),
    rateLimitPerSec: integer("rate_limit_per_sec").notNull().default(10),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("endpoints_tenant_idx").on(t.tenantId),
    check("endpoints_url_http", sql`${t.url} ~* '^https?://'`),
    check("description_length_limit", sql`char_length(${t.description}) <= 6000`),
    check("endpoints_max_attempts_range", sql`${t.maxAttempts} between 1 and 20`),
    check("endpoints_rate_limit_positive", sql`${t.rateLimitPerSec} > 0`),
    check("endpoints_failures_nonneg", sql`${t.consecutiveFailures} >= 0`),
  ]
);

export const events = pgTable("events",{
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("events_idempotency_uq").on(t.tenantId, t.idempotencyKey),
    index("events_tenant_created_idx").on(t.tenantId, t.createdAt),
  ]
);

export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "success",
  "dead",
]);

export const deliveries = pgTable("deliveries",{
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").notNull().references(() => endpoints.id),
    status: deliveryStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
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
  ]
);

export const deliveryAttempts = pgTable("delivery_attempts",{
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id").notNull().references(() => deliveries.id,{ onDelete: "cascade"}),
    attemptNumber: integer("attempt_number").notNull(),
    statusCode: integer("status_code"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    responseSnippet: text("response_snippet"),
    isManual: boolean("is_manual").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attempts_delivery_number_uq").on(t.deliveryId, t.attemptNumber),
    check("attempts_number_positive", sql`${t.attemptNumber} >= 1`),
  ]
);

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Endpoint = typeof endpoints.$inferSelect;
export type NewEndpoint = typeof endpoints.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Delivery = typeof deliveries.$inferSelect;
export type DeliveryAttempt = typeof deliveryAttempts.$inferSelect;