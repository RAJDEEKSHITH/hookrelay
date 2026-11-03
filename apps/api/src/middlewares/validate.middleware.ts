import type { ApiErrorDetail } from "@hookrelay/shared";
import type { RequestHandler } from "express";
import type { z } from "zod";
import { AppError } from "../utils/app-error";

interface RequestSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

type Part = keyof RequestSchemas;

/** Parses each part with zod and puts the parsed (coerced, defaulted) values back on the request. */
export function validate(schemas: RequestSchemas): RequestHandler {
  return async (req, _res, next) => {
    const details: ApiErrorDetail[] = [];
    const parsed: Partial<Record<Part, unknown>> = {};

    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = await schema.safeParseAsync(req[part]);
      if (result.success) {
        parsed[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ path: [part, ...issue.path.map(String)].join("."), message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      next(new AppError(400, "validation_error", "Request validation failed", details));
      return;
    }

    if ("body" in parsed) req.body = parsed.body;
    // The controller's Request<Params, ...> generic gives these their real type; zod has just produced them.
    if ("params" in parsed) req.params = parsed.params as typeof req.params;
    // Express 5 defines req.query as a getter, so it cannot be assigned.
    if ("query" in parsed) Object.defineProperty(req, "query", { value: parsed.query });
    next();
  };
}
