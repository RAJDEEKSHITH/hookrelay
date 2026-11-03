import type { RequestHandler } from "express";
import { z } from "zod";
import { authenticateApiKey } from "../services/api-keys.service";
import { AppError } from "../utils/app-error";

const authorizationSchema = z.string().regex(/^Bearer\s+\S+$/i);

/** Only POST /v1/events accepts API keys; every other route uses the session cookie. */
export const requireApiKey: RequestHandler = async (req, _res, next) => {
  const header = authorizationSchema.safeParse(req.headers.authorization);
  if (!header.success) {
    next(new AppError(401, "unauthorized", "Missing API key: send Authorization: Bearer <key>"));
    return;
  }
  const key = header.data.replace(/^Bearer\s+/i, "");
  const apiKey = await authenticateApiKey(key);
  if (apiKey === null) {
    next(new AppError(401, "unauthorized", "Invalid or revoked API key"));
    return;
  }
  req.apiKey = apiKey;
  next();
};
