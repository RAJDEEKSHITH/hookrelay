CREATE TYPE "delivery_status" AS ENUM('pending', 'success', 'dead');--> statement-breakpoint
CREATE TYPE "endpoints_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"name" varchar(128) NOT NULL,
	"prefix" varchar(32) NOT NULL,
	"key_hash" varchar(128) NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"status" "delivery_status" DEFAULT 'pending'::"delivery_status" NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"attempt_limit" integer DEFAULT 8 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_attempt_count_nonneg" CHECK ("attempt_count" >= 0),
	CONSTRAINT "deliveries_attempt_limit_positive" CHECK ("attempt_limit" >= 1),
	CONSTRAINT "deliveries_attempts_within_limit" CHECK ("attempt_count" <= "attempt_limit")
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"delivery_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status_code" integer,
	"error" text,
	"duration_ms" integer,
	"response_snippet" text,
	"is_manual" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attempts_number_positive" CHECK ("attempt_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"url" varchar(1024) NOT NULL,
	"description" text,
	"status" "endpoints_status" DEFAULT 'active'::"endpoints_status" NOT NULL,
	"signing_secret_encrypted" text NOT NULL,
	"custom_headers_encrypted" text,
	"event_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "endpoints_url_http" CHECK ("url" ~* '^https?://'),
	CONSTRAINT "endpoints_description_length" CHECK (char_length("description") <= 6000),
	CONSTRAINT "endpoints_max_attempts_range" CHECK ("max_attempts" between 1 and 20),
	CONSTRAINT "endpoints_failures_nonneg" CHECK ("consecutive_failures" >= 0)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_payload_object" CHECK (jsonb_typeof("payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"invited_by" uuid,
	"email" varchar(255) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_email_lowercase" CHECK ("email" = lower("email"))
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'member'::"user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_uq" ON "api_keys" ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_tenant_idx" ON "api_keys" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_event_endpoint_uq" ON "deliveries" ("event_id","endpoint_id");--> statement-breakpoint
CREATE INDEX "deliveries_due_idx" ON "deliveries" ("next_attempt_at") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "deliveries_tenant_created_idx" ON "deliveries" ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "deliveries_endpoint_status_idx" ON "deliveries" ("endpoint_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_delivery_number_uq" ON "delivery_attempts" ("delivery_id","attempt_number");--> statement-breakpoint
CREATE INDEX "endpoints_tenant_idx" ON "endpoints" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_idempotency_uq" ON "events" ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "events_tenant_created_idx" ON "events" ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_uq" ON "invitations" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_open_email_uq" ON "invitations" ("tenant_id","email") WHERE "accepted_at" is null and "revoked_at" is null;--> statement-breakpoint
CREATE INDEX "invitations_tenant_idx" ON "invitations" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" ("email");--> statement-breakpoint
CREATE INDEX "users_tenant_id_idx" ON "users" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_one_owner_per_tenant_uq" ON "users" ("tenant_id") WHERE "role" = 'owner';--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_endpoint_id_endpoints_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "endpoints"("id");--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_delivery_id_deliveries_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;