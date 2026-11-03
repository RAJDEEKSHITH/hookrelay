import type {
  ApiDataBody,
  EndpointDto,
  EndpointStatus,
  EventIngestDto,
} from "@hookrelay/shared";
import { apiClient } from "./client";

export interface CreateEndpointInput {
  url: string;
  description?: string;
  /** Empty = every event type. */
  eventTypes: string[];
  maxAttempts: number;
  customHeaders?: Record<string, string>;
}

/** Omitted fields are unchanged; `null` clears description or custom headers. */
export interface UpdateEndpointInput {
  url?: string;
  description?: string | null;
  eventTypes?: string[];
  maxAttempts?: number;
  customHeaders?: Record<string, string> | null;
  status?: EndpointStatus;
}

export async function listEndpoints(): Promise<EndpointDto[]> {
  const { data } =
    await apiClient.get<ApiDataBody<EndpointDto[]>>("/endpoints");
  return data.data;
}

export async function getEndpoint(id: string): Promise<EndpointDto> {
  const { data } = await apiClient.get<ApiDataBody<EndpointDto>>(
    `/endpoints/${id}`,
  );
  return data.data;
}

/** The response includes `signingSecret`, shown once. */
export async function createEndpoint(
  input: CreateEndpointInput,
): Promise<EndpointDto> {
  const { data } = await apiClient.post<ApiDataBody<EndpointDto>>(
    "/endpoints",
    input,
  );
  return data.data;
}

export async function updateEndpoint(
  id: string,
  input: UpdateEndpointInput,
): Promise<EndpointDto> {
  const { data } = await apiClient.patch<ApiDataBody<EndpointDto>>(
    `/endpoints/${id}`,
    input,
  );
  return data.data;
}

export async function deleteEndpoint(id: string): Promise<void> {
  await apiClient.delete(`/endpoints/${id}`);
}

/** The response includes the new `signingSecret`, shown once; the old one stops working immediately. */
export async function rotateEndpointSecret(id: string): Promise<EndpointDto> {
  const { data } = await apiClient.post<ApiDataBody<EndpointDto>>(
    `/endpoints/${id}/rotate-secret`,
  );
  return data.data;
}

export async function sendTestEvent(id: string): Promise<EventIngestDto> {
  const { data } = await apiClient.post<ApiDataBody<EventIngestDto>>(
    `/endpoints/${id}/test`,
  );
  return data.data;
}
