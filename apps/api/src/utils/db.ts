import { createDb } from "@hookrelay/db";
import { env } from "../config/env";
import { logger } from "./logger";

export const { db, pool } = createDb(env.DATABASE_URL);

// pg emits "error" when an idle pooled connection dies (e.g. Postgres restarts); unhandled, it would crash the
// process. The pool discards that client and the next query opens a new one.
pool.on("error", (err) => {
  logger.error({ err }, "postgres pool error");
});
