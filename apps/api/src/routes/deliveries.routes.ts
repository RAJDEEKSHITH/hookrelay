import { Router } from "express";
import * as deliveriesController from "../controllers/deliveries.controller";
import { requireSession } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { idParamsSchema } from "../validators/common.validator";
import { listDeliveriesQuerySchema } from "../validators/deliveries.validator";

export const deliveriesRouter = Router();

deliveriesRouter.use(requireSession);

deliveriesRouter.get("/", validate({ query: listDeliveriesQuerySchema }), deliveriesController.listDeliveries);
deliveriesRouter.get("/:id", validate({ params: idParamsSchema }), deliveriesController.getDelivery);
deliveriesRouter.post("/:id/replay", validate({ params: idParamsSchema }), deliveriesController.replayDelivery);
