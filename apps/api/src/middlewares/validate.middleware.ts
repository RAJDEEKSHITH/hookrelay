import type { ApiErrorDetail } from "@hookrelay/shared";
import type { Request, RequestHandler } from "express";
import type { z } from "zod";
import { AppError } from "../utils/app-error";

type Output<TSchema, TFallback> = TSchema extends z.ZodType ? z.output<TSchema> : TFallback;

type Part = "params" | "query" | "body";

/**
 * Parses each part with zod and puts the parsed (coerced, defaulted) values back on the request.
 * The returned handler is typed with the schemas' output types, so Express infers the same Params/Body/Query
 * for the controller after it (Request<IdParams, unknown, Body, Query>) and controllers never re-parse.
 */
export function validate<
  TParams extends z.ZodType | undefined = undefined,
  TQuery extends z.ZodType | undefined = undefined,
  TBody extends z.ZodType | undefined = undefined,
>(schemas: {
  params?: TParams;
  query?: TQuery;
  body?: TBody;
}): RequestHandler<
  Output<TParams, Request["params"]>,
  unknown,
  Output<TBody, unknown>,
  Output<TQuery, Request["query"]>
> {
  const handler: RequestHandler = async (req, _res, next) => {
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
    // Plain assignment; Reflect.set because this untyped handler sees params as Record<string, string>.
    if ("params" in parsed) Reflect.set(req, "params", parsed.params);
    // Express 5 defines req.query as a getter, so it cannot be assigned.
    if ("query" in parsed) Object.defineProperty(req, "query", { value: parsed.query });
    next();
  };
  // The values on the request were just produced by these schemas, which is exactly what the generic claims.
  return handler as RequestHandler<
    Output<TParams, Request["params"]>,
    unknown,
    Output<TBody, unknown>,
    Output<TQuery, Request["query"]>
  >;
}
