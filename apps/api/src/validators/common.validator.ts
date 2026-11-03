import { z } from "zod";

// Trim and lowercase run before the format check (z.email() alone would reject "  Ann@Example.com ").
// The database rejects uppercase emails, so this must happen before a service sees the value.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(255));

// bcrypt silently ignores bytes after the 72nd, so the limit is in bytes, not characters.
export const passwordSchema = z
  .string()
  .refine((value) => Buffer.byteLength(value, "utf8") >= 8, "Password must be at least 8 bytes")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 bytes");

export const nameSchema = z.string().trim().min(1).max(128);
