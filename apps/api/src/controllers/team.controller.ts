import type { ApiDataBody, UserDto } from "@hookrelay/shared";
import type { Request, Response } from "express";
import { getAuth } from "../middlewares/auth.middleware";
import * as teamService from "../services/team.service";
import { clearSessionCookie } from "../utils/cookies";
import type { IdParams } from "../validators/common.validator";

export async function listUsers(req: Request, res: Response<ApiDataBody<UserDto[]>>): Promise<void> {
  res.status(200).json({ data: await teamService.listUsers(getAuth(req).tenantId) });
}

export async function removeUser(req: Request<IdParams>, res: Response): Promise<void> {
  const auth = getAuth(req);
  await teamService.removeUser(auth, req.params.id);
  // Leaving the team ends this browser's session too; drop the now useless cookie.
  if (req.params.id === auth.userId) clearSessionCookie(res);
  res.status(204).end();
}
