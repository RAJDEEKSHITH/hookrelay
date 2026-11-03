import type { ApiDataBody, MeDto } from "@hookrelay/shared";
import { apiClient } from "./client";

export interface AcceptInvitationInput {
  token: string;
  name: string;
  password: string;
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
