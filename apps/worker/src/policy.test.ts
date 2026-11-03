import { describe, expect, it } from "vitest";
import type { SendResult } from "./http-client";
import { isSuccess, planAfterAttempt, retryDelayMs } from "./policy";

const startedAt = new Date(0);

function response(
  statusCode: number,
  retryAfter: string | null = null,
): SendResult {
  return {
    kind: "response",
    startedAt,
    durationMs: 5,
    statusCode,
    retryAfter,
    responseSnippet: "",
  };
}

const networkError: SendResult = {
  kind: "error",
  startedAt,
  durationMs: 5,
  error: "ECONNREFUSED",
};

const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;
const maxJitter = () => 1;
const noJitter = () => 0;

describe("isSuccess", () => {
  it("accepts only 2xx", () => {
    expect(isSuccess(response(200))).toBe(true);
    expect(isSuccess(response(204))).toBe(true);
    expect(isSuccess(response(299))).toBe(true);
    expect(isSuccess(response(199))).toBe(false);
    expect(isSuccess(response(301))).toBe(false);
    expect(isSuccess(response(404))).toBe(false);
    expect(isSuccess(response(500))).toBe(false);
    expect(isSuccess(networkError)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("uses exponential backoff with equal jitter", () => {
    expect(retryDelayMs(response(500), 1, 0, noJitter)).toBe(15 * SECOND);
    expect(retryDelayMs(response(500), 1, 0, maxJitter)).toBe(30 * SECOND);
    expect(retryDelayMs(networkError, 2, 0, maxJitter)).toBe(120 * SECOND);
    expect(retryDelayMs(networkError, 7, 0, maxJitter)).toBe(6 * HOUR);
    expect(retryDelayMs(networkError, 7, 0, noJitter)).toBe(3 * HOUR);
  });

  it("honours Retry-After for 429 and 503", () => {
    expect(retryDelayMs(response(429, "30"), 1, 0, maxJitter)).toBe(
      30 * SECOND,
    );
    expect(retryDelayMs(response(503, "120"), 5, 0, maxJitter)).toBe(
      120 * SECOND,
    );
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(
      retryDelayMs(
        response(503, "Thu, 01 Jan 2026 00:01:00 GMT"),
        1,
        now,
        maxJitter,
      ),
    ).toBe(60 * SECOND);
  });

  it("clamps Retry-After to 1 second .. 6 hours", () => {
    expect(retryDelayMs(response(429, "0"), 1, 0, maxJitter)).toBe(SECOND);
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(
      retryDelayMs(
        response(429, "Wed, 31 Dec 2025 00:00:00 GMT"),
        1,
        now,
        maxJitter,
      ),
    ).toBe(SECOND);
    expect(
      retryDelayMs(response(429, String(7 * 24 * 3600)), 1, 0, maxJitter),
    ).toBe(6 * HOUR);
  });

  it("falls back to backoff for an invalid or missing Retry-After", () => {
    expect(retryDelayMs(response(429, "soon"), 1, 0, maxJitter)).toBe(
      30 * SECOND,
    );
    expect(retryDelayMs(response(503), 2, 0, maxJitter)).toBe(120 * SECOND);
  });

  it("ignores Retry-After on other statuses", () => {
    expect(retryDelayMs(response(500, "5"), 1, 0, maxJitter)).toBe(30 * SECOND);
    expect(retryDelayMs(response(302, "5"), 1, 0, maxJitter)).toBe(30 * SECOND);
  });
});

describe("planAfterAttempt", () => {
  it("marks a 2xx as success, even on the last attempt", () => {
    expect(
      planAfterAttempt({
        result: response(200),
        attemptNumber: 8,
        attemptLimit: 8,
        now: 0,
      }),
    ).toEqual({
      status: "success",
    });
  });

  it("schedules a retry while attempts remain", () => {
    expect(
      planAfterAttempt({
        result: response(500),
        attemptNumber: 1,
        attemptLimit: 8,
        now: 0,
        random: maxJitter,
      }),
    ).toEqual({ status: "pending", delayMs: 30 * SECOND });
    expect(
      planAfterAttempt({
        result: response(429, "30"),
        attemptNumber: 7,
        attemptLimit: 8,
        now: 0,
      }),
    ).toEqual({ status: "pending", delayMs: 30 * SECOND });
  });

  it("goes dead when the attempt limit is reached", () => {
    expect(
      planAfterAttempt({
        result: networkError,
        attemptNumber: 8,
        attemptLimit: 8,
        now: 0,
      }),
    ).toEqual({
      status: "dead",
    });
    expect(
      planAfterAttempt({
        result: response(404),
        attemptNumber: 1,
        attemptLimit: 1,
        now: 0,
      }),
    ).toEqual({
      status: "dead",
    });
  });

  it("uses the replay-raised limit, not the endpoint default", () => {
    expect(
      planAfterAttempt({
        result: response(500),
        attemptNumber: 9,
        attemptLimit: 16,
        now: 0,
        random: maxJitter,
      }),
    ).toEqual({ status: "pending", delayMs: 6 * HOUR });
  });
});
