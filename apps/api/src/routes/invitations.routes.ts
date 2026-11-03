import { Router } from "express";
import * as invitationsController from "../controllers/invitations.controller";
import { validate } from "../middlewares/validate.middleware";
import { acceptInvitationSchema } from "../validators/invitations.validator";

export const invitationsRouter = Router();

// No session: the token in the body is the credential.
invitationsRouter.post("/accept", validate({ body: acceptInvitationSchema }), invitationsController.acceptInvitation);
