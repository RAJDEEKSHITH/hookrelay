import type { UserRole } from "@hookrelay/shared";

declare global {
  namespace Express {
    interface Request {
      /** Set by request-id.middleware for every request; echoed in error bodies and logs. */
      requestId: string;
      /** Set by auth.middleware on session routes. */
      auth?: { userId: string; tenantId: string; role: UserRole };
      /** Set by api-key.middleware on POST /v1/events. */
      apiKey?: { apiKeyId: string; tenantId: string };
    }
  }
}
