import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Ctx } from "../context";
import { ScanSession } from "../models";

const TTL_MS = 12 * 60 * 60 * 1000;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createScanSession(ctx: Ctx) {
  const token = randomBytes(32).toString("base64url");
  await ScanSession.create({ orgId: ctx.orgId, userId: ctx.userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL_MS) });
  return { token, expiresAt: Date.now() + TTL_MS };
}

/** Phone side: only members of the same business can push to the session. */
export async function pushScan(ctx: Ctx, token: string, code: string) {
  const r = await ScanSession.updateOne(
    { orgId: ctx.orgId, tokenHash: hash(token), expiresAt: { $gt: new Date() } },
    { $inc: { seq: 1 }, $push: { events: { $each: [{ code, at: new Date() }], $slice: -50 } } },
  );
  return r.matchedCount === 1;
}

export async function readScans(ctx: Ctx, token: string) {
  return ScanSession.findOne({ orgId: ctx.orgId, tokenHash: hash(token), expiresAt: { $gt: new Date() } }, { seq: 1, events: 1 }).lean();
}

export async function closeScanSession(ctx: Ctx, token: string) {
  await ScanSession.deleteOne({ orgId: ctx.orgId, tokenHash: hash(token) });
}
