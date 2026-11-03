import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENCRYPTION_KEY: z.base64().transform((value, ctx) => {
    const key = Buffer.from(value, "base64");
    if (key.length !== 32) {
      ctx.addIssue({
        code: "custom",
        message: `must decode to 32 bytes, got ${key.length} (openssl rand -base64 32)`,
      });
      return z.NEVER;
    }
    return key;
  }),
  ALLOW_HTTP_DESTINATIONS: z.stringbool().default(false),
  ALLOW_PRIVATE_DESTINATIONS: z.stringbool().default(false),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(1000).default(20),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // The logger is configured from env, so it cannot report its own configuration errors.
    console.error("Invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
