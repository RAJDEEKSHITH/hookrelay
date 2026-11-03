export interface BreakerSettings {
  failureThreshold: number;
  baseCooldownMs: number;
  maxCooldownMs: number;
}

/**
 * Closed: `openUntil` is null. Open: `now < openUntil`. Half-open: `now >= openUntil`, one probe may run (the
 * worker enforces "one" with a Redis NX key). `cooldownMs` is the length of the current or last open period.
 */
export interface BreakerState {
  consecutiveFailures: number;
  openUntil: number | null;
  cooldownMs: number;
}

export type BreakerDecision = { mode: "closed" } | { mode: "open"; retryAt: number } | { mode: "half_open" };

export function initialBreakerState(): BreakerState {
  return { consecutiveFailures: 0, openUntil: null, cooldownMs: 0 };
}

export function canAttempt(state: BreakerState, now: number): BreakerDecision {
  if (state.openUntil === null) return { mode: "closed" };
  if (now < state.openUntil) return { mode: "open", retryAt: state.openUntil };
  return { mode: "half_open" };
}

export function recordFailure(state: BreakerState, now: number, settings: BreakerSettings): BreakerState {
  const consecutiveFailures = state.consecutiveFailures + 1;

  if (state.openUntil !== null) {
    // Requests already in flight when the breaker opened can fail while it is still open. They must not extend
    // or double the cooldown; only a failed half-open probe re-opens it.
    if (now < state.openUntil) return { ...state, consecutiveFailures };
    const cooldownMs = Math.min(state.cooldownMs * 2, settings.maxCooldownMs);
    return { consecutiveFailures, openUntil: now + cooldownMs, cooldownMs };
  }

  if (consecutiveFailures >= settings.failureThreshold) {
    const cooldownMs = Math.min(settings.baseCooldownMs, settings.maxCooldownMs);
    return { consecutiveFailures, openUntil: now + cooldownMs, cooldownMs };
  }
  return { ...state, consecutiveFailures };
}

/** Any success closes the breaker and resets the cooldown. */
export function recordSuccess(): BreakerState {
  return initialBreakerState();
}
