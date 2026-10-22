import "server-only";
import type { ClientSession } from "mongoose";
import { AppError, type Ctx } from "../context";
import { SerialNumber } from "../models";

/** Trim, drop blanks, and reject duplicates within one request. */
export function cleanSerials(list: string[] | undefined, expected: number, label: string): string[] {
  const out = (list ?? []).map((s) => s.trim()).filter(Boolean);
  if (out.length !== expected) throw new AppError("INVALID", `${label}: enter exactly ${expected} serial number${expected === 1 ? "" : "s"} (got ${out.length}).`);
  const seen = new Set<string>();
  for (const s of out) {
    if (s.length > 64 || !/^[\x21-\x7e]+$/.test(s)) throw new AppError("INVALID", `Serial "${s}" has invalid characters.`);
    if (seen.has(s)) throw new AppError("INVALID", `Serial "${s}" is listed twice.`);
    seen.add(s);
  }
  return out;
}

const ev = (event: string, ref: string) => ({ at: new Date(), event, ref });

/** New stock arriving (purchase or positive adjustment). Re-activates serials that left earlier. */
export async function receiveSerials(
  ctx: Ctx,
  i: { productId: string; variantId: string; locationId: string; serials: string[]; purchaseId?: string | null; event: string; ref: string },
  session: ClientSession,
) {
  for (const serial of i.serials) {
    const existing = await SerialNumber.findOne({ orgId: ctx.orgId, variantId: i.variantId, serial }, { status: 1 }, { session }).lean();
    if (existing?.status === "in_stock") throw new AppError("CONFLICT", `Serial ${serial} is already in stock.`);
    await SerialNumber.updateOne(
      { orgId: ctx.orgId, variantId: i.variantId, serial },
      {
        $set: { productId: i.productId, status: "in_stock", locationId: i.locationId, purchaseId: i.purchaseId ?? null, saleId: null, saleNumber: null, customerId: null, soldAt: null, warrantyUntil: null },
        $push: { history: ev(i.event, i.ref) },
      },
      { upsert: true, session },
    );
  }
}

/** Marks serials sold; fails if any is not in stock at the location (no double-selling). */
export async function sellSerials(
  ctx: Ctx,
  i: { variantId: string; locationId: string; serials: string[]; saleId: string; saleNumber: string; customerId: string | null; warrantyMonths: number },
  session: ClientSession,
) {
  const now = new Date();
  const warrantyUntil = i.warrantyMonths > 0 ? new Date(now.getFullYear(), now.getMonth() + i.warrantyMonths, now.getDate()) : null;
  for (const serial of i.serials) {
    const r = await SerialNumber.updateOne(
      { orgId: ctx.orgId, variantId: i.variantId, serial, status: "in_stock", locationId: i.locationId },
      { $set: { status: "sold", saleId: i.saleId, saleNumber: i.saleNumber, customerId: i.customerId, soldAt: now, warrantyUntil }, $push: { history: ev("sold", i.saleNumber) } },
      { session },
    );
    if (!r.matchedCount) throw new AppError("CONFLICT", `Serial ${serial} is not in stock at this location.`);
  }
}

/** Sold serials coming back (customer return or void). */
export async function restoreSerials(ctx: Ctx, i: { variantId: string; locationId: string; serials: string[]; saleId: string; event: string; ref: string }, session: ClientSession) {
  for (const serial of i.serials) {
    const r = await SerialNumber.updateOne(
      { orgId: ctx.orgId, variantId: i.variantId, serial, status: "sold", saleId: i.saleId },
      { $set: { status: "in_stock", locationId: i.locationId, saleId: null, saleNumber: null, customerId: null, soldAt: null, warrantyUntil: null }, $push: { history: ev(i.event, i.ref) } },
      { session },
    );
    if (!r.matchedCount) throw new AppError("CONFLICT", `Serial ${serial} was not sold on this bill or is already returned.`);
  }
}

/** In-stock serials leaving: returned to supplier, written off, or moved to another location. */
export async function moveOutSerials(
  ctx: Ctx,
  i: { variantId: string; locationId: string; serials: string[]; to: { status: "returned" | "written_off" } | { locationId: string }; event: string; ref: string },
  session: ClientSession,
) {
  for (const serial of i.serials) {
    const set = "status" in i.to ? { status: i.to.status } : { locationId: i.to.locationId };
    const r = await SerialNumber.updateOne(
      { orgId: ctx.orgId, variantId: i.variantId, serial, status: "in_stock", locationId: i.locationId },
      { $set: set, $push: { history: ev(i.event, i.ref) } },
      { session },
    );
    if (!r.matchedCount) throw new AppError("CONFLICT", `Serial ${serial} is not in stock at this location.`);
  }
}

export async function findInStockSerial(ctx: Ctx, code: string, locationId?: string) {
  const filter: Record<string, unknown> = { orgId: ctx.orgId, serial: code.trim(), status: "in_stock" };
  if (locationId) filter.locationId = locationId;
  return SerialNumber.findOne(filter).lean();
}

export async function inStockSerials(ctx: Ctx, variantId: string, locationId: string) {
  return (await SerialNumber.find({ orgId: ctx.orgId, variantId, locationId, status: "in_stock" }, { serial: 1 }).sort({ serial: 1 }).limit(2000).lean()).map((s) => s.serial);
}
