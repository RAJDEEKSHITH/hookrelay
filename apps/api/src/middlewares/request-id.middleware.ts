import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "../utils/logger";

export const requestId: RequestHandler = (req, res, next) => {
  const id = randomUUID();
  const startedAt = process.hrtime.bigint();
  req.requestId = id;
  res.setHeader("x-request-id", id);

  res.on("finish", () => {
    logger.info(
      {
        requestId: id,
        method: req.method,
        // Path only: query strings may carry values that do not belong in logs.
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      },
      "request",
    );
  });
  next();
};
