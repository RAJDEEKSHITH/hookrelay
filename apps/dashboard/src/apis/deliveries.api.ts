import type {
  ApiDataBody,
  DeliveryDto,
  DeliveryStatus,
} from "@hookrelay/shared";
import { apiClient } from "./client";

export interface DeliveryFilters {
  status?: DeliveryStatus;
}

/** The latest 50 deliveries, newest first. */
export async function listDeliveries(
  filters: DeliveryFilters,
): Promise<DeliveryDto[]> {
  const { data } = await apiClient.get<ApiDataBody<DeliveryDto[]>>(
    "/deliveries",
    {
      params: { status: filters.status },
    },
  );
  return data.data;
}

/** Includes `attempts` (oldest first) and `event`. */
export async function getDelivery(id: string): Promise<DeliveryDto> {
  const { data } = await apiClient.get<ApiDataBody<DeliveryDto>>(
    `/deliveries/${id}`,
  );
  return data.data;
}

/** Only for dead or successful deliveries of an active endpoint; returns the delivery, now pending. */
export async function replayDelivery(id: string): Promise<DeliveryDto> {
  const { data } = await apiClient.post<ApiDataBody<DeliveryDto>>(
    `/deliveries/${id}/replay`,
  );
  return data.data;
}
