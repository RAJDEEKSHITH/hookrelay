import { MAX_PAYLOAD_BYTES, type ApiErrorBody } from "@hookrelay/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../utils/app-error";
import { logger } from "../utils/logger";

/** Errors thrown by express.json() carry a `type` such as "entity.parse.failed". */
function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("type" in err)) return undefined;
  return typeof err.type === "string" ? err.type : undefined;
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  switch (bodyParserErrorType(err)) {
    case "entity.parse.failed":
      return new AppError(400, "invalid_json", "Request body is not valid JSON");
    case "entity.too.large":
      return new AppError(413, "payload_too_large", `Request body must be at most ${MAX_PAYLOAD_BYTES / 1024} KB`);
    default:
      return new AppError(500, "internal_error", "Internal server error");
  }
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "not_found", "Route not found"));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const appError = toAppError(err);
  if (appError.status >= 500) {
    // The original error is logged, never sent: clients only see the generic message and the request id.
    logger.error({ err, requestId: req.requestId }, "unhandled error");
  }
  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      requestId: req.requestId,
    },
  };
  res.status(appError.status).json(body);
};
