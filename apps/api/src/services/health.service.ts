import { sql } from "@hookrelay/db";
import { db } from "../utils/db";
import { redis } from "../utils/redis";

// Without a deadline, a down Postgres (no connect timeout) or Redis (retries) would make readyz hang
// instead of answering 503.
const CHECK_TIMEOUT_MS = 2000;

async function passes(check: () => Promise<unknown>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([check().then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkReadiness(): Promise<{ postgres: boolean; redis: boolean }> {
  const [postgresOk, redisOk] = await Promise.all([
    passes(() => db.execute(sql`select 1`)),
    passes(() => redis.ping()),
  ]);
  return { postgres: postgresOk, redis: redisOk };
}
