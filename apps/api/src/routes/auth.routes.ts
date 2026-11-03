import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireSession } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { loginSchema, registerSchema } from "../validators/auth.validator";

export const authRouter = Router();

authRouter.post("/register", validate({ body: registerSchema }), authController.register);
authRouter.post("/login", validate({ body: loginSchema }), authController.login);
authRouter.post("/logout", requireSession, authController.logout);
authRouter.get("/me", requireSession, authController.me);
