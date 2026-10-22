import "server-only";
import { fiscalYear } from "@/lib/numbering";
import type { ClientSession } from "mongoose";
import type { Ctx } from "../context";
import { AuditLog, Counter, OrgSettings, type OrgSettingsDoc } from "../models";

export type DocType = "sale" | "invoice" | "return" | "purchase" | "barcode";

/** Gap-free per business & fiscal year when called inside the document's transaction. */
export async function nextNumber(ctx: Ctx, docType: DocType, session?: ClientSession): Promise<{ seq: number; number: string }> {
  const settings = await OrgSettings.findOne({ orgId: ctx.orgId }, null, { session }).lean<OrgSettingsDoc>();
  if (docType === "barcode") {
    const c = await Counter.findOneAndUpdate({ orgId: ctx.orgId, key: "barcode" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after", session });
    return { seq: c!.seq, number: String(c!.seq) };
  }
  const fy = fiscalYear(new Date(), settings?.fiscalYearStartMonth ?? 4, settings?.timezone ?? "UTC");
  const c = await Counter.findOneAndUpdate({ orgId: ctx.orgId, key: `${docType}:${fy}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after", session });
  const prefix = settings?.prefixes?.[docType] ?? docType.toUpperCase();
  return { seq: c!.seq, number: `${prefix}/${fy}/${String(c!.seq).padStart(5, "0")}` };
}

export async function audit(ctx: Ctx, action: string, entity: string, entityId: string, summary: string, diff?: unknown, session?: ClientSession) {
  await AuditLog.create(
    [{ orgId: ctx.orgId, userId: ctx.userId, userName: ctx.userName, action, entity, entityId, summary, diff: diff ?? null, ip: ctx.ip, userAgent: ctx.ua?.slice(0, 300) }],
    { session },
  );
}
