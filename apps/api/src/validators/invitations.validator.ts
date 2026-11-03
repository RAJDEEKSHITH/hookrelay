import { z } from "zod";
import { emailSchema, nameSchema, passwordSchema } from "./common.validator";

export const createInvitationSchema = z.object({ email: emailSchema });
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1).max(256),
  name: nameSchema,
  password: passwordSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
