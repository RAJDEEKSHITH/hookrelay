import type { ApiDataBody, ApiKeyDto } from "@hookrelay/shared";
import type { Request, Response } from "express";
import { getAuth } from "../middlewares/auth.middleware";
import * as apiKeysService from "../services/api-keys.service";
import type { CreateApiKeyInput, ListApiKeysQuery } from "../validators/api-keys.validator";
import type { IdParams } from "../validators/common.validator";

export async function listApiKeys(
  req: Request<Record<string, string>, unknown, unknown, ListApiKeysQuery>,
  res: Response<ApiDataBody<ApiKeyDto[]>>,
): Promise<void> {
  res.status(200).json({ data: await apiKeysService.listApiKeys(getAuth(req).tenantId, req.query.limit) });
}

export async function createApiKey(
  req: Request<Record<string, string>, unknown, CreateApiKeyInput>,
  res: Response<ApiDataBody<ApiKeyDto>>,
): Promise<void> {
  res.status(201).json({ data: await apiKeysService.createApiKey(getAuth(req), req.body.name) });
}

export async function revokeApiKey(req: Request<IdParams>, res: Response): Promise<void> {
  await apiKeysService.revokeApiKey(getAuth(req).tenantId, req.params.id);
  res.status(204).end();
}
