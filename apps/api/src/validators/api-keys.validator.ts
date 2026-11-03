import { z } from "zod";
import { limitSchema, nameSchema } from "./common.validator";

export const createApiKeySchema = z.object({ name: nameSchema });
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const listApiKeysQuerySchema = z.object({ limit: limitSchema });
export type ListApiKeysQuery = z.infer<typeof listApiKeysQuerySchema>;
