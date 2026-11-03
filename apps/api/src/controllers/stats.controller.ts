import type { ApiDataBody, StatsDto } from "@hookrelay/shared";
import type { Request, Response } from "express";
import { getAuth } from "../middlewares/auth.middleware";
import * as statsService from "../services/stats.service";

export async function getStats(req: Request, res: Response<ApiDataBody<StatsDto>>): Promise<void> {
  res.status(200).json({ data: await statsService.getStats(getAuth(req).tenantId) });
}
