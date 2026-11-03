import { and, deliveries, eq, sql } from "@hookrelay/db";
import type { StatsDto } from "@hookrelay/shared";
import { db } from "../utils/db";

/** Deliveries created in the last 24 hours, counted by their current status. */
export async function getStats(tenantId: string): Promise<StatsDto> {
  // The window uses the database clock, like every other timestamp; (tenant_id, created_at) is indexed.
  const rows = await db
    .select({ status: deliveries.status, count: sql<number>`count(*)::int` })
    .from(deliveries)
    .where(and(eq(deliveries.tenantId, tenantId), sql`${deliveries.createdAt} > now() - interval '24 hours'`))
    .groupBy(deliveries.status);

  const last24h: StatsDto["last24h"] = { pending: 0, success: 0, dead: 0 };
  for (const row of rows) last24h[row.status] = row.count;

  // Pending deliveries have no outcome yet, so they are left out of the rate.
  const completed = last24h.success + last24h.dead;
  return { last24h, successRate: completed === 0 ? null : last24h.success / completed };
}
