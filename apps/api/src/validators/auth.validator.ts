import { z } from "zod";
import { emailSchema, nameSchema, passwordSchema } from "./common.validator";

export const registerSchema = z.object({
  tenantName: nameSchema,
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;
