import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

const createdTimestamp = {
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}

const timestamps = {
  ...createdTimestamp,
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const userRole = pgEnum("user_role",[
    "owner",
    "member"
])

export const tenants = pgTable("tenants",{
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name",{length: 128}).notNull(),
    ...createdTimestamp
})

export const users = pgTable("users",{
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId : uuid("tenant_id").references(() => tenants.id, {onDelete: "cascade"}),
    name: varchar("name",{length: 128}).notNull(),
    email: varchar("email",{length: 128}).notNull(),
    passwordHash: varchar("password_hash",{length: 128}).notNull(),
    role: userRole("role").notNull().default("member"),
    ...createdTimestamp
},(t) => [
    uniqueIndex("users_email,unique").on(t.email),
    index("users_tenant_id_idx").on(t.tenantId),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`)
])

export const invitations = pgTable("invitations",{
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId : uuid("tenant_id").references(() => tenants.id, {onDelete: "cascade"}),
    invitedBy: uuid("invited_by").references(() => users.id, {onDelete: "cascade"}),
    email: varchar("email",{length: 128}).notNull(),
    tokenHash: varchar("token_hash",{length: 128}).notNull(),
    acceptedAt: timestamp("accepted_at",{withTimezone: true}),
    expiresAt: timestamp("accepted_at",{withTimezone: true}).notNull(),
    revokedAt: timestamp("accepted_at",{withTimezone: true}),
    ...createdTimestamp
})

export const apiKeys = pgTable("api_keys",{
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {onDelete: "cascade"}).notNull(),
    createdBY: uuid("created_bY").references(() => users.id,{onDelete: "cascade"}).notNull(),
    name: varchar("name",{length: 128}).notNull(),
    keyHash: varchar("token_hash",{length: 128}).notNull(),
    // iam updating this field(lastUsedAt) for every 5 times, instead of updating for every request
    // which reduces unnecessary write load
    lastUsedAt: timestamp("last_used_at",{withTimezone: true}),
    revokedAt: timestamp("accepted_at",{withTimezone: true}),
    ...createdTimestamp
})