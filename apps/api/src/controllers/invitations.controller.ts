import type { ApiDataBody, InvitationDto, MeDto } from "@hookrelay/shared";
import type { Request, Response } from "express";
import { getAuth } from "../middlewares/auth.middleware";
import * as invitationsService from "../services/invitations.service";
import { setSessionCookie } from "../utils/cookies";
import type { IdParams } from "../validators/common.validator";
import type { AcceptInvitationInput, CreateInvitationInput } from "../validators/invitations.validator";

export async function listInvitations(req: Request, res: Response<ApiDataBody<InvitationDto[]>>): Promise<void> {
  res.status(200).json({ data: await invitationsService.listInvitations(getAuth(req).tenantId) });
}

export async function createInvitation(
  req: Request<Record<string, string>, unknown, CreateInvitationInput>,
  res: Response<ApiDataBody<InvitationDto>>,
): Promise<void> {
  res.status(201).json({ data: await invitationsService.createInvitation(getAuth(req), req.body.email) });
}

export async function revokeInvitation(req: Request<IdParams>, res: Response): Promise<void> {
  await invitationsService.revokeInvitation(getAuth(req).tenantId, req.params.id);
  res.status(204).end();
}

/** Logs the new member in, replacing any session this browser had. */
export async function acceptInvitation(
  req: Request<Record<string, string>, unknown, AcceptInvitationInput>,
  res: Response<ApiDataBody<MeDto>>,
): Promise<void> {
  const { sessionId, me } = await invitationsService.acceptInvitation(req.body);
  setSessionCookie(res, sessionId);
  res.status(201).json({ data: me });
}
