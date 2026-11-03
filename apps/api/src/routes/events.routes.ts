import { Router } from "express";
import * as eventsController from "../controllers/events.controller";
import { requireApiKey } from "../middlewares/api-key.middleware";
import { requireSession } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { idParamsSchema } from "../validators/common.validator";
import { ingestEventSchema, listEventsQuerySchema } from "../validators/events.validator";

export const eventsRouter = Router();

// Ingest is the only API-key route; it is matched first, so the session guard below never sees it.
eventsRouter.post("/", requireApiKey, validate({ body: ingestEventSchema }), eventsController.ingestEvent);

// Reading events needs a dashboard session. A separate router keeps requireSession out of each route's
// handler list, where its untyped query would clash with validate()'s typed one.
const readRouter = Router();
readRouter.use(requireSession);
readRouter.get("/", validate({ query: listEventsQuerySchema }), eventsController.listEvents);
readRouter.get("/:id", validate({ params: idParamsSchema }), eventsController.getEvent);
eventsRouter.use(readRouter);
