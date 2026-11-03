import { Router } from "express";
import * as statsController from "../controllers/stats.controller";
import { requireSession } from "../middlewares/auth.middleware";

export const statsRouter = Router();

statsRouter.use(requireSession);

statsRouter.get("/", statsController.getStats);
