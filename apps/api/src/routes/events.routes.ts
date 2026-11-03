import { Router } from "express";
import * as eventsController from "../controllers/events.controller";
import { requireApiKey } from "../middlewares/api-key.middleware";
import { validate } from "../middlewares/validate.middleware";
import { ingestEventSchema } from "../validators/events.validator";

export const eventsRouter = Router();

// The only API-key route; the session-based list/get routes are added next to it.
eventsRouter.post("/", requireApiKey, validate({ body: ingestEventSchema }), eventsController.ingestEvent);
