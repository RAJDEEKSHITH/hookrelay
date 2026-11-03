import type { UserRole } from "@hookrelay/shared";
import type { RequestHandler } from "express";
import { AppError } from "../utils/app-error";

/** Use after requireSession. */
export function requireRole(role: UserRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError(401, "unauthorized", "Not logged in"));
      return;
    }
    if (req.auth.role !== role) {
      next(new AppError(403, "forbidden", `Only the ${role} can do this`));
      return;
    }
    next();
  };
}
