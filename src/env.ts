import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().startsWith("mongodb"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  APP_URL: z.url(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("StockPilot <no-reply@localhost>"),
  // "file" writes outgoing mail to .data/mail.log (used by E2E tests)
  MAIL_SINK: z.enum(["smtp", "console", "file"]).optional(),
  UPLOAD_DIR: z.string().default("./uploads"),
});

// `next build` (e.g. in Docker/CI) runs without runtime secrets; validate strictly at runtime.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const parsed = schema.safeParse(process.env);
if (!parsed.success && !isBuild) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.success
  ? parsed.data
  : schema.parse({ ...process.env, MONGODB_URI: "mongodb://build-placeholder", BETTER_AUTH_SECRET: "build-placeholder-".padEnd(40, "x"), APP_URL: "http://localhost:3000" });
