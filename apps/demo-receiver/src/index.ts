import { verifySignature } from "@hookrelay/webhook-core";
import express, { type Request, type Response } from "express";
import { z } from "zod";

// Same value as SIGNATURE_TOLERANCE_SEC in @hookrelay/shared, which this app may not import (section 4).
const SIGNATURE_TOLERANCE_SEC = 300;
// Longer than the worker's 15 s request timeout, so /slow always ends as a timeout.
const SLOW_RESPONSE_MS = 20_000;
const RATE_LIMIT_RETRY_AFTER_SEC = 30;
// The API accepts payloads up to 256 KB; the envelope adds a little on top.
const BODY_LIMIT = "1mb";

const envSchema = z.object({
  DEMO_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});
const envResult = envSchema.safeParse(process.env);
if (!envResult.success) {
  console.error("Invalid environment variables:");
  for (const issue of envResult.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}
const env = envResult.data;

const registerSecretSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  secret: z.string().min(1).max(256),
});
const verifyParamsSchema = z.object({ name: z.string() });

interface Received {
  path: string;
  eventId: string | null;
  eventType: string | null;
  deliveryId: string | null;
  attempt: string | null;
  receivedAt: string;
  /** null when the sender hung up before we answered (a timeout on its side). */
  responseStatus: number | null;
  signatureValid: boolean | null;
}

const received: Received[] = [];
const secrets = new Map<string, string>();

function rawBody(req: Request): string {
  return Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
}

function record(
  req: Request,
  responseStatus: number | null,
  signatureValid: boolean | null = null,
): void {
  received.push({
    path: req.path,
    eventId: req.get("hookrelay-event-id") ?? null,
    eventType: req.get("hookrelay-event-type") ?? null,
    deliveryId: req.get("hookrelay-delivery-id") ?? null,
    attempt: req.get("hookrelay-attempt") ?? null,
    receivedAt: new Date().toISOString(),
    responseStatus,
    signatureValid,
  });
}

function reply(req: Request, res: Response, status: number): void {
  record(req, status);
  res.status(status).json({ status });
}

/**
 * Event ids this receiver accepted (answered 2xx) more than once on the same path. One event goes to every
 * endpoint with the same id, so a path is one endpoint. Failed tries are excluded: the sender was told to retry.
 * A real receiver dedupes on hookrelay-event-id because delivery is at-least-once; this shows when it would have to.
 */
function duplicates(): { path: string; eventId: string; count: number }[] {
  const counts = new Map<
    string,
    { path: string; eventId: string; count: number }
  >();
  for (const entry of received) {
    if (
      entry.eventId === null ||
      entry.responseStatus === null ||
      entry.responseStatus < 200 ||
      entry.responseStatus >= 300
    )
      continue;
    const key = `${entry.path} ${entry.eventId}`;
    const current = counts.get(key);
    if (current) current.count += 1;
    else
      counts.set(key, { path: entry.path, eventId: entry.eventId, count: 1 });
  }
  return [...counts.values()].filter((entry) => entry.count > 1);
}

const app = express();
app.disable("x-powered-by");

// Raw bytes: a signature only verifies against the body exactly as sent, never re-serialised JSON.
const raw = express.raw({ type: () => true, limit: BODY_LIMIT });

app.post("/ok", raw, (req, res) => reply(req, res, 200));

app.post("/flaky", raw, (req, res) =>
  reply(req, res, Math.random() < 0.5 ? 500 : 200),
);

app.post("/slow", raw, (req, res) => {
  const timer = setTimeout(() => reply(req, res, 200), SLOW_RESPONSE_MS);
  res.on("close", () => {
    if (res.headersSent) return;
    clearTimeout(timer);
    record(req, null);
  });
});

app.post("/down", raw, (req, res) => reply(req, res, 503));

app.post("/ratelimited", raw, (req, res) => {
  res.set("retry-after", String(RATE_LIMIT_RETRY_AFTER_SEC));
  reply(req, res, 429);
});

app.post("/verify/:name", raw, (req, res) => {
  const params = verifyParamsSchema.parse(req.params);
  const secret = secrets.get(params.name);
  if (secret === undefined) {
    record(req, 404);
    res
      .status(404)
      .json({ error: `no secret registered for "${params.name}"` });
    return;
  }
  const valid = verifySignature({
    secret,
    header: req.get("hookrelay-signature"),
    body: rawBody(req),
    toleranceSec: SIGNATURE_TOLERANCE_SEC,
  });
  const status = valid ? 200 : 401;
  record(req, status, valid);
  res.status(status).json({ status, signatureValid: valid });
});

app.post("/_secrets", express.json(), (req, res) => {
  const parsed = registerSecretSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({
        error: "body must be { name, secret }",
        issues: parsed.error.issues,
      });
    return;
  }
  secrets.set(parsed.data.name, parsed.data.secret);
  res.status(204).end();
});

app.get("/received", (_req, res) => {
  res.json({ total: received.length, received, duplicates: duplicates() });
});

const server = app.listen(env.DEMO_PORT, (error) => {
  if (error) {
    console.error("demo receiver failed to start:", error);
    process.exit(1);
  }
  console.log(`demo receiver listening on http://localhost:${env.DEMO_PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // /slow keeps connections open for 20 s; closing them lets the process exit straight away.
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
