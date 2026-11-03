import { MAX_ATTEMPTS_LIMIT, MAX_CUSTOM_HEADERS } from "@hookrelay/shared";
import { z } from "zod";
import { eventTypeSchema } from "./common.validator";

// RFC 9110 token characters; Node refuses to send anything else as a header name.
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// Headers the worker sets itself; a custom value would break or spoof the request.
const RESERVED_HEADERS = new Set(["host", "content-length", "content-type", "user-agent"]);

const customHeadersSchema = z
  .record(
    z.string(),
    // CR/LF would allow header injection, and Node rejects these characters at send time anyway.
    z.string().regex(/^[\t\x20-\x7e\x80-\xff]*$/, "Header values cannot contain control characters"),
  )
  .superRefine((headers, ctx) => {
    const names = Object.keys(headers);
    if (names.length > MAX_CUSTOM_HEADERS) {
      ctx.addIssue({ code: "custom", message: `At most ${MAX_CUSTOM_HEADERS} custom headers` });
    }
    const seen = new Set<string>();
    for (const name of names) {
      const lower = name.toLowerCase();
      if (!HEADER_NAME.test(name)) {
        ctx.addIssue({ code: "custom", path: [name], message: "Invalid header name" });
      } else if (RESERVED_HEADERS.has(lower) || lower.startsWith("hookrelay-")) {
        ctx.addIssue({ code: "custom", path: [name], message: "This header is set by Hookrelay and cannot be overridden" });
      } else if (seen.has(lower)) {
        ctx.addIssue({ code: "custom", path: [name], message: "Duplicate header name (names are case-insensitive)" });
      }
      seen.add(lower);
    }
  })
  .transform((headers) => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])));

const urlSchema = z.string().trim().min(1).max(1024);
const descriptionSchema = z
  .string()
  .trim()
  .max(6000)
  .transform((value) => (value === "" ? null : value));
// Empty = subscribed to every event type.
const eventTypesSchema = z.array(eventTypeSchema).transform((types) => [...new Set(types)]);
const maxAttemptsSchema = z.number().int().min(1).max(MAX_ATTEMPTS_LIMIT);

export const createEndpointSchema = z.object({
  url: urlSchema,
  description: descriptionSchema.optional(),
  eventTypes: eventTypesSchema.default([]),
  maxAttempts: maxAttemptsSchema.optional(),
  customHeaders: customHeadersSchema.optional(),
});
export type CreateEndpointInput = z.infer<typeof createEndpointSchema>;

/** Every field optional; `null` clears description or custom headers. */
export const updateEndpointSchema = z.object({
  url: urlSchema.optional(),
  description: descriptionSchema.nullable().optional(),
  eventTypes: eventTypesSchema.optional(),
  maxAttempts: maxAttemptsSchema.optional(),
  customHeaders: customHeadersSchema.nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});
export type UpdateEndpointInput = z.infer<typeof updateEndpointSchema>;
