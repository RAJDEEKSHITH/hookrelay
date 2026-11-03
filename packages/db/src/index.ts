import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export * from "./db/schema";
// Re-exported so every app uses this package's single copy of drizzle-orm.
export { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

export type Db = NodePgDatabase;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Creates the pool and the Drizzle instance; the caller owns both and closes the pool on shutdown. */
export function createDb(databaseUrl: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool });
  return { db, pool };
}
