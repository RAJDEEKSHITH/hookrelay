import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside our apps, so it loads the root .env itself (scripts run with cwd = packages/db).
config({ path: "../../.env", quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set: copy .env.example to .env at the repo root");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
