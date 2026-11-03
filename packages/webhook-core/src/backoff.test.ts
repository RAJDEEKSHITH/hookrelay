import { describe, expect, it } from "vitest";
import { nextRetryDelayMs, parseRetryAfter } from "./backoff";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const settings = { baseMs: 30 * SEC, factor: 4, capMs: 6 * HOUR };

describe("nextRetryDelayMs", () => {
  it("grows by the factor and is capped (upper bound = random 1)", () => {
    const max = (n: number) => nextRetryDelayMs(n, settings, () => 1);
    expect([1, 2, 3, 4, 5, 6, 7].map(max)).toEqual([30 * SEC, 2 * MIN, 8 * MIN, 32 * MIN, 128 * MIN, 6 * HOUR, 6 * HOUR]);
  });

  it("uses equal jitter: never below half the base delay", () => {
    expect(nextRetryDelayMs(1, settings, () => 0)).toBe(15 * SEC);
    expect(nextRetryDelayMs(3, settings, () => 0.5)).toBe(6 * MIN);
    expect(nextRetryDelayMs(20, settings, () => 0)).toBe(3 * HOUR);
  });

  it("stays within [base/2, base] with real randomness", () => {
    for (let i = 0; i < 1000; i++) {
      const delay = nextRetryDelayMs(2, settings);
      expect(delay).toBeGreaterThanOrEqual(1 * MIN);
      expect(delay).toBeLessThanOrEqual(2 * MIN);
    }
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");

  it("parses delta-seconds", () => {
    expect(parseRetryAfter("30", now)).toBe(30 * SEC);
    expect(parseRetryAfter(" 0 ", now)).toBe(0);
  });

  it("parses an HTTP-date relative to now", () => {
    expect(parseRetryAfter("Tue, 03 Nov 2026 12:02:00 GMT", now)).toBe(2 * MIN);
  });

  it("returns 0 for a date in the past", () => {
    expect(parseRetryAfter("Tue, 03 Nov 2026 11:00:00 GMT", now)).toBe(0);
  });

  it("returns null for missing or invalid values", () => {
    expect(parseRetryAfter(undefined, now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter("", now)).toBeNull();
    expect(parseRetryAfter("-5", now)).toBeNull();
    expect(parseRetryAfter("1.5", now)).toBeNull();
    expect(parseRetryAfter("soon", now)).toBeNull();
  });
});
