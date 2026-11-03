import { Router } from "express";
import { apiKeysRouter } from "./api-keys.routes";
import { authRouter } from "./auth.routes";
import { endpointsRouter } from "./endpoints.routes";
import { eventsRouter } from "./events.routes";
import { healthRouter } from "./health.routes";
import { invitationsRouter } from "./invitations.routes";
import { teamRouter } from "./team.routes";

export const routes = Router();

routes.use(healthRouter);
routes.use("/v1/auth", authRouter);
routes.use("/v1/team", teamRouter);
routes.use("/v1/invitations", invitationsRouter);
routes.use("/v1/api-keys", apiKeysRouter);
routes.use("/v1/endpoints", endpointsRouter);
routes.use("/v1/events", eventsRouter);
