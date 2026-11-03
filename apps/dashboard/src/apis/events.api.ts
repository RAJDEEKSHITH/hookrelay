import type { ApiDataBody, EventDto } from "@hookrelay/shared";
import { apiClient } from "./client";

export interface EventFilters {
  type?: string;
}

/** The latest 50 events, newest first, without payloads. */
export async function listEvents(filters: EventFilters): Promise<EventDto[]> {
  const { data } = await apiClient.get<ApiDataBody<EventDto[]>>("/events", {
    params: { type: filters.type },
  });
  return data.data;
}

/** Includes `payload` and `deliveries`. */
export async function getEvent(id: string): Promise<EventDto> {
  const { data } = await apiClient.get<ApiDataBody<EventDto>>(`/events/${id}`);
  return data.data;
}
