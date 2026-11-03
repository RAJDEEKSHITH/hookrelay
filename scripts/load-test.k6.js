// Ingest benchmark for POST /v1/events, run with k6 (IMPLEMENTATION.md section 11). k6 sends at a fixed arrival
// rate, so a slow server cannot slow the generator down and hide its tail latency (no coordinated omission).
// Plain JS on purpose: k6 runs it directly and the repo needs no @types/k6.
//   pnpm load-test:k6                                   steady 200 req/s for 60 s
//   pnpm load-test:k6 -e RATE=400 -e DURATION=120s      another steady rate
//   pnpm load-test:k6 -e PROFILE=stress                 ramp to 800 req/s to find where it breaks
// Needs the api, worker and demo-receiver running; publish numbers from the production build (`pnpm build`).
import { check } from "k6";
import http from "k6/http";

const API_URL = `http://localhost:${__ENV.PORT || 3000}`;
const RECEIVER_URL = `http://localhost:${__ENV.DEMO_PORT || 4000}`;
const PROFILE = __ENV.PROFILE || "steady";
const RATE = Number(__ENV.RATE || 200);
const DURATION = __ENV.DURATION || "60s";

const SCENARIOS = {
  steady: {
    executor: "constant-arrival-rate",
    rate: RATE,
    timeUnit: "1s",
    duration: DURATION,
    preAllocatedVUs: 50,
    maxVUs: 300,
  },
  stress: {
    executor: "ramping-arrival-rate",
    startRate: 50,
    timeUnit: "1s",
    preAllocatedVUs: 100,
    maxVUs: 600,
    stages: [
      { target: 200, duration: "30s" },
      { target: 400, duration: "45s" },
      { target: 600, duration: "45s" },
      { target: 800, duration: "45s" },
    ],
  },
};

if (!(PROFILE in SCENARIOS)) {
  throw new Error(
    `PROFILE must be one of ${Object.keys(SCENARIOS).join(", ")}, got "${PROFILE}"`,
  );
}

export const options = {
  scenarios: { [PROFILE]: SCENARIOS[PROFILE] },
  // The pass/fail bar for a steady run. A stress run is expected to cross it: that point is the result.
  thresholds: {
    http_req_failed: ["rate<0.001"],
    "http_req_duration{name:ingest}": ["p(95)<200", "p(99)<400"],
    checks: ["rate>0.999"],
    // Iterations k6 could not start because every VU was busy: the server fell behind the target rate.
    dropped_iterations: ["count==0"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const JSON_HEADERS = { "content-type": "application/json" };

function expectStatus(res, status, what) {
  if (res.status !== status) {
    throw new Error(
      `${what}: expected ${status}, got ${res.status} ${res.body}`,
    );
  }
}

/** A fresh tenant per run, with one endpoint pointing at the demo receiver's /ok route. */
export function setup() {
  const health = http.get(`${API_URL}/healthz`);
  if (health.status !== 200)
    throw new Error(`API not reachable at ${API_URL}. Is it running?`);

  const email = `k6-${Date.now()}@example.com`;
  // setup() has its own cookie jar, so the session cookie from register is sent on the next two calls.
  const register = http.post(
    `${API_URL}/v1/auth/register`,
    JSON.stringify({
      tenantName: "k6 benchmark",
      name: "k6",
      email,
      password: "k6-benchmark-password",
    }),
    { headers: JSON_HEADERS },
  );
  expectStatus(register, 201, "register");

  const apiKey = http.post(
    `${API_URL}/v1/api-keys`,
    JSON.stringify({ name: "k6" }),
    { headers: JSON_HEADERS },
  );
  expectStatus(apiKey, 201, "create API key");

  const endpoint = http.post(
    `${API_URL}/v1/endpoints`,
    JSON.stringify({ url: `${RECEIVER_URL}/ok`, description: "k6 benchmark" }),
    { headers: JSON_HEADERS },
  );
  expectStatus(endpoint, 201, "create endpoint");

  return { apiKey: apiKey.json("data.key"), email };
}

export default function (data) {
  const res = http.post(
    `${API_URL}/v1/events`,
    JSON.stringify({ type: "load.k6", data: { vu: __VU, iteration: __ITER } }),
    {
      headers: { ...JSON_HEADERS, authorization: `Bearer ${data.apiKey}` },
      tags: { name: "ingest" },
    },
  );
  check(res, { "status is 202": (r) => r.status === 202 });
}

export function teardown(data) {
  console.log(
    `Events were sent as tenant ${data.email}; their deliveries are visible in the dashboard.`,
  );
}
