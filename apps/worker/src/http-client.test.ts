import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { verifySignature } from "@hookrelay/webhook-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendWebhook, type SendWebhookInput } from "./http-client";

interface Received {
  headers: IncomingMessage["headers"];
  body: string;
}

let server: Server;
let baseUrl: string;
let lastReceived: Received | null = null;

const routes: Record<string, (res: ServerResponse) => void> = {
  "/ok": (res) => res.writeHead(200).end("fine"),
  "/big": (res) => res.writeHead(200).end("x".repeat(5000)),
  "/nul": (res) => res.writeHead(200).end("a\u0000b"),
  "/redirect": (res) => res.writeHead(302, { location: "/ok" }).end(),
  "/ratelimited": (res) => res.writeHead(429, { "retry-after": "30" }).end(),
  "/hang": () => undefined,
  "/slow-body": (res) => {
    res.writeHead(200);
    res.write("partial");
  },
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      lastReceived = {
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      const handler = routes[req.url ?? ""];
      if (handler) handler(res);
      else res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address: AddressInfo | string | null = server.address();
  if (address === null || typeof address === "string")
    throw new Error("server has no port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function input(
  path: string,
  overrides: Partial<SendWebhookInput> = {},
): SendWebhookInput {
  return {
    url: `${baseUrl}${path}`,
    body: '{"id":"evt_1","data":{"n":1}}',
    signingSecret: "whsec_test",
    headers: { "hookrelay-event-id": "evt_1", "x-custom": "yes" },
    timeoutMs: 2000,
    maxResponseBytes: 1024,
    allowHttp: true,
    allowPrivate: true,
    ...overrides,
  };
}

describe("sendWebhook", () => {
  it("posts the signed body with our headers", async () => {
    const result = await sendWebhook(input("/ok"));
    expect(result).toMatchObject({
      kind: "response",
      statusCode: 200,
      responseSnippet: "fine",
      retryAfter: null,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const received = lastReceived;
    if (received === null) throw new Error("nothing received");
    expect(received.body).toBe('{"id":"evt_1","data":{"n":1}}');
    expect(received.headers["content-type"]).toBe("application/json");
    expect(received.headers["user-agent"]).toBe("Hookrelay/1.0");
    expect(received.headers["hookrelay-event-id"]).toBe("evt_1");
    expect(received.headers["x-custom"]).toBe("yes");
    const signature = received.headers["hookrelay-signature"];
    expect(
      verifySignature({
        secret: "whsec_test",
        header: typeof signature === "string" ? signature : undefined,
        body: received.body,
        toleranceSec: 300,
      }),
    ).toBe(true);
  });

  it("does not let custom headers override ours", async () => {
    await sendWebhook(
      input("/ok", {
        headers: { "User-Agent": "evil", "Content-Type": "text/plain" },
      }),
    );
    expect(lastReceived?.headers["user-agent"]).toBe("Hookrelay/1.0");
    expect(lastReceived?.headers["content-type"]).toBe("application/json");
  });

  it("keeps at most maxResponseBytes of the body", async () => {
    const result = await sendWebhook(input("/big"));
    expect(result.kind === "response" && result.responseSnippet.length).toBe(
      1024,
    );
  });

  it("strips NUL bytes Postgres cannot store", async () => {
    const result = await sendWebhook(input("/nul"));
    expect(result).toMatchObject({ kind: "response", responseSnippet: "ab" });
  });

  it("does not follow redirects", async () => {
    const result = await sendWebhook(input("/redirect"));
    expect(result).toMatchObject({ kind: "response", statusCode: 302 });
  });

  it("returns the Retry-After header", async () => {
    const result = await sendWebhook(input("/ratelimited"));
    expect(result).toMatchObject({
      kind: "response",
      statusCode: 429,
      retryAfter: "30",
    });
  });

  it("times out when no response arrives", async () => {
    const result = await sendWebhook(input("/hang", { timeoutMs: 200 }));
    expect(result).toMatchObject({
      kind: "error",
      error: "timed out after 200 ms",
    });
  });

  it("keeps the status when only the body is slow", async () => {
    const result = await sendWebhook(input("/slow-body", { timeoutMs: 200 }));
    expect(result).toMatchObject({
      kind: "response",
      statusCode: 200,
      responseSnippet: "partial",
    });
  });

  // Windows retries a refused localhost connect for about 2 s before giving up, hence the longer limits.
  it(
    "reports connection errors without throwing",
    { timeout: 15_000 },
    async () => {
      const result = await sendWebhook(
        input("/ok", { url: "http://127.0.0.1:1/ok", timeoutMs: 10_000 }),
      );
      expect(result.kind).toBe("error");
      expect(result.kind === "error" && result.error).toContain("ECONNREFUSED");
    },
  );

  it("blocks private IP literals unless allowed", async () => {
    lastReceived = null;
    const result = await sendWebhook(input("/ok", { allowPrivate: false }));
    expect(result).toMatchObject({ kind: "error" });
    expect(result.kind === "error" && result.error).toContain(
      "private address",
    );
    expect(lastReceived).toBeNull();
  });

  it("blocks hostnames that resolve to private addresses at connect time", async () => {
    lastReceived = null;
    const port = new URL(baseUrl).port;
    const result = await sendWebhook(
      input("/ok", { url: `http://localhost:${port}/ok`, allowPrivate: false }),
    );
    expect(result.kind === "error" && result.error).toContain(
      "resolves to a private address",
    );
    expect(lastReceived).toBeNull();
  });

  it("rejects http when only https is allowed", async () => {
    const result = await sendWebhook(input("/ok", { allowHttp: false }));
    expect(result.kind === "error" && result.error).toContain("https");
  });
});
