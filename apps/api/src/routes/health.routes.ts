import { Router } from "express";
import { healthz, readyz } from "../controllers/health.controller";

export const healthRouter = Router();

healthRouter.get("/healthz", healthz);
healthRouter.get("/readyz", readyz);
