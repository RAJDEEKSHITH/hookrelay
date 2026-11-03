import { createDb } from "@hookrelay/db";
import { env } from "../config/env";
import { logger } from "./logger";

export const { db, pool } = createDb(env.DATABASE_URL);

// pg emits "error" when an idle pooled connection dies (e.g. Postgres restarts); unhandled, it would crash the
// process. The pool discards that client and the next query opens a new one.
pool.on("error", (err) => {
  logger.error({ err }, "postgres pool error");
});

/** True when `err` is a unique violation (23505) on `constraint`; Drizzle keeps the pg error as `cause`. */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (!(err instanceof Error)) return false;
  const cause: unknown = err.cause;
  if (typeof cause !== "object" || cause === null) return false;
  return Reflect.get(cause, "code") === "23505" && Reflect.get(cause, "constraint") === constraint;
}
