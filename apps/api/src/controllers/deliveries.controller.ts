import type { ApiDataBody, DeliveryDto } from "@hookrelay/shared";
import type { Request, Response } from "express";
import { getAuth } from "../middlewares/auth.middleware";
import * as deliveriesService from "../services/deliveries.service";
import type { IdParams } from "../validators/common.validator";
import type { ListDeliveriesQuery } from "../validators/deliveries.validator";

export async function listDeliveries(
  req: Request<Record<string, string>, unknown, unknown, ListDeliveriesQuery>,
  res: Response<ApiDataBody<DeliveryDto[]>>,
): Promise<void> {
  res.status(200).json({ data: await deliveriesService.listDeliveries(getAuth(req).tenantId, req.query) });
}

export async function getDelivery(req: Request<IdParams>, res: Response<ApiDataBody<DeliveryDto>>): Promise<void> {
  res.status(200).json({ data: await deliveriesService.getDelivery(getAuth(req).tenantId, req.params.id) });
}

export async function replayDelivery(req: Request<IdParams>, res: Response<ApiDataBody<DeliveryDto>>): Promise<void> {
  res.status(202).json({ data: await deliveriesService.replayDelivery(getAuth(req).tenantId, req.params.id) });
}
