import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { performance } from "node:perf_hooks";
import {
  isPublicIp,
  signPayload,
  validateEndpointUrl,
} from "@hookrelay/webhook-core";

const MAX_ERROR_LENGTH = 500;
const USER_AGENT = "Hookrelay/1.0";

export interface SendWebhookInput {
  url: string;
  /** Exact bytes that are signed and sent; the receiver verifies against this raw body. */
  body: string;
  signingSecret: string;
  /** Endpoint custom headers plus the hookrelay-* headers. Our own headers are applied last and always win. */
  headers: Record<string, string>;
  timeoutMs: number;
  maxResponseBytes: number;
  allowHttp: boolean;
  allowPrivate: boolean;
}

export type SendResult =
  | {
      kind: "response";
      startedAt: Date;
      durationMs: number;
      statusCode: number;
      retryAfter: string | null;
      responseSnippet: string;
    }
  | { kind: "error"; startedAt: Date; durationMs: number; error: string };

class BlockedAddressError extends Error {
  readonly code = "EBLOCKED";
}

// Postgres text columns reject NUL bytes. A receiver that echoes one would otherwise make the attempt insert fail
// forever, and the sweeper would resend the same webhook again and again.
function toStorableText(value: string, maxLength: number): string {
  return value.replaceAll("\u0000", "").slice(0, maxLength);
}

function describeError(error: unknown): string {
  if (!(error instanceof Error))
    return toStorableText(String(error), MAX_ERROR_LENGTH);
  const code =
    "code" in error && typeof error.code === "string" ? error.code : null;
  const message =
    code !== null && !error.message.includes(code)
      ? `${code}: ${error.message}`
      : error.message;
  return toStorableText(message, MAX_ERROR_LENGTH);
}

/**
 * Send-time SSRF check. It runs inside the socket's own DNS lookup, so the address that is checked is the address
 * that is connected to: a host that resolved to a public IP when the endpoint was saved and resolves to a private
 * one now (DNS rebinding) is still blocked.
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(
    hostname,
    { ...options, all: true },
    (err, addresses: LookupAddress[]) => {
      if (err) {
        callback(err, "");
        return;
      }
      const blocked = addresses.find((address) => !isPublicIp(address.address));
      if (blocked !== undefined) {
        callback(
          new BlockedAddressError(
            `${hostname} resolves to a private address (${blocked.address})`,
          ),
          "",
        );
        return;
      }
      // Node asks for every address when it races IPv4 and IPv6 (autoSelectFamily), otherwise for one.
      if (options.all) {
        callback(null, addresses);
        return;
      }
      const first = addresses[0];
      if (first === undefined) {
        callback(new BlockedAddressError(`${hostname} did not resolve`), "");
        return;
      }
      callback(null, first.address, first.family);
    },
  );
};

/**
 * Signed POST of one webhook. Never throws: every failure (blocked address, DNS, connect, timeout) comes back as
 * `kind: "error"`, and any HTTP status as `kind: "response"`. Redirects are not followed (`node:http` never does).
 */
export async function sendWebhook(
  input: SendWebhookInput,
): Promise<SendResult> {
  const startedAt = new Date();
  const startMs = performance.now();
  const elapsed = () => Math.round(performance.now() - startMs);
  const fail = (error: unknown): SendResult => ({
    kind: "error",
    startedAt,
    durationMs: elapsed(),
    error: describeError(error),
  });

  // Saved URLs were validated, but the env flags may have been tightened since; only the syntax checks run here
  // (allowPrivate: true skips the DNS lookup) because the address check happens in publicOnlyLookup.
  const urlCheck = await validateEndpointUrl(input.url, {
    allowHttp: input.allowHttp,
    allowPrivate: true,
  });
  if (!urlCheck.ok) return fail(new BlockedAddressError(urlCheck.reason));

  const url = new URL(input.url);
  // Node skips the lookup function for IP literals, so they have to be checked here.
  const literalHost = url.hostname.replace(/^\[(.*)\]$/, "$1");
  if (
    !input.allowPrivate &&
    isIP(literalHost) !== 0 &&
    !isPublicIp(literalHost)
  ) {
    return fail(new BlockedAddressError(`${literalHost} is a private address`));
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    ...input.headers,
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(input.body)),
    "user-agent": USER_AGENT,
    "hookrelay-signature": signPayload(
      input.signingSecret,
      input.body,
      timestamp,
    ),
  };

  return new Promise<SendResult>((resolve) => {
    let settled = false;
    const settle = (result: SendResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let response: IncomingMessage | null = null;
    const chunks: Buffer[] = [];
    let received = 0;
    const settleWithResponse = (res: IncomingMessage) => {
      const snippet = Buffer.concat(chunks)
        .subarray(0, input.maxResponseBytes)
        .toString("utf8");
      const retryAfter = res.headers["retry-after"];
      settle({
        kind: "response",
        startedAt,
        durationMs: elapsed(),
        statusCode: res.statusCode ?? 0,
        retryAfter: retryAfter ?? null,
        responseSnippet: toStorableText(snippet, input.maxResponseBytes),
      });
      req.destroy();
    };

    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(url, {
      method: "POST",
      headers,
      // A fresh connection per attempt: no stale keep-alive sockets that the receiver already closed, and every
      // attempt goes through publicOnlyLookup again.
      agent: false,
      ...(input.allowPrivate ? {} : { lookup: publicOnlyLookup }),
    });

    // One deadline for the whole exchange (DNS, connect, headers, body), unlike socket timeouts which only
    // measure idle time and let a slow-drip receiver hold a worker slot forever.
    const timer = setTimeout(() => {
      // Once the status line has arrived the outcome is known; a body that is slow to finish does not turn a
      // 2xx into a failure.
      if (response !== null) settleWithResponse(response);
      else settle(fail(new Error(`timed out after ${input.timeoutMs} ms`)));
      req.destroy();
    }, input.timeoutMs);

    req.on("error", (err) => {
      if (response !== null) settleWithResponse(response);
      else settle(fail(err));
    });

    req.on("response", (res) => {
      response = res;
      res.on("data", (chunk: Buffer) => {
        if (received >= input.maxResponseBytes) return;
        chunks.push(chunk);
        received += chunk.length;
        // Enough of the body is stored; reading the rest would only cost time and memory.
        if (received >= input.maxResponseBytes) settleWithResponse(res);
      });
      res.on("end", () => settleWithResponse(res));
      res.on("error", () => settleWithResponse(res));
    });

    req.end(input.body);
  });
}
