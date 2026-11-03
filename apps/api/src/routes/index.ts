import { Router } from "express";
import { authRouter } from "./auth.routes";
import { healthRouter } from "./health.routes";

export const routes = Router();

routes.use(healthRouter);
routes.use("/v1/auth", authRouter);
