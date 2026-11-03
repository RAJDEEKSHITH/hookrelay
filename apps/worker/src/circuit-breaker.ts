import type { Redis } from "@hookrelay/queue";
import {
  BREAKER_BASE_COOLDOWN_MS,
  BREAKER_FAILURE_THRESHOLD,
  BREAKER_MAX_COOLDOWN_MS,
  REQUEST_TIMEOUT_MS,
} from "@hookrelay/shared";
import {
  canAttempt,
  initialBreakerState,
  recordFailure,
  recordSuccess,
  type BreakerSettings,
  type BreakerState,
} from "@hookrelay/webhook-core";
import { z } from "zod";

const STATE_TTL_SECONDS = 24 * 60 * 60;
// Longer than one request, so the probe slot cannot expire while the probe is still running.
const PROBE_TTL_MS = REQUEST_TIMEOUT_MS + 5000;

const settings: BreakerSettings = {
  failureThreshold: BREAKER_FAILURE_THRESHOLD,
  baseCooldownMs: BREAKER_BASE_COOLDOWN_MS,
  maxCooldownMs: BREAKER_MAX_COOLDOWN_MS,
};

const breakerStateSchema = z.object({
  consecutiveFailures: z.number().int().nonnegative(),
  openUntil: z.number().int().nullable(),
  cooldownMs: z.number().int().nonnegative(),
});

const stateKey = (endpointId: string) => `cb:${endpointId}`;
const probeKey = (endpointId: string) => `cb:${endpointId}:probe`;

/** Missing or unreadable state means closed: the breaker is best-effort and Postgres stays the source of truth. */
async function loadState(
  redis: Redis,
  endpointId: string,
): Promise<BreakerState> {
  const raw = await redis.get(stateKey(endpointId));
  if (raw === null) return initialBreakerState();
  try {
    const parsed = breakerStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : initialBreakerState();
  } catch {
    return initialBreakerState();
  }
}

async function saveState(
  redis: Redis,
  endpointId: string,
  state: BreakerState,
): Promise<void> {
  if (state.consecutiveFailures === 0 && state.openUntil === null) {
    await redis.del(stateKey(endpointId));
    return;
  }
  await redis.set(
    stateKey(endpointId),
    JSON.stringify(state),
    "EX",
    STATE_TTL_SECONDS,
  );
}

export type BreakerGate =
  { allowed: true } | { allowed: false; retryAt: number };

/**
 * Asks the breaker whether this job may send now. Open: wait until the cooldown ends. Half-open: exactly one job
 * wins the probe slot (SET NX); the others wait until that slot expires, by which time the probe has closed or
 * re-opened the breaker.
 */
export async function checkBreaker(
  redis: Redis,
  endpointId: string,
  now: number,
): Promise<BreakerGate> {
  const decision = canAttempt(await loadState(redis, endpointId), now);
  if (decision.mode === "closed") return { allowed: true };
  if (decision.mode === "open")
    return { allowed: false, retryAt: decision.retryAt };
  const acquired = await redis.set(
    probeKey(endpointId),
    "1",
    "PX",
    PROBE_TTL_MS,
    "NX",
  );
  return acquired === null
    ? { allowed: false, retryAt: now + PROBE_TTL_MS }
    : { allowed: true };
}

/**
 * Read-modify-write without a lock: two workers finishing at the same moment can lose one update. That only shifts
 * when the breaker opens by a failure or so, which is acceptable for a short-term, best-effort signal.
 */
export async function recordBreakerResult(
  redis: Redis,
  endpointId: string,
  success: boolean,
  now: number,
): Promise<void> {
  if (success) {
    await saveState(redis, endpointId, recordSuccess());
    return;
  }
  await saveState(
    redis,
    endpointId,
    recordFailure(await loadState(redis, endpointId), now, settings),
  );
}
