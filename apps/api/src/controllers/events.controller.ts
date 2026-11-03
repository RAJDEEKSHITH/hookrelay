import type { ApiDataBody, EventIngestDto } from "@hookrelay/shared";
import type { Request, Response } from "express";
import * as eventsService from "../services/events.service";
import { AppError } from "../utils/app-error";
import { idempotencyKeySchema, type IngestEventInput } from "../validators/events.validator";

export async function ingestEvent(
  req: Request<Record<string, string>, unknown, IngestEventInput>,
  res: Response<ApiDataBody<EventIngestDto>>,
): Promise<void> {
  if (!req.apiKey) throw new AppError(401, "unauthorized", "Missing API key");
  // validate() covers body/query/params only, so the one header input is parsed here.
  const key = idempotencyKeySchema.safeParse(req.get("idempotency-key"));
  if (!key.success) {
    throw new AppError(
      400,
      "validation_error",
      "Request validation failed",
      key.error.issues.map((issue) => ({ path: "headers.idempotency-key", message: issue.message })),
    );
  }
  const result = await eventsService.ingestEvent(req.apiKey.tenantId, req.body, key.data);
  res.status(result.duplicate ? 200 : 202).json({ data: result });
}
