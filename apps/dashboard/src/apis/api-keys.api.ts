import type { ApiDataBody, ApiKeyDto } from "@hookrelay/shared";
import { apiClient } from "./client";

/** The latest 50 keys, newest first, revoked ones included. */
export async function listApiKeys(): Promise<ApiKeyDto[]> {
  const { data } = await apiClient.get<ApiDataBody<ApiKeyDto[]>>("/api-keys");
  return data.data;
}

/** The response includes the full `key`, shown once. Owner only. */
export async function createApiKey(name: string): Promise<ApiKeyDto> {
  const { data } = await apiClient.post<ApiDataBody<ApiKeyDto>>("/api-keys", {
    name,
  });
  return data.data;
}

/** Owner only. */
export async function revokeApiKey(id: string): Promise<void> {
  await apiClient.delete(`/api-keys/${id}`);
}
