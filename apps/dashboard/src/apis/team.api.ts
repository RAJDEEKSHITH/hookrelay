import type {
  ApiDataBody,
  InvitationDto,
  MeDto,
  UserDto,
} from "@hookrelay/shared";
import { apiClient } from "./client";

export interface AcceptInvitationInput {
  token: string;
  name: string;
  password: string;
}

export async function listUsers(): Promise<UserDto[]> {
  const { data } = await apiClient.get<ApiDataBody<UserDto[]>>("/team/users");
  return data.data;
}

/** The owner removes a member, or a member removes themselves (leave). */
export async function removeUser(id: string): Promise<void> {
  await apiClient.delete(`/team/users/${id}`);
}

/** Open invitations only. Owner only. */
export async function listInvitations(): Promise<InvitationDto[]> {
  const { data } =
    await apiClient.get<ApiDataBody<InvitationDto[]>>("/team/invitations");
  return data.data;
}

/** The response includes the one-time accept `link`. Owner only. */
export async function createInvitation(email: string): Promise<InvitationDto> {
  const { data } = await apiClient.post<ApiDataBody<InvitationDto>>(
    "/team/invitations",
    { email },
  );
  return data.data;
}

/** Owner only. */
export async function revokeInvitation(id: string): Promise<void> {
  await apiClient.delete(`/team/invitations/${id}`);
}

/** Creates the member and logs them in (replacing any current session). */
export async function acceptInvitation(
  input: AcceptInvitationInput,
): Promise<MeDto> {
  const { data } = await apiClient.post<ApiDataBody<MeDto>>(
    "/invitations/accept",
    input,
  );
  return data.data;
}
