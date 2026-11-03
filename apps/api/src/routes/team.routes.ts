import { Router } from "express";
import * as invitationsController from "../controllers/invitations.controller";
import * as teamController from "../controllers/team.controller";
import { requireSession } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/require-role.middleware";
import { validate } from "../middlewares/validate.middleware";
import { idParamsSchema } from "../validators/common.validator";
import { createInvitationSchema } from "../validators/invitations.validator";

export const teamRouter = Router();

teamRouter.use(requireSession);

teamRouter.get("/users", teamController.listUsers);
// Owner removes a member, or a member removes themselves; the service decides which applies.
teamRouter.delete("/users/:id", validate({ params: idParamsSchema }), teamController.removeUser);

teamRouter.get("/invitations", requireRole("owner"), invitationsController.listInvitations);
teamRouter.post(
  "/invitations",
  requireRole("owner"),
  validate({ body: createInvitationSchema }),
  invitationsController.createInvitation,
);
teamRouter.delete(
  "/invitations/:id",
  requireRole("owner"),
  validate({ params: idParamsSchema }),
  invitationsController.revokeInvitation,
);
