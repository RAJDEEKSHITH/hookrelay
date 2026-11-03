// Response shapes of the API. Dates are ISO 8601 strings. These unions mirror the Postgres enums in
// @hookrelay/db; they are repeated here because packages never import each other.
export type UserRole = "owner" | "member";
export type EndpointStatus = "active" | "disabled";
export type DeliveryStatus = "pending" | "success" | "dead";

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface TenantDto {
  id: string;
  name: string;
  createdAt: string;
}

export interface MeDto {
  user: UserDto;
  tenant: TenantDto;
}

export interface InvitationDto {
  id: string;
  email: string;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
  /** Accept link with the raw token; present only in the create response, never stored. */
  link?: string;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  createdBy: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  /** The full key; present only in the create response, never stored. */
  key?: string;
}

export interface EndpointDto {
  id: string;
  url: string;
  description: string | null;
  status: EndpointStatus;
  eventTypes: string[];
  maxAttempts: number;
  customHeaderNames: string[];
  consecutiveFailures: number;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only in the create and rotate-secret responses. */
  signingSecret?: string;
}

export interface EventDto {
  id: string;
  type: string;
  idempotencyKey: string;
  createdAt: string;
  // Detail-only fields: lists leave them out so 100 rows of up-to-256 KB payloads are never sent at once.
  payload?: Record<string, unknown>;
  deliveries?: DeliveryDto[];
}

/** Result of POST /v1/events and POST /v1/endpoints/:id/test. */
export interface EventIngestDto {
  eventId: string;
  /** Deliveries created; for a duplicate, the deliveries the original request created. */
  deliveries: number;
  duplicate: boolean;
}

export interface DeliveryAttemptDto {
  id: string;
  attemptNumber: number;
  statusCode: number | null;
  error: string | null;
  durationMs: number | null;
  responseSnippet: string | null;
  isManual: boolean;
  startedAt: string;
}

export interface DeliveryDto {
  id: string;
  eventId: string;
  eventType: string;
  endpointId: string;
  endpointUrl: string;
  status: DeliveryStatus;
  attemptCount: number;
  attemptLimit: number;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Detail only (GET /v1/deliveries/:id), oldest attempt first. */
  attempts?: DeliveryAttemptDto[];
  /** Detail only (GET /v1/deliveries/:id). */
  event?: EventDto;
}

export interface StatsDto {
  /** Deliveries created in the last 24 hours, by current status. */
  last24h: Record<DeliveryStatus, number>;
  /** success / (success + dead) over the same window; null when nothing has completed. */
  successRate: number | null;
}

/** Every success body with content. Logout and DELETE return 204 with no body; health probes are exempt. */
export interface ApiDataBody<T> {
  data: T;
}

export type ApiErrorCode =
  | "validation_error"
  | "invalid_json"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "limit_reached"
  | "payload_too_large"
  | "idempotency_mismatch"
  | "internal_error";

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
    requestId: string;
  };
}
