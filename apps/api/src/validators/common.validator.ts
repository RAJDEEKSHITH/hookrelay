import { LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT } from "@hookrelay/shared";
import { z } from "zod";

// Route ids are checked here so a malformed id is a 400, never a Postgres "invalid input syntax for uuid".
export const idParamsSchema = z.object({ id: z.uuid() });
export type IdParams = z.infer<typeof idParamsSchema>;

export const limitSchema = z.coerce.number().int().min(1).max(LIST_MAX_LIMIT).default(LIST_DEFAULT_LIMIT);

// Trim and lowercase run before the format check (z.email() alone would reject "  Ann@Example.com ").
// The database rejects uppercase emails, so this must happen before a service sees the value.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(255));

// bcrypt silently ignores bytes after the 72nd, so the limit is in bytes, not characters.
export const passwordSchema = z
  .string()
  .refine((value) => Buffer.byteLength(value, "utf8") >= 8, "Password must be at least 8 bytes")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 bytes");

export const nameSchema = z.string().trim().min(1).max(128);
