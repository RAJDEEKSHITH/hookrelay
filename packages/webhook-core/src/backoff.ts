export interface BackoffSettings {
  baseMs: number;
  factor: number;
  capMs: number;
}

/**
 * Delay before the next try after attempt `attemptNumber` (1-based) failed.
 * Equal jitter: half the exponential delay is fixed, half is random, so deliveries that failed together spread
 * out instead of retrying in waves, while each retry still waits at least base/2.
 */
export function nextRetryDelayMs(
  attemptNumber: number,
  settings: BackoffSettings,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, attemptNumber - 1);
  const base = Math.min(settings.baseMs * settings.factor ** exponent, settings.capMs);
  return Math.round(base / 2 + random() * (base / 2));
}

/**
 * Parses a `Retry-After` header (delta-seconds or HTTP-date) into a delay in ms from `nowMs`.
 * Returns null when absent or invalid; a date in the past gives 0. Clamping is left to the caller.
 */
export function parseRetryAfter(headerValue: string | null | undefined, nowMs: number): number | null {
  if (headerValue == null) return null;
  const value = headerValue.trim();
  if (value === "") return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  // Date.parse also accepts plain numbers such as "1.5"; requiring a letter keeps it to real HTTP-dates.
  if (!/[a-z]/i.test(value)) return null;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - nowMs);
}
