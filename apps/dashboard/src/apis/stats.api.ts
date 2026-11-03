import type { ApiDataBody, StatsDto } from "@hookrelay/shared";
import { apiClient } from "./client";

/** Deliveries created in the last 24 hours by status, and their success rate. */
export async function getStats(): Promise<StatsDto> {
  const { data } = await apiClient.get<ApiDataBody<StatsDto>>("/stats");
  return data.data;
}
