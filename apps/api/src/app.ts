import { MAX_PAYLOAD_BYTES } from "@hookrelay/shared";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { requestId } from "./middlewares/request-id.middleware";
import { routes } from "./routes";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(requestId);
  // Only the dashboard may call with credentials; together with SameSite=Lax cookies this is the CSRF defence.
  app.use(cors({ origin: env.DASHBOARD_URL, credentials: true }));
  app.use(express.json({ limit: MAX_PAYLOAD_BYTES }));
  app.use(cookieParser(env.COOKIE_SECRET));

  app.use(routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
