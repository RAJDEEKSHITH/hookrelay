import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  BACKOFF_FACTOR,
} from "@hookrelay/shared";
import { nextRetryDelayMs, parseRetryAfter } from "@hookrelay/webhook-core";
import type { SendResult } from "./http-client";

const RETRY_AFTER_MIN_MS = 1000;

/** Only 2xx counts. 3xx is a failure because redirects are not followed. */
export function isSuccess(result: SendResult): boolean {
  return (
    result.kind === "response" &&
    result.statusCode >= 200 &&
    result.statusCode < 300
  );
}

/**
 * Delay before the next try after attempt `attemptNumber` failed. A 429 or 503 with a valid `Retry-After` is
 * honoured, clamped to 1 s .. the backoff cap so a receiver can neither make us hammer it nor park a delivery
 * for days; everything else uses exponential backoff with equal jitter.
 */
export function retryDelayMs(
  result: SendResult,
  attemptNumber: number,
  now: number,
  random: () => number = Math.random,
): number {
  if (
    result.kind === "response" &&
    (result.statusCode === 429 || result.statusCode === 503)
  ) {
    const retryAfterMs = parseRetryAfter(result.retryAfter, now);
    if (retryAfterMs !== null)
      return Math.min(
        Math.max(retryAfterMs, RETRY_AFTER_MIN_MS),
        BACKOFF_CAP_MS,
      );
  }
  return nextRetryDelayMs(
    attemptNumber,
    { baseMs: BACKOFF_BASE_MS, factor: BACKOFF_FACTOR, capMs: BACKOFF_CAP_MS },
    random,
  );
}

export type AttemptPlan =
  | { status: "success" }
  | { status: "pending"; delayMs: number }
  | { status: "dead" };

export interface PlanAttemptInput {
  result: SendResult;
  attemptNumber: number;
  attemptLimit: number;
  now: number;
  random?: () => number;
}

/** What the delivery becomes after attempt `attemptNumber` (section 6). */
export function planAfterAttempt({
  result,
  attemptNumber,
  attemptLimit,
  now,
  random,
}: PlanAttemptInput): AttemptPlan {
  if (isSuccess(result)) return { status: "success" };
  if (attemptNumber >= attemptLimit) return { status: "dead" };
  return {
    status: "pending",
    delayMs: retryDelayMs(result, attemptNumber, now, random),
  };
}
