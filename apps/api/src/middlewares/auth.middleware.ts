import type { Request, RequestHandler } from "express";
import { authenticateSession, type AuthContext } from "../services/auth.service";
import { AppError } from "../utils/app-error";
import { readSessionCookie } from "../utils/cookies";

const notLoggedIn = () => new AppError(401, "unauthorized", "Not logged in");

export const requireSession: RequestHandler = async (req, _res, next) => {
  const sessionId = readSessionCookie(req);
  if (sessionId === null) {
    next(notLoggedIn());
    return;
  }
  const auth = await authenticateSession(sessionId);
  if (auth === null) {
    next(notLoggedIn());
    return;
  }
  req.auth = auth;
  next();
};

/**
 * For controllers behind requireSession: req.auth is optional in the Request type, so this narrows it.
 * Takes any request shape so controllers typed with Request<Params, ..., Query> generics can pass theirs.
 */
export function getAuth(req: Pick<Request, "auth">): AuthContext {
  if (!req.auth) throw notLoggedIn();
  return req.auth;
}
