import type { ApiDataBody, MeDto } from "@hookrelay/shared";
import { apiClient } from "./client";

export interface RegisterInput {
  tenantName: string;
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function register(input: RegisterInput): Promise<MeDto> {
  const { data } = await apiClient.post<ApiDataBody<MeDto>>(
    "/auth/register",
    input,
  );
  return data.data;
}

export async function login(input: LoginInput): Promise<MeDto> {
  const { data } = await apiClient.post<ApiDataBody<MeDto>>(
    "/auth/login",
    input,
  );
  return data.data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout");
}

export async function fetchMe(): Promise<MeDto> {
  const { data } = await apiClient.get<ApiDataBody<MeDto>>("/auth/me");
  return data.data;
}
