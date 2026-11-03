// End-to-end demo: registers a tenant, points one endpoint at each demo-receiver route, sends events (including a
// repeated and a mismatched Idempotency-Key) and checks that they arrive. Needs `pnpm dev` running.
import type {
  ApiDataBody,
  ApiErrorBody,
  ApiKeyDto,
  EndpointDto,
  EventIngestDto,
  MeDto,
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

const API_URL = `http://localhost:${portFromEnv("PORT", 3000)}`;
const RECEIVER_URL = `http://localhost:${portFromEnv("DEMO_PORT", 4000)}`;
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:5173";
const PASSWORD = "demo-password-123";
// Small, so failing routes reach `dead` within a few minutes instead of the default 8 attempts over hours.
const DEMO_MAX_ATTEMPTS = 3;
const VERIFY_SECRET_NAME = "demo";
const EXTRA_ORDER_EVENTS = 5;
const ARRIVAL_TIMEOUT_MS = 15_000;

interface DemoRoute {
  path: string;
  description: string;
  eventTypes?: string[];
  customHeaders?: Record<string, string>;
}

const ROUTES: DemoRoute[] = [
  {
    path: "/ok",
    description: "Always 200",
    customHeaders: { "x-demo": "hookrelay" },
  },
  { path: "/flaky", description: "500 half the time: retried with backoff" },
  {
    path: "/slow",
    description: "Answers after 20 s: every try times out at 15 s",
  },
  {
    path: "/down",
    description: "Always 503: circuit breaker opens, then dead",
  },
  { path: "/ratelimited", description: "429 with Retry-After: 30" },
  {
    path: `/verify/${VERIFY_SECRET_NAME}`,
    description: "Checks the HMAC signature; subscribed to order.created only",
    eventTypes: ["order.created"],
  },
];

interface ReceivedEntry {
  path: string;
  eventId: string | null;
  responseStatus: number | null;
  signatureValid: boolean | null;
}

class DemoError extends Error {}

interface HttpResult {
  status: number;
  body: unknown;
  headers: Headers;
}

async function http(
  method: string,
  url: string,
  {
    body,
    headers = {},
  }: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<HttpResult> {
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
    throw new DemoError(
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

function errorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body))
    return null;
  // Our own API's error format (section 5); only the code is read, and a different shape just yields null.
  const { error } = body as Partial<ApiErrorBody>;
  return typeof error?.code === "string" ? error.code : null;
}

/** Fails the demo unless the API answered `expectedStatus`; returns the unwrapped `data`. */
function expectData<T>(
  result: HttpResult,
  expectedStatus: number,
  what: string,
): T {
  if (result.status !== expectedStatus) {
    throw new DemoError(
      `${what}: expected ${expectedStatus}, got ${result.status} ${JSON.stringify(result.body)}`,
    );
  }
  if (
    typeof result.body !== "object" ||
    result.body === null ||
    !("data" in result.body)
  ) {
    throw new DemoError(`${what}: response has no data`);
  }
  // Our own API's success format (section 5); the fields the demo relies on are checked where they are used.
  return (result.body as ApiDataBody<T>).data;
}

function isReceivedEntry(value: unknown): value is ReceivedEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    "eventId" in value
  );
}

async function fetchReceived(): Promise<ReceivedEntry[]> {
  const { body } = await http("GET", `${RECEIVER_URL}/received`);
  if (
    typeof body !== "object" ||
    body === null ||
    !("received" in body) ||
    !Array.isArray(body.received)
  ) {
    throw new DemoError(
      "Unexpected response from the demo receiver's /received",
    );
  }
  return body.received.filter(isReceivedEntry);
}

function step(message: string): void {
  console.log(`\n> ${message}`);
}

async function main(): Promise<void> {
  step("Checking the API and the demo receiver");
  const health = await http("GET", `${API_URL}/healthz`);
  if (health.status !== 200)
    throw new DemoError(`API /healthz answered ${health.status}`);
  await fetchReceived();
  console.log(`  api ${API_URL}, receiver ${RECEIVER_URL}`);

  step("Registering a tenant");
  const email = `demo-${Date.now()}@example.com`;
  const register = await http("POST", `${API_URL}/v1/auth/register`, {
    body: {
      tenantName: "Demo Inc",
      name: "Demo Owner",
      email,
      password: PASSWORD,
    },
  });
  const me = expectData<MeDto>(register, 201, "register");
  const sessionCookie = register.headers.getSetCookie()[0]?.split(";")[0];
  if (!sessionCookie)
    throw new DemoError("register did not set a session cookie");
  const session = { cookie: sessionCookie };
  console.log(`  ${me.user.email} owns tenant "${me.tenant.name}"`);

  step("Creating an API key");
  const apiKey = expectData<ApiKeyDto>(
    await http("POST", `${API_URL}/v1/api-keys`, {
      body: { name: "demo" },
      headers: session,
    }),
    201,
    "create API key",
  );
  if (!apiKey.key)
    throw new DemoError("create API key: the key was not returned");
  const bearer = { authorization: `Bearer ${apiKey.key}` };
  console.log(`  ${apiKey.prefix}...`);

  step("Creating one endpoint per demo route");
  for (const route of ROUTES) {
    const created = await http("POST", `${API_URL}/v1/endpoints`, {
      headers: session,
      body: {
        url: `${RECEIVER_URL}${route.path}`,
        description: route.description,
        maxAttempts: DEMO_MAX_ATTEMPTS,
        eventTypes: route.eventTypes,
        customHeaders: route.customHeaders,
      },
    });
    if (created.status === 400) {
      throw new DemoError(
        `create endpoint ${route.path} was rejected: ${JSON.stringify(created.body)}\n` +
          "  The receiver runs on http://localhost, so .env needs ALLOW_HTTP_DESTINATIONS=true and " +
          "ALLOW_PRIVATE_DESTINATIONS=true (restart the api and worker after changing it).",
      );
    }
    const endpoint = expectData<EndpointDto>(
      created,
      201,
      `create endpoint ${route.path}`,
    );
    console.log(`  ${route.path.padEnd(14)} ${route.description}`);

    if (route.path === `/verify/${VERIFY_SECRET_NAME}`) {
      if (!endpoint.signingSecret)
        throw new DemoError(
          "create endpoint: the signing secret was not returned",
        );
      const registered = await http("POST", `${RECEIVER_URL}/_secrets`, {
        body: { name: VERIFY_SECRET_NAME, secret: endpoint.signingSecret },
      });
      if (registered.status !== 204)
        throw new DemoError(
          `registering the secret answered ${registered.status}`,
        );
    }
  }

  step("Sending events");
  const sentEventIds: string[] = [];
  const order = {
    type: "order.created",
    data: { orderId: 1001, amount: 4999, currency: "EUR" },
  };
  // Each run registers a new tenant, and keys are unique per tenant, so a fixed key is safe to reuse.
  const idempotencyKey = "demo-order-1001";

  const first = expectData<EventIngestDto>(
    await http("POST", `${API_URL}/v1/events`, {
      body: order,
      headers: { ...bearer, "idempotency-key": idempotencyKey },
    }),
    202,
    "send order.created",
  );
  sentEventIds.push(first.eventId);
  console.log(
    `  order.created            -> 202, ${first.deliveries} deliveries (all ${ROUTES.length} endpoints)`,
  );

  const repeat = expectData<EventIngestDto>(
    await http("POST", `${API_URL}/v1/events`, {
      body: order,
      headers: { ...bearer, "idempotency-key": idempotencyKey },
    }),
    200,
    "repeat with the same Idempotency-Key",
  );
  if (!repeat.duplicate || repeat.eventId !== first.eventId) {
    throw new DemoError(
      "repeat with the same Idempotency-Key did not return the original event",
    );
  }
  console.log(
    "  same key, same body      -> 200, duplicate: true, no new deliveries",
  );

  const mismatch = await http("POST", `${API_URL}/v1/events`, {
    body: { ...order, data: { ...order.data, amount: 1 } },
    headers: { ...bearer, "idempotency-key": idempotencyKey },
  });
  if (
    mismatch.status !== 422 ||
    errorCode(mismatch.body) !== "idempotency_mismatch"
  ) {
    throw new DemoError(
      `same key with a different body: expected 422 idempotency_mismatch, got ${mismatch.status}`,
    );
  }
  console.log("  same key, different body -> 422 idempotency_mismatch");

  const customer = expectData<EventIngestDto>(
    await http("POST", `${API_URL}/v1/events`, {
      body: { type: "customer.updated", data: { customerId: 42, plan: "pro" } },
      headers: bearer,
    }),
    202,
    "send customer.updated",
  );
  sentEventIds.push(customer.eventId);
  console.log(
    `  customer.updated         -> 202, ${customer.deliveries} deliveries (/verify only takes order.created)`,
  );

  for (let i = 1; i <= EXTRA_ORDER_EVENTS; i++) {
    const sent = expectData<EventIngestDto>(
      await http("POST", `${API_URL}/v1/events`, {
        body: {
          type: "order.created",
          data: { orderId: 1001 + i, amount: 1000 * i, currency: "EUR" },
        },
        headers: bearer,
      }),
      202,
      `send order.created #${i}`,
    );
    sentEventIds.push(sent.eventId);
  }
  console.log(
    `  ${EXTRA_ORDER_EVENTS} more order.created     -> enough failures to open the breaker on /down`,
  );

  step("Waiting for /ok to receive every event");
  const deadline = Date.now() + ARRIVAL_TIMEOUT_MS;
  let ours: ReceivedEntry[] = [];
  for (;;) {
    ours = (await fetchReceived()).filter(
      (entry) => entry.eventId !== null && sentEventIds.includes(entry.eventId),
    );
    const okIds = new Set(
      ours
        .filter((entry) => entry.path === "/ok")
        .map((entry) => entry.eventId),
    );
    if (sentEventIds.every((id) => okIds.has(id))) break;
    if (Date.now() > deadline) {
      throw new DemoError(
        `/ok received ${okIds.size} of ${sentEventIds.length} events after ${ARRIVAL_TIMEOUT_MS / 1000} s. ` +
          "Is the worker running?",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const badSignatures = ours.filter((entry) => entry.signatureValid === false);
  if (badSignatures.length > 0)
    throw new DemoError(
      `${badSignatures.length} webhook(s) failed signature verification`,
    );

  const byPath = new Map<string, Map<string, number>>();
  for (const entry of ours) {
    const statuses = byPath.get(entry.path) ?? new Map<string, number>();
    const label =
      entry.responseStatus === null ? "hung up" : String(entry.responseStatus);
    statuses.set(label, (statuses.get(label) ?? 0) + 1);
    byPath.set(entry.path, statuses);
  }
  for (const [path, statuses] of byPath) {
    const summary = [...statuses]
      .map(([status, count]) => `${count} x ${status}`)
      .join(", ");
    console.log(`  ${path.padEnd(14)} ${summary}`);
  }
  console.log("  (/slow shows up only after its 15 s timeout)");

  console.log(`
Demo passed: every event reached /ok, signatures verified, idempotency behaved.

What to watch:
  - /flaky   failed tries are retried after ~15-30 s, then ~1-2 min; most end as success within minutes.
  - /slow, /down, /ratelimited fail every time (timeout at 15 s, 503, 429), so after 5 failures in a row
             each one's circuit breaker opens. From then on one probe per cooldown reaches the receiver
             (30 s, doubling up to 10 min); the other jobs wait without using an attempt. A delivery is
             dead after ${DEMO_MAX_ATTEMPTS} failed tries, so these take a long while to finish: that is the
             breaker protecting a struggling server.
  - /ratelimited  when a retry is scheduled, it honours Retry-After: 30 instead of the backoff.
  - Dead deliveries can be replayed in the dashboard or with POST /v1/deliveries/:id/replay.

  Received webhooks:  curl ${RECEIVER_URL}/received
  Dashboard:          ${DASHBOARD_URL}  (log in as ${email} / ${PASSWORD})
  API key:            ${apiKey.key}
`);
}

main().catch((err: unknown) => {
  console.error(
    `\nDemo failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
});
