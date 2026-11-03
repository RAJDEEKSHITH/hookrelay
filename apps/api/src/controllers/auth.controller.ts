import type { ApiDataBody, MeDto } from "@hookrelay/shared";
import type { Request, Response } from "express";
import { getAuth } from "../middlewares/auth.middleware";
import * as authService from "../services/auth.service";
import { clearSessionCookie, readSessionCookie, setSessionCookie } from "../utils/cookies";
import type { LoginInput, RegisterInput } from "../validators/auth.validator";

export async function register(
  req: Request<Record<string, never>, ApiDataBody<MeDto>, RegisterInput>,
  res: Response<ApiDataBody<MeDto>>,
): Promise<void> {
  const { sessionId, me } = await authService.register(req.body);
  setSessionCookie(res, sessionId);
  res.status(201).json({ data: me });
}

export async function login(
  req: Request<Record<string, never>, ApiDataBody<MeDto>, LoginInput>,
  res: Response<ApiDataBody<MeDto>>,
): Promise<void> {
  const { sessionId, me } = await authService.login(req.body);
  setSessionCookie(res, sessionId);
  res.status(200).json({ data: me });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const sessionId = readSessionCookie(req);
  if (sessionId !== null) await authService.logout(sessionId);
  clearSessionCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response<ApiDataBody<MeDto>>): Promise<void> {
  res.status(200).json({ data: await authService.getMe(getAuth(req).userId) });
}
