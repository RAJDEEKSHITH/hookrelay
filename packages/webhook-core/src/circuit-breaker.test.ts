import { describe, expect, it } from "vitest";
import { canAttempt, initialBreakerState, recordFailure, recordSuccess, type BreakerState } from "./circuit-breaker";

const settings = { failureThreshold: 5, baseCooldownMs: 30_000, maxCooldownMs: 600_000 };

function failTimes(state: BreakerState, times: number, now: number): BreakerState {
  let next = state;
  for (let i = 0; i < times; i++) next = recordFailure(next, now, settings);
  return next;
}

describe("circuit breaker", () => {
  it("stays closed below the failure threshold", () => {
    const state = failTimes(initialBreakerState(), 4, 0);
    expect(canAttempt(state, 0)).toEqual({ mode: "closed" });
    expect(state.consecutiveFailures).toBe(4);
  });

  it("opens for the base cooldown at the threshold", () => {
    const state = failTimes(initialBreakerState(), 5, 1_000);
    expect(state.openUntil).toBe(31_000);
    expect(canAttempt(state, 30_999)).toEqual({ mode: "open", retryAt: 31_000 });
    expect(canAttempt(state, 31_000)).toEqual({ mode: "half_open" });
  });

  it("does not extend the cooldown for failures of requests that were in flight while open", () => {
    const open = failTimes(initialBreakerState(), 5, 0);
    const later = failTimes(open, 10, 5_000);
    expect(later.openUntil).toBe(open.openUntil);
    expect(later.cooldownMs).toBe(30_000);
  });

  it("doubles the cooldown when the half-open probe fails, up to the maximum", () => {
    let state = failTimes(initialBreakerState(), 5, 0);
    const cooldowns: number[] = [state.cooldownMs];
    for (let i = 0; i < 7; i++) {
      const probeAt = state.openUntil ?? 0;
      state = recordFailure(state, probeAt, settings);
      cooldowns.push(state.cooldownMs);
      expect(state.openUntil).toBe(probeAt + state.cooldownMs);
    }
    expect(cooldowns).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000, 600_000]);
  });

  it("closes and resets the cooldown on success", () => {
    const state = recordSuccess();
    expect(state).toEqual(initialBreakerState());
    expect(canAttempt(state, 0)).toEqual({ mode: "closed" });
    // After a reset, re-opening starts from the base cooldown again.
    expect(failTimes(state, 5, 0).cooldownMs).toBe(30_000);
  });
});
