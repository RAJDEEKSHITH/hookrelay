import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@hookrelay/shared";
import type { CookieOptions, Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";

const baseOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  signed: true,
  path: "/",
};

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE_NAME, sessionId, { ...baseOptions, maxAge: SESSION_TTL_SECONDS * 1000 });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, baseOptions);
}

// cookie-parser puts `false` in signedCookies when the signature does not match.
const sessionIdSchema = z.string().min(1).max(256);

/** The session id from the signed cookie, or null when it is missing or its signature is invalid. */
export function readSessionCookie(req: Request): string | null {
  const signedCookies: unknown = req.signedCookies;
  if (typeof signedCookies !== "object" || signedCookies === null) return null;
  const result = sessionIdSchema.safeParse(Reflect.get(signedCookies, SESSION_COOKIE_NAME));
  return result.success ? result.data : null;
}
