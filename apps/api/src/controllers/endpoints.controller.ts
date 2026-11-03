import type { ApiDataBody, EndpointDto, EventIngestDto } from "@hookrelay/shared";
import type { Request, Response } from "express";
import { getAuth } from "../middlewares/auth.middleware";
import * as endpointsService from "../services/endpoints.service";
import type { IdParams } from "../validators/common.validator";
import type { CreateEndpointInput, UpdateEndpointInput } from "../validators/endpoints.validator";

export async function listEndpoints(req: Request, res: Response<ApiDataBody<EndpointDto[]>>): Promise<void> {
  res.status(200).json({ data: await endpointsService.listEndpoints(getAuth(req).tenantId) });
}

export async function createEndpoint(
  req: Request<Record<string, string>, unknown, CreateEndpointInput>,
  res: Response<ApiDataBody<EndpointDto>>,
): Promise<void> {
  res.status(201).json({ data: await endpointsService.createEndpoint(getAuth(req).tenantId, req.body) });
}

export async function getEndpoint(req: Request<IdParams>, res: Response<ApiDataBody<EndpointDto>>): Promise<void> {
  res.status(200).json({ data: await endpointsService.getEndpoint(getAuth(req).tenantId, req.params.id) });
}

export async function updateEndpoint(
  req: Request<IdParams, unknown, UpdateEndpointInput>,
  res: Response<ApiDataBody<EndpointDto>>,
): Promise<void> {
  res.status(200).json({ data: await endpointsService.updateEndpoint(getAuth(req).tenantId, req.params.id, req.body) });
}

export async function deleteEndpoint(req: Request<IdParams>, res: Response): Promise<void> {
  await endpointsService.deleteEndpoint(getAuth(req).tenantId, req.params.id);
  res.status(204).end();
}

export async function rotateSecret(req: Request<IdParams>, res: Response<ApiDataBody<EndpointDto>>): Promise<void> {
  res.status(200).json({ data: await endpointsService.rotateSecret(getAuth(req).tenantId, req.params.id) });
}

export async function sendTestEvent(req: Request<IdParams>, res: Response<ApiDataBody<EventIngestDto>>): Promise<void> {
  res.status(202).json({ data: await endpointsService.sendTestEvent(getAuth(req).tenantId, req.params.id) });
}
