import { Router } from "express";
import * as endpointsController from "../controllers/endpoints.controller";
import { requireSession } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { idParamsSchema } from "../validators/common.validator";
import { createEndpointSchema, updateEndpointSchema } from "../validators/endpoints.validator";

export const endpointsRouter = Router();

endpointsRouter.use(requireSession);

endpointsRouter.get("/", endpointsController.listEndpoints);
endpointsRouter.post("/", validate({ body: createEndpointSchema }), endpointsController.createEndpoint);
endpointsRouter.get("/:id", validate({ params: idParamsSchema }), endpointsController.getEndpoint);
endpointsRouter.patch(
  "/:id",
  validate({ params: idParamsSchema, body: updateEndpointSchema }),
  endpointsController.updateEndpoint,
);
endpointsRouter.delete("/:id", validate({ params: idParamsSchema }), endpointsController.deleteEndpoint);
endpointsRouter.post("/:id/rotate-secret", validate({ params: idParamsSchema }), endpointsController.rotateSecret);
endpointsRouter.post("/:id/test", validate({ params: idParamsSchema }), endpointsController.sendTestEvent);
