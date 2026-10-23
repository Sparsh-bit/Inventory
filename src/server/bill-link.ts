import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

// Public bill links: /bill/<orgId><saleId>.<HMAC>. Unguessable without the server secret, no login needed.
const key = () => createHash("sha256").update(`${env.BETTER_AUTH_SECRET}:bill-link:v1`).digest();
const sign = (ids: string) => createHmac("sha256", key()).update(`bill:${ids}`).digest("base64url").slice(0, 27);

export const billToken = (orgId: string, saleId: string) => `${orgId}${saleId}.${sign(orgId + saleId)}`;
export const billUrl = (orgId: string, saleId: string) => `${env.APP_URL.replace(/\/$/, "")}/bill/${billToken(orgId, saleId)}`;

/** { orgId, saleId } if the token is genuine, otherwise null. */
export function verifyBillToken(token: string): { orgId: string; saleId: string } | null {
  const m = /^([a-f0-9]{24})([a-f0-9]{24})\.([A-Za-z0-9_-]{27})$/.exec(token);
  if (!m) return null;
  const a = Buffer.from(m[3]);
  const b = Buffer.from(sign(m[1] + m[2]));
  return a.length === b.length && timingSafeEqual(a, b) ? { orgId: m[1], saleId: m[2] } : null;
}
