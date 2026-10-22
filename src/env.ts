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

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
