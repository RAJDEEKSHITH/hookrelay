// End-to-end verifier: sends N events with C concurrent requests, then waits until every event has reached the demo
// receiver's /ok route and reports end-to-end delivery latency, duplicates and deliveries still pending. It is the
// chaos-test check (README): kill the worker or restart Redis while it runs, and it still has to end with every event
// delivered. Its ingest numbers come from a closed loop (each worker waits for its reply), so the ingest benchmark
// is scripts/load-test.k6.js instead. Needs the api, worker and demo-receiver running.
//   pnpm load-test --events=2000 --concurrency=50 --timeout=600
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import type {
  ApiDataBody,
  ApiKeyDto,
  DeliveryDto,
  EndpointDto,
} from "../packages/shared/src";

function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a port number, got "${raw}"`);
  }
  return port;
}

function positiveInt(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`--${name} must be a positive integer, got "${raw}"`);
  return value;
}

const { values: args } = parseArgs({
  // pnpm 11 forwards the "--" separator itself, which parseArgs would read as "no more options".
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    events: { type: "string" },
    concurrency: { type: "string" },
    timeout: { type: "string" },
  },
});
const EVENTS = positiveInt("events", args.events, 1000);
const CONCURRENCY = positiveInt("concurrency", args.concurrency, 20);
const DELIVERY_TIMEOUT_SEC = positiveInt("timeout", args.timeout, 300);

const API_URL = `http://localhost:${portFromEnv("PORT", 3000)}`;
const RECEIVER_URL = `http://localhost:${portFromEnv("DEMO_PORT", 4000)}`;
const POLL_INTERVAL_MS = 2000;

class LoadTestError extends Error {}

async function request(
  method: string,
  url: string,
  {
    body,
    headers = {},
  }: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers:
        body === undefined
          ? headers
          : { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new LoadTestError(
      `Cannot reach ${url}. Is \`pnpm dev\` running (api, worker and demo-receiver)?`,
    );
  }
  const text = await res.text();
  return {
    status: res.status,
    body: text === "" ? null : JSON.parse(text),
    headers: res.headers,
  };
}

function expectData<T>(
  result: { status: number; body: unknown },
  expectedStatus: number,
  what: string,
): T {
  if (
    result.status !== expectedStatus ||
    typeof result.body !== "object" ||
    result.body === null
  ) {
    throw new LoadTestError(
      `${what}: expected ${expectedStatus}, got ${result.status} ${JSON.stringify(result.body)}`,
    );
  }
  if (!("data" in result.body))
    throw new LoadTestError(`${what}: response has no data`);
  // Our own API's success format (section 5); the fields used are checked where they are read.
  return (result.body as ApiDataBody<T>).data;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

interface Arrival {
  eventId: string;
  receivedAtMs: number;
}

/** Accepted arrivals at the receiver's /ok route, in arrival order, duplicates included. */
async function receivedOk(): Promise<Arrival[]> {
  const { body } = await request("GET", `${RECEIVER_URL}/received`);
  if (
    typeof body !== "object" ||
    body === null ||
    !("received" in body) ||
    !Array.isArray(body.received)
  ) {
    throw new LoadTestError(
      "Unexpected response from the demo receiver's /received",
    );
  }
  const arrivals: Arrival[] = [];
  for (const entry of body.received) {
    if (typeof entry !== "object" || entry === null) continue;
    if (!("path" in entry) || entry.path !== "/ok") continue;
    if (!("eventId" in entry) || typeof entry.eventId !== "string") continue;
    // Only accepted arrivals count; a 2xx is the only answer /ok gives, but be explicit.
    if ("responseStatus" in entry && entry.responseStatus !== 200) continue;
    if (!("receivedAt" in entry) || typeof entry.receivedAt !== "string")
      continue;
    arrivals.push({
      eventId: entry.eventId,
      receivedAtMs: Date.parse(entry.receivedAt),
    });
  }
  return arrivals;
}

async function main(): Promise<void> {
  console.log(
    `End-to-end verification: ${EVENTS} events, ${CONCURRENCY} concurrent requests\n`,
  );

  const email = `load-${Date.now()}@example.com`;
  const register = await request("POST", `${API_URL}/v1/auth/register`, {
    body: {
      tenantName: "Load test",
      name: "Load Tester",
      email,
      password: "load-test-password",
    },
  });
  expectData(register, 201, "register");
  const cookie = register.headers.getSetCookie()[0]?.split(";")[0];
  if (!cookie) throw new LoadTestError("register did not set a session cookie");
  const session = { cookie };

  const apiKey = expectData<ApiKeyDto>(
    await request("POST", `${API_URL}/v1/api-keys`, {
      body: { name: "load test" },
      headers: session,
    }),
    201,
    "create API key",
  );
  if (!apiKey.key)
    throw new LoadTestError("create API key: the key was not returned");
  const bearer = { authorization: `Bearer ${apiKey.key}` };

  const endpoint = expectData<EndpointDto>(
    await request("POST", `${API_URL}/v1/endpoints`, {
      body: { url: `${RECEIVER_URL}/ok`, description: "Load test" },
      headers: session,
    }),
    201,
    "create endpoint",
  );
  console.log(`Tenant ${email}, endpoint ${endpoint.url}`);

  // Ingest phase: C workers pull from one shared counter until N requests have been sent.
  const latencies: number[] = [];
  const statusCounts = new Map<string, number>();
  const eventIds: string[] = [];
  // Wall-clock send time per event: the receiver stamps arrivals with the wall clock too (same machine).
  const sentAtMs = new Map<string, number>();
  let next = 0;
  const startedAt = performance.now();

  async function worker(): Promise<void> {
    while (next < EVENTS) {
      const n = next++;
      const t0 = performance.now();
      const sentAt = Date.now();
      let label: string;
      try {
        const res = await fetch(`${API_URL}/v1/events`, {
          method: "POST",
          headers: { "content-type": "application/json", ...bearer },
          body: JSON.stringify({
            type: "load.test",
            data: { n, sentAt: new Date().toISOString() },
          }),
        });
        const text = await res.text();
        label = String(res.status);
        // Only a 202 is parsed: an error from a proxy or a crashed server may not be JSON at all.
        const body: unknown = res.status === 202 ? JSON.parse(text) : null;
        if (typeof body === "object" && body !== null && "data" in body) {
          const data: unknown = body.data;
          if (
            typeof data === "object" &&
            data !== null &&
            "eventId" in data &&
            typeof data.eventId === "string"
          ) {
            eventIds.push(data.eventId);
            sentAtMs.set(data.eventId, sentAt);
          }
        }
      } catch {
        label = "network error";
      }
      latencies.push(performance.now() - t0);
      statusCounts.set(label, (statusCounts.get(label) ?? 0) + 1);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsedSec = (performance.now() - startedAt) / 1000;
  latencies.sort((a, b) => a - b);

  const format = (ms: number) => `${ms.toFixed(1)} ms`;
  console.log(`
Ingest (POST /v1/events, closed loop: see load-test.k6.js for the benchmark)
  requests      ${EVENTS} in ${elapsedSec.toFixed(2)} s
  throughput    ${(EVENTS / elapsedSec).toFixed(1)} req/s
  latency p50   ${format(percentile(latencies, 0.5))}
  latency p95   ${format(percentile(latencies, 0.95))}
  latency p99   ${format(percentile(latencies, 0.99))}
  latency max   ${format(latencies.at(-1) ?? 0)}
  responses     ${[...statusCounts].map(([status, count]) => `${count} x ${status}`).join(", ")}`);

  // Delivery phase: every accepted event must reach /ok, however the worker or Redis behaved meanwhile.
  console.log(
    `\nWaiting up to ${DELIVERY_TIMEOUT_SEC} s for ${eventIds.length} events to reach /ok...`,
  );
  const deliveryStart = performance.now();
  const expected = new Set(eventIds);
  let arrived = new Set<string>();
  let lastReported = -1;
  for (;;) {
    arrived = new Set(
      (await receivedOk())
        .map((arrival) => arrival.eventId)
        .filter((id) => expected.has(id)),
    );
    if (arrived.size !== lastReported) {
      console.log(`  ${arrived.size} / ${expected.size} delivered`);
      lastReported = arrived.size;
    }
    if (arrived.size === expected.size) break;
    if (performance.now() - deliveryStart > DELIVERY_TIMEOUT_SEC * 1000) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  const deliverySec = (performance.now() - deliveryStart) / 1000;

  const ours = (await receivedOk()).filter((arrival) =>
    expected.has(arrival.eventId),
  );
  const duplicateArrivals =
    ours.length - new Set(ours.map((a) => a.eventId)).size;

  // End-to-end delivery latency: request sent -> first arrival at the receiver (signing, queue, worker, HTTP).
  const firstArrivalMs = new Map<string, number>();
  for (const arrival of ours) {
    const seen = firstArrivalMs.get(arrival.eventId);
    if (seen === undefined || arrival.receivedAtMs < seen) {
      firstArrivalMs.set(arrival.eventId, arrival.receivedAtMs);
    }
  }
  const deliveryLatencies: number[] = [];
  for (const [eventId, receivedAtMs] of firstArrivalMs) {
    const sentAt = sentAtMs.get(eventId);
    if (sentAt !== undefined) deliveryLatencies.push(receivedAtMs - sentAt);
  }
  deliveryLatencies.sort((a, b) => a - b);
  const pending = expectData<DeliveryDto[]>(
    await request("GET", `${API_URL}/v1/deliveries?status=pending&limit=100`, {
      headers: session,
    }),
    200,
    "list pending deliveries",
  );

  console.log(`
Delivery
  delivered     ${arrived.size} / ${expected.size} unique events (${deliverySec.toFixed(1)} s after the last request)
  end-to-end    p50 ${format(percentile(deliveryLatencies, 0.5))}, p95 ${format(percentile(deliveryLatencies, 0.95))}, p99 ${format(percentile(deliveryLatencies, 0.99))}, max ${format(deliveryLatencies.at(-1) ?? 0)} (request sent -> webhook received)
  duplicates    ${duplicateArrivals} extra arrivals (at-least-once; receivers dedupe on hookrelay-event-id)
  still pending ${pending.length}${pending.length === 100 ? "+" : ""}`);

  const rejected = EVENTS - eventIds.length;
  if (arrived.size !== expected.size || pending.length > 0) {
    throw new LoadTestError(
      `${expected.size - arrived.size} accepted events were not delivered within ${DELIVERY_TIMEOUT_SEC} s`,
    );
  }
  console.log(
    `\nPassed: every accepted event was delivered${rejected > 0 ? ` (${rejected} requests were not accepted)` : ""}.`,
  );
}

main().catch((err: unknown) => {
  console.error(
    `\nLoad test failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
});
