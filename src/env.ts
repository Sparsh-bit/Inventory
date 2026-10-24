import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().startsWith("mongodb"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  APP_URL: z.url(),
  SMTP_URL: z.string().optional(),
  // Resend API key (re_...). Takes precedence over SMTP_URL.
  RESEND_API_KEY: z.string().startsWith("re_").optional(),
  MAIL_FROM: z.string().default("StockPilot <no-reply@localhost>"),
  // "file" writes outgoing mail to .data/mail.log (used by E2E tests)
  MAIL_SINK: z.enum(["resend", "smtp", "console", "file"]).optional(),
  MAIL_FILE_PATH: z.string().optional(),
  UPLOAD_DIR: z.string().default("./uploads"),
  // Key for encrypting stored API credentials (defaults to one derived from BETTER_AUTH_SECRET).
  ENCRYPTION_KEY: z.string().min(32).optional(),
  // Extra hosts the GST e-invoice client may call (comma separated, e.g. a GSP or a local test server).
  NIC_EXTRA_HOSTS: z.string().optional(),
}).refine((e) => !(e.NODE_ENV === "production" && e.RESEND_API_KEY && /@localhost\b/.test(e.MAIL_FROM)), {
  path: ["MAIL_FROM"],
  message: "set MAIL_FROM to a sender on a domain verified in Resend, e.g. StockPilot <no-reply@yourdomain.com>",
});

// `next build` (e.g. in Docker/CI) runs without runtime secrets; validate strictly at runtime.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
// Railway exposes the generated domain; use it when APP_URL isn't set explicitly.
// Blank variables (common in hosting dashboards) count as unset, so defaults apply.
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v?.trim()));
const railwayUrl = raw.RAILWAY_PUBLIC_DOMAIN ? `https://${raw.RAILWAY_PUBLIC_DOMAIN}` : undefined;
const parsed = schema.safeParse({ ...raw, APP_URL: raw.APP_URL ?? railwayUrl });
if (!parsed.success && !isBuild) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.success
  ? parsed.data
  : schema.parse({ ...raw, MONGODB_URI: "mongodb://build-placeholder", BETTER_AUTH_SECRET: "build-placeholder-".padEnd(40, "x"), APP_URL: "http://localhost:3000" });
