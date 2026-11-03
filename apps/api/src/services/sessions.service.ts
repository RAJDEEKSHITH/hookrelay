import { SESSION_TTL_SECONDS } from "@hookrelay/shared";
import { randomToken, sha256Hex } from "@hookrelay/webhook-core";
import { z } from "zod";
import { redis } from "../utils/redis";

const sessionSchema = z.object({ userId: z.uuid() });

// Only the hash is stored, so a Redis dump contains no usable session ids.
function sessionKey(sessionId: string): string {
  return `sess:${sha256Hex(sessionId)}`;
}

/** Returns the raw session id for the cookie. Fixed 7-day expiry, never extended. */
export async function createSession(userId: string): Promise<string> {
  const sessionId = randomToken(32);
  await redis.set(sessionKey(sessionId), JSON.stringify({ userId }), "EX", SESSION_TTL_SECONDS);
  return sessionId;
}

export async function getSessionUserId(sessionId: string): Promise<string | null> {
  const raw = await redis.get(sessionKey(sessionId));
  if (raw === null) return null;
  try {
    const result = sessionSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data.userId : null;
  } catch {
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
}
