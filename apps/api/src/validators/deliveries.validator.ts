import { z } from "zod";
import { limitSchema } from "./common.validator";

export const listDeliveriesQuerySchema = z.object({
  status: z.enum(["pending", "success", "dead"]).optional(),
  endpointId: z.uuid().optional(),
  eventId: z.uuid().optional(),
  limit: limitSchema,
});
export type ListDeliveriesQuery = z.infer<typeof listDeliveriesQuerySchema>;
