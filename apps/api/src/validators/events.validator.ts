import { z } from "zod";
import { eventTypeSchema } from "./common.validator";

export const ingestEventSchema = z.object({
  type: eventTypeSchema,
  // A JSON object (z.record rejects arrays and null); the database enforces the same with a check.
  data: z.record(z.string(), z.unknown()),
});
export type IngestEventInput = z.infer<typeof ingestEventSchema>;

/** The optional Idempotency-Key header: 1 to 255 printable ASCII characters. */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[\x20-\x7e]{1,255}$/, "Idempotency-Key must be 1 to 255 printable ASCII characters")
  .optional();
