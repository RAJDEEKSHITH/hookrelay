import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";

function hmacHex(secret: string, body: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

/** Value of the `hookrelay-signature` header: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`. */
export function signPayload(secret: string, body: string, timestamp: number): string {
  return `t=${timestamp},v1=${hmacHex(secret, body, timestamp)}`;
}

export interface VerifySignatureInput {
  secret: string;
  header: string | undefined;
  /** The raw request body, exactly as received. Re-serialised JSON will not match. */
  body: string;
  toleranceSec: number;
  /** Unix seconds; defaults to the current time. */
  nowSec?: number;
}

export function verifySignature({ secret, header, body, toleranceSec, nowSec }: VerifySignatureInput): boolean {
  if (!header) return false;
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && value !== undefined && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && value !== undefined) signatures.push(value);
  }
  if (timestamp === undefined || signatures.length === 0) return false;

  const now = nowSec ?? Math.floor(Date.now() / 1000);
  // Both directions: an old timestamp is a replay, a far-future one would stay valid for too long.
  if (Math.abs(now - timestamp) > toleranceSec) return false;

  const expected = hmacHex(secret, body, timestamp);
  return signatures.some((signature) => safeEqual(signature, expected));
}
