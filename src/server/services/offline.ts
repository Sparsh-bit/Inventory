import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { fiscalYear, parseOfflineNumber } from "@/lib/numbering";
import { can } from "@/lib/permissions";
import { objectId } from "@/lib/schemas";
import { computeBill } from "@/lib/tax";
import { AppError, getOrgSettings, type Ctx } from "../context";
import { Batch, Device, Location, OrgSettings, Party, Sale, SerialNumber, type OrgSettingsDoc } from "../models";
import { inTransaction } from "../with-auth";
import { catalogSnapshot, getVariantHits } from "./products";
import { applyMoves, pickBatchesFefo } from "./stock";
import { audit } from "./system";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function registerDevice(ctx: Ctx, name: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const n = (await Device.countDocuments({ orgId: ctx.orgId })) + 1 + attempt;
    const token = randomBytes(32).toString("base64url");
    try {
      await Device.create({ orgId: ctx.orgId, code: `T${n}`, name, tokenHash: hash(token), registeredBy: ctx.userId });
      await audit(ctx, "create", "device", `T${n}`, `Registered till T${n} (${name})`);
      return { code: `T${n}`, token };
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  throw new AppError("CONFLICT", "Could not register this till. Try again.");
}

export async function deviceFromToken(ctx: Ctx, token: string) {
  const d = await Device.findOne({ orgId: ctx.orgId, tokenHash: hash(token) });
  if (!d) throw new AppError("FORBIDDEN", "This till is not registered for this business. Reload the POS while online.");
  return d;
}

export async function posSnapshot(ctx: Ctx, locationId: string) {
  const s = await getOrgSettings(ctx.orgId);
  if (!(await Location.exists({ orgId: ctx.orgId, _id: locationId, active: true }))) throw new AppError("INVALID", "Location not found");
  const [variants, customers, serials] = await Promise.all([
    catalogSnapshot(ctx, locationId),
    Party.find({ orgId: ctx.orgId, kind: "customer", active: true }, { name: 1, phone: 1, stateCode: 1, taxId: 1, balance: 1, creditLimit: 1 }).sort({ name: 1 }).limit(20000).lean(),
    SerialNumber.find({ orgId: ctx.orgId, locationId, status: "in_stock" }, { serial: 1, variantId: 1 }).limit(50000).lean(),
  ]);
  const a = s.address ?? {};
  return {
    generatedAt: new Date().toISOString(),
    locationId,
    variants,
    customers: customers.map((c) => ({ id: String(c._id), name: c.name, phone: c.phone, stateCode: c.stateCode, taxId: c.taxId, balance: c.balance, creditLimit: c.creditLimit })),
    serials: serials.map((x) => ({ serial: x.serial, variantId: String(x.variantId) })),
    settings: {
      orgName: ctx.orgName, legalName: s.legalName ?? "", address: [a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", "), phone: s.phone ?? "", email: s.email ?? "",
      taxId: s.taxId ?? "", taxMode: s.taxMode as "GST" | "VAT" | "NONE", stateCode: s.stateCode ?? "", roundOff: s.roundOff, currency: s.currency, locale: s.locale, timezone: s.timezone,
      fiscalYearStartMonth: s.fiscalYearStartMonth, prefixes: { sale: s.prefixes?.sale ?? "S", invoice: s.prefixes?.invoice ?? "INV" },
      receipt: { paperWidth: (s.receipt?.paperWidth ?? 80) as 58 | 80, header: s.receipt?.header ?? "", footer: s.receipt?.footer ?? "", showHsn: !!s.receipt?.showHsn, upiId: s.receipt?.upiId ?? "", showUpiQr: !!s.receipt?.showUpiQr },
      logoUrl: s.logoUrl ?? null,
    },
  };
}
export type PosSnapshot = Awaited<ReturnType<typeof posSnapshot>>;

export const offlineSaleInput = z
  .object({
    clientId: z.uuid(),
    number: z.string().max(24),
    createdAt: z.iso.datetime(),
    locationId: objectId,
    customerId: objectId.nullable(),
    kind: z.enum(["receipt", "tax_invoice"]),
    billDiscount: z.number().int().min(0).max(1e13),
    notes: z.string().max(500).default(""),
    lines: z.array(z.object({ variantId: objectId, qty: z.number().int().min(1).max(1e9), unitPrice: z.number().int().min(0).max(1e13), discount: z.number().int().min(0).max(1e13), serials: z.array(z.string().trim().min(1).max(64)).max(500).default([]) }).strict()).min(1).max(500),
    payments: z.array(z.object({ method: z.enum(["cash", "card", "upi", "credit", "other"]), amount: z.number().int().min(0).max(1e13), reference: z.string().max(100).default("") }).strict()).max(10),
    grandTotal: z.number().int().min(0).max(1e13),
  })
  .strict();
type OfflineSale = z.output<typeof offlineSaleInput>;
export type SyncResult = { clientId: string; status: "synced" | "duplicate" | "rejected"; saleId?: string; number: string; issues?: string[]; error?: string };

/**
 * Records a bill that was already sold on an offline till. The customer has the goods and a
 * printed receipt, so conflicts never reject the bill; they are attached as `syncIssues` for a
 * manager to review. Idempotent on `clientId`.
 */
export async function syncOfflineSale(ctx: Ctx, deviceCode: string, deviceId: string, input: OfflineSale): Promise<SyncResult> {
  const base = { clientId: input.clientId, number: input.number };
  const existing = await Sale.findOne({ orgId: ctx.orgId, clientId: input.clientId }, { _id: 1 }).lean();
  if (existing) return { ...base, status: "duplicate", saleId: String(existing._id) };

  const settings = await OrgSettings.findOne({ orgId: ctx.orgId }).lean<OrgSettingsDoc>();
  if (!settings) throw new AppError("NOT_FOUND", "Business settings missing");
  const parsed = parseOfflineNumber(input.number);
  const created = new Date(input.createdAt);
  const prefix = input.kind === "tax_invoice" ? settings.prefixes?.invoice : settings.prefixes?.sale;
  if (!parsed || parsed.deviceCode !== deviceCode || parsed.prefix !== prefix) return { ...base, status: "rejected", error: "Bill number does not belong to this till." };
  if (created.getTime() > Date.now() + 5 * 60e3 || created.getTime() < Date.now() - 90 * 864e5) return { ...base, status: "rejected", error: "Bill date is outside the allowed range." };
  if (parsed.fy !== fiscalYear(created, settings.fiscalYearStartMonth, settings.timezone)) return { ...base, status: "rejected", error: "Bill number year does not match the bill date." };

  try {
    return await inTransaction(async (session) => {
      const issues: { code: string; message: string }[] = [];
      const location = await Location.findOne({ orgId: ctx.orgId, _id: input.locationId }, null, { session }).lean();
      if (!location) throw new AppError("INVALID", "Location not found");
      const customer = input.customerId ? await Party.findOne({ orgId: ctx.orgId, _id: input.customerId, kind: "customer" }, null, { session }).lean() : null;
      const hits = new Map((await getVariantHits(ctx, input.lines.map((l) => l.variantId), input.locationId)).map((h) => [h.variantId, h]));
      const interState = settings.taxMode === "GST" && !!customer?.stateCode && !!settings.stateCode && customer.stateCode !== settings.stateCode;

      // Expand batch-tracked lines by FEFO now that we know real stock.
      const priced: { hit: NonNullable<ReturnType<typeof hits.get>>; qty: number; unitPrice: number; discount: number; batchId: string | null; batchNo?: string; unitCost: number; serials: string[] }[] = [];
      for (const l of input.lines) {
        const hit = hits.get(l.variantId);
        if (!hit) throw new AppError("INVALID", "A product on this bill no longer exists.");
        if (l.unitPrice !== hit.salePrice && !can(ctx.role, "price:override")) issues.push({ code: "price_changed", message: `${hit.name}: sold at ${l.unitPrice / 100}, current price ${hit.salePrice / 100}` });
        if (!hit.trackBatch) {
          priced.push({ hit, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, batchId: null, unitCost: hit.costPrice, serials: l.serials });
          continue;
        }
        const parts = await pickBatchesFefo(ctx, hit.variantId, input.locationId, l.qty, session);
        if (!parts.length) {
          priced.push({ hit, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, batchId: null, unitCost: hit.costPrice, serials: [] });
          continue;
        }
        const batches = new Map((await Batch.find({ orgId: ctx.orgId, _id: { $in: parts.map((p) => p.batchId) } }, null, { session }).lean()).map((b) => [String(b._id), b]));
        let left = l.discount;
        parts.forEach((p, i) => {
          const d = i === parts.length - 1 ? left : Math.round((l.discount * p.qty) / l.qty);
          left -= d;
          const b = batches.get(p.batchId);
          priced.push({ hit, qty: p.qty, unitPrice: l.unitPrice, discount: d, batchId: p.batchId, batchNo: b?.batchNo, unitCost: b?.costPrice || hit.costPrice, serials: [] });
        });
      }

      const bill = computeBill({
        lines: priced.map((p) => ({ unitPrice: p.unitPrice, qty: p.qty, scale: p.hit.scale, discount: p.discount, rateBp: p.hit.rateBp, cessBp: p.hit.cessBp, inclusive: p.hit.inclusive })),
        billDiscount: input.billDiscount, mode: settings.taxMode as "GST", interState, roundOff: settings.roundOff,
      });
      if (bill.grandTotal !== input.grandTotal) issues.push({ code: "total_changed", message: `Printed total ${input.grandTotal / 100}, recalculated ${bill.grandTotal / 100} (tax or price data changed while offline)` });

      const tendered = input.payments.reduce((a, p) => a + p.amount, 0);
      const cash = input.payments.filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0);
      const credit = input.payments.filter((p) => p.method === "credit").reduce((a, p) => a + p.amount, 0);
      const change = Math.min(cash, Math.max(0, tendered - bill.grandTotal));
      const paidNow = tendered - credit - change; // money actually received
      const balanceDue = customer ? Math.max(0, bill.grandTotal - paidNow) : 0;
      if (!customer && paidNow < bill.grandTotal) issues.push({ code: "underpaid", message: `Collected ${paidNow / 100} of ${bill.grandTotal / 100}` });

      const [sale] = await Sale.create(
        [{
          orgId: ctx.orgId, number: input.number, kind: input.kind, status: "completed", locationId: input.locationId, customerId: customer?._id ?? null,
          customer: customer ? { name: customer.name, phone: customer.phone, taxId: customer.taxId, stateCode: customer.stateCode } : undefined, interState,
          lines: priced.map((p, i) => ({
            productId: p.hit.productId, variantId: p.hit.variantId, batchId: p.batchId, batchNo: p.batchNo, name: [p.hit.name, p.hit.variantName].filter(Boolean).join(" - "),
            sku: p.hit.sku, hsn: p.hit.hsn, unit: p.hit.unit, scale: p.hit.scale, qty: p.qty, unitPrice: p.unitPrice, mrp: p.hit.mrp, unitCost: p.unitCost,
            inclusive: p.hit.inclusive, rateBp: p.hit.rateBp, cessBp: p.hit.cessBp, serials: p.serials, ...bill.lines[i],
          })),
          billDiscount: input.billDiscount, subtotal: bill.subtotal, discountTotal: bill.discountTotal, taxableTotal: bill.taxableTotal, cgst: bill.cgst, sgst: bill.sgst, igst: bill.igst,
          vat: bill.vat, cess: bill.cess, taxTotal: bill.taxTotal, roundOff: bill.roundOff, grandTotal: bill.grandTotal, payments: input.payments.filter((p) => p.amount > 0),
          amountPaid: bill.grandTotal - balanceDue, change, balanceDue, cashierId: ctx.userId, cashierName: ctx.userName, notes: input.notes, completedAt: created,
          clientId: input.clientId, deviceCode,
        }],
        { session },
      );
      const saleId = String(sale._id);
      const short = await applyMoves(
        ctx,
        priced.map((p) => ({ productId: p.hit.productId, variantId: p.hit.variantId, locationId: input.locationId, batchId: p.batchId, qtyDelta: -p.qty, unitCost: p.unitCost, type: "sale" as const, ref: { kind: "sale", id: saleId, number: input.number } })),
        session,
        { flagShort: true },
      );
      for (const v of new Set(short)) issues.push({ code: "stock_short", message: `${hits.get(v)?.name ?? "An item"} went below zero stock` });

      for (const p of priced.filter((x) => x.serials.length)) {
        for (const serial of p.serials) {
          const r = await SerialNumber.updateOne(
            { orgId: ctx.orgId, variantId: p.hit.variantId, serial, status: "in_stock" },
            { $set: { status: "sold", locationId: input.locationId, saleId, saleNumber: input.number, customerId: customer?._id ?? null, soldAt: created }, $push: { history: { at: new Date(), event: "sold (offline)", ref: input.number } } },
            { session },
          );
          if (!r.matchedCount) issues.push({ code: "serial_unavailable", message: `Serial ${serial} was not in stock` });
        }
      }
      if (customer && balanceDue > 0) {
        await Party.updateOne({ orgId: ctx.orgId, _id: customer._id }, { $inc: { balance: balanceDue } }, { session });
        if (customer.creditLimit > 0 && customer.balance + balanceDue > customer.creditLimit) issues.push({ code: "credit_limit", message: `${customer.name} is over the credit limit` });
      }
      if (issues.length) await Sale.updateOne({ orgId: ctx.orgId, _id: sale._id }, { $set: { syncIssues: issues } }, { session });
      await Device.updateOne({ orgId: ctx.orgId, _id: deviceId }, { $max: { [`lastSeq.${parsed.prefix}:${parsed.fy}`]: parsed.seq }, $set: { lastSyncAt: new Date() } }, { session });
      await audit(ctx, "sync", "sale", saleId, `Offline sale ${input.number} synced from ${deviceCode}`, issues.length ? { issues } : undefined, session);
      return { ...base, status: "synced" as const, saleId, issues: issues.map((i) => i.message) };
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      const again = await Sale.findOne({ orgId: ctx.orgId, clientId: input.clientId }, { _id: 1 }).lean();
      if (again) return { ...base, status: "duplicate", saleId: String(again._id) };
      return { ...base, status: "rejected", error: `Bill number ${input.number} is already used.` };
    }
    if (e instanceof AppError) return { ...base, status: "rejected", error: e.message };
    throw e;
  }
}

export async function markReviewed(ctx: Ctx, saleId: string) {
  const r = await Sale.updateOne({ orgId: ctx.orgId, _id: saleId }, { $set: { syncIssues: [] } });
  if (!r.matchedCount) throw new AppError("NOT_FOUND", "Sale not found");
  await audit(ctx, "review", "sale", saleId, "Marked offline sale as reviewed");
}
