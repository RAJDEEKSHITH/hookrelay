import { Router } from "express";
import * as apiKeysController from "../controllers/api-keys.controller";
import { requireSession } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/require-role.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createApiKeySchema, listApiKeysQuerySchema } from "../validators/api-keys.validator";
import { idParamsSchema } from "../validators/common.validator";

export const apiKeysRouter = Router();

apiKeysRouter.use(requireSession);

apiKeysRouter.get("/", validate({ query: listApiKeysQuerySchema }), apiKeysController.listApiKeys);
apiKeysRouter.post("/", requireRole("owner"), validate({ body: createApiKeySchema }), apiKeysController.createApiKey);
apiKeysRouter.delete("/:id", requireRole("owner"), validate({ params: idParamsSchema }), apiKeysController.revokeApiKey);
