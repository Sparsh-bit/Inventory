import "server-only";
import type { ClientSession } from "mongoose";
import { z } from "zod";
import { can } from "@/lib/permissions";
import { saleInput } from "@/lib/schemas";
import { computeBill } from "@/lib/tax";
import { AppError, type Ctx } from "../context";
import { Batch, Location, OrgSettings, Party, Sale, type OrgSettingsDoc, type SaleDoc } from "../models";
import { inTransaction } from "../with-auth";
import { getVariantHits, type VariantHit } from "./products";
import { cleanSerials, restoreSerials, sellSerials } from "./serials";
import { postLedger } from "./ledger";
import { applyMoves, pickBatchesFefo } from "./stock";
import { audit, nextNumber } from "./system";

type Input = z.output<typeof saleInput>;

// ponytail: fixed cashier discount ceiling; make it a per-business setting if shops ask.
const CASHIER_MAX_DISCOUNT_PCT = 10;

interface PricedLine {
  hit: VariantHit;
  qty: number;
  unitPrice: number;
  discount: number;
  batchId: string | null;
  batchNo?: string;
  unitCost: number;
  serials: string[];
}

async function priceLines(ctx: Ctx, input: Input, session?: ClientSession): Promise<PricedLine[]> {
  const hits = new Map((await getVariantHits(ctx, [...new Set(input.lines.map((l) => l.variantId))], input.locationId)).map((h) => [h.variantId, h]));
  const override = can(ctx.role, "price:override");
  const out: PricedLine[] = [];
  for (const l of input.lines) {
    const hit = hits.get(l.variantId);
    if (!hit) throw new AppError("INVALID", "One of the items is no longer available. Remove it and try again.");
    const unitPrice = override && l.unitPrice !== undefined ? l.unitPrice : hit.salePrice;
    if (!hit.trackBatch || !session) {
      // Serials are mandatory when the sale is completed (session); held bills may be partial.
      const serials = hit.trackSerial && session ? cleanSerials(l.serials, l.qty, hit.name) : (l.serials ?? []);
      out.push({ hit, qty: l.qty, unitPrice, discount: l.discount, batchId: null, unitCost: hit.costPrice, serials });
      continue;
    }
    const parts = l.batchId ? [{ batchId: l.batchId, qty: l.qty }] : await pickBatchesFefo(ctx, hit.variantId, input.locationId, l.qty, session);
    if (!parts.length) throw new AppError("INSUFFICIENT_STOCK", `${hit.name} is out of stock.`);
    const batches = new Map((await Batch.find({ orgId: ctx.orgId, _id: { $in: parts.map((p) => p.batchId) }, variantId: hit.variantId }, null, { session }).lean()).map((b) => [String(b._id), b]));
    let discountLeft = l.discount;
    parts.forEach((p, i) => {
      const b = batches.get(p.batchId);
      if (!b) throw new AppError("INVALID", "Batch not found");
      const d = i === parts.length - 1 ? discountLeft : Math.round((l.discount * p.qty) / l.qty);
      discountLeft -= d;
      out.push({ hit, qty: p.qty, unitPrice, discount: d, batchId: p.batchId, batchNo: b.batchNo, unitCost: b.costPrice || hit.costPrice, serials: [] });
    });
  }
  return out;
}

function bill(settings: OrgSettingsDoc, lines: PricedLine[], billDiscount: number, interState: boolean) {
  return computeBill({
    lines: lines.map((l) => ({ unitPrice: l.unitPrice, qty: l.qty, scale: l.hit.scale, discount: l.discount, rateBp: l.hit.rateBp, cessBp: l.hit.cessBp, inclusive: l.hit.inclusive })),
    billDiscount,
    mode: settings.taxMode as "GST" | "VAT" | "NONE",
    interState,
    roundOff: settings.roundOff,
  });
}

function saleLines(lines: PricedLine[], b: ReturnType<typeof computeBill>) {
  return lines.map((l, i) => ({
    productId: l.hit.productId, variantId: l.hit.variantId, batchId: l.batchId, batchNo: l.batchNo,
    name: [l.hit.name, l.hit.variantName].filter(Boolean).join(" - "), sku: l.hit.sku, hsn: l.hit.hsn, unit: l.hit.unit, scale: l.hit.scale,
    qty: l.qty, unitPrice: l.unitPrice, mrp: l.hit.mrp, unitCost: l.unitCost, inclusive: l.hit.inclusive, rateBp: l.hit.rateBp, cessBp: l.hit.cessBp,
    serials: l.serials, discount: b.lines[i].discount, taxable: b.lines[i].taxable, cgst: b.lines[i].cgst, sgst: b.lines[i].sgst, igst: b.lines[i].igst,
    vat: b.lines[i].vat, cess: b.lines[i].cess, total: b.lines[i].total,
  }));
}

const totals = (b: ReturnType<typeof computeBill>) => ({
  subtotal: b.subtotal, discountTotal: b.discountTotal, taxableTotal: b.taxableTotal, cgst: b.cgst, sgst: b.sgst, igst: b.igst,
  vat: b.vat, cess: b.cess, taxTotal: b.taxTotal, roundOff: b.roundOff, grandTotal: b.grandTotal,
});

async function loadContext(ctx: Ctx, input: Input, session?: ClientSession) {
  // Sequential on purpose: a transaction session can't run operations concurrently.
  const settings = await OrgSettings.findOne({ orgId: ctx.orgId }, null, { session }).lean<OrgSettingsDoc>();
  const location = await Location.findOne({ orgId: ctx.orgId, _id: input.locationId, active: true }, null, { session }).lean();
  const customer = input.customerId ? await Party.findOne({ orgId: ctx.orgId, _id: input.customerId, kind: "customer" }, null, { session }).lean() : null;
  if (!settings) throw new AppError("NOT_FOUND", "Business settings missing");
  if (!location) throw new AppError("INVALID", "Select a valid location");
  if (input.customerId && !customer) throw new AppError("INVALID", "Customer not found");
  const interState = settings.taxMode === "GST" && !!customer?.stateCode && !!settings.stateCode && customer.stateCode !== settings.stateCode;
  return { settings, customer, interState };
}

function customerSnapshot(c: Awaited<ReturnType<typeof loadContext>>["customer"]) {
  if (!c) return undefined;
  const a = c.address ?? {};
  return { name: c.name, phone: c.phone, taxId: c.taxId, stateCode: c.stateCode, address: [a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", ") };
}

export async function completeSale(ctx: Ctx, input: Input) {
  return inTransaction(async (session) => {
    const { settings, customer, interState } = await loadContext(ctx, input, session);
    const lines = await priceLines(ctx, input, session);
    const b = bill(settings, lines, input.billDiscount, interState);

    if (!can(ctx.role, "price:override") && b.discountTotal * 100 > b.subtotal * CASHIER_MAX_DISCOUNT_PCT) {
      throw new AppError("FORBIDDEN", `Discounts above ${CASHIER_MAX_DISCOUNT_PCT}% need a manager.`);
    }
    if (input.kind === "tax_invoice" && settings.taxMode === "GST" && !customer) throw new AppError("INVALID", "Select a customer for a tax invoice.");

    const cash = input.payments.filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0);
    const credit = input.payments.filter((p) => p.method === "credit").reduce((a, p) => a + p.amount, 0);
    const tendered = input.payments.reduce((a, p) => a + p.amount, 0);
    if (credit > 0 && !customer) throw new AppError("INVALID", "Select a customer to sell on credit.");
    if (tendered < b.grandTotal) throw new AppError("INVALID", "Payment is less than the bill total.");
    const change = tendered - b.grandTotal;
    if (change > cash) throw new AppError("INVALID", "Only cash can be over-paid (change is given in cash).");
    const balanceDue = Math.min(credit, b.grandTotal);
    if (customer && balanceDue > 0 && customer.creditLimit > 0 && customer.balance + balanceDue > customer.creditLimit) {
      throw new AppError("CREDIT_LIMIT", `This sale exceeds ${customer.name}'s credit limit.`);
    }

    const { number } = await nextNumber(ctx, input.kind === "tax_invoice" ? "invoice" : "sale", session);
    const now = new Date();
    const doc = {
      orgId: ctx.orgId, number, kind: input.kind, status: "completed" as const, locationId: input.locationId,
      customerId: customer?._id ?? null, customer: customerSnapshot(customer), interState,
      lines: saleLines(lines, b), billDiscount: input.billDiscount, ...totals(b),
      payments: input.payments.filter((p) => p.amount > 0), amountPaid: b.grandTotal - balanceDue, change, balanceDue,
      cashierId: ctx.userId, cashierName: ctx.userName, notes: input.notes, completedAt: now, clientId: input.clientId ?? null,
    };
    let saleId: string;
    if (input.heldId) {
      const held = await Sale.findOneAndUpdate({ orgId: ctx.orgId, _id: input.heldId, status: "held" }, { $set: doc }, { session, returnDocument: "after" });
      if (!held) throw new AppError("NOT_FOUND", "That held bill was already completed or deleted.");
      saleId = String(held._id);
    } else {
      const [s] = await Sale.create([doc], { session });
      saleId = String(s._id);
    }

    await applyMoves(
      ctx,
      lines.map((l) => ({ productId: l.hit.productId, variantId: l.hit.variantId, locationId: input.locationId, batchId: l.batchId, qtyDelta: -l.qty, unitCost: l.unitCost, type: "sale" as const, ref: { kind: "sale", id: saleId, number } })),
      session,
      { allowNegative: settings.allowNegativeStock },
    );
    for (const l of lines.filter((x) => x.serials.length)) {
      await sellSerials(ctx, { variantId: l.hit.variantId, locationId: input.locationId, serials: l.serials, saleId, saleNumber: number, customerId: customer ? String(customer._id) : null, warrantyMonths: l.hit.warrantyMonths }, session);
    }
    if (customer && balanceDue > 0) await postLedger(ctx, { partyId: customer._id, kind: "sale", delta: balanceDue, docKind: "sale", docId: saleId, number, note: "Bill on account" }, session);
    await audit(ctx, "complete", "sale", saleId, `Sale ${number}`, undefined, session);
    return { saleId, number };
  });
}

/** Totals preview without touching stock (used by the POS before payment). */
export async function quoteSale(ctx: Ctx, input: Input) {
  const { settings, interState } = await loadContext(ctx, input);
  const lines = await priceLines(ctx, input);
  const b = bill(settings, lines, input.billDiscount, interState);
  return { ...totals(b), interState, lines: b.lines.map((l, i) => ({ variantId: lines[i].hit.variantId, unitPrice: lines[i].unitPrice, total: l.total, tax: l.tax })) };
}

export async function holdSale(ctx: Ctx, input: Input) {
  const { settings, customer, interState } = await loadContext(ctx, input);
  const lines = await priceLines(ctx, input);
  const b = bill(settings, lines, input.billDiscount, interState);
  const doc = {
    orgId: ctx.orgId, kind: input.kind, status: "held" as const, locationId: input.locationId, customerId: customer?._id ?? null,
    customer: customerSnapshot(customer), interState, lines: saleLines(lines, b), billDiscount: input.billDiscount, ...totals(b),
    cashierId: ctx.userId, cashierName: ctx.userName, notes: input.notes,
  };
  if (input.heldId) {
    const r = await Sale.updateOne({ orgId: ctx.orgId, _id: input.heldId, status: "held" }, { $set: doc });
    if (r.matchedCount) return { saleId: input.heldId };
  }
  const s = await Sale.create(doc);
  return { saleId: String(s._id) };
}

export async function deleteHeld(ctx: Ctx, id: string) {
  await Sale.deleteOne({ orgId: ctx.orgId, _id: id, status: "held" });
}

export async function returnSale(ctx: Ctx, saleId: string, items: { lineIndex: number; qty: number; serials?: string[] }[], refundMethod: "cash" | "card" | "upi" | "credit" | "other", reason: string) {
  return inTransaction(async (session) => {
    const sale = await Sale.findOne({ orgId: ctx.orgId, _id: saleId, status: "completed", kind: { $ne: "return" } }, null, { session }).lean<SaleDoc>();
    if (!sale) throw new AppError("NOT_FOUND", "Sale not found");
    if (refundMethod === "credit" && !sale.customerId) throw new AppError("INVALID", "Refund to account needs a customer on the sale.");
    const settings = await OrgSettings.findOne({ orgId: ctx.orgId }, null, { session }).lean<OrgSettingsDoc>();

    const lines = items.filter((i) => i.qty > 0).map((i) => {
      const l = sale.lines[i.lineIndex];
      if (!l) throw new AppError("INVALID", "Invalid line");
      if (i.qty > l.qty! - (l.returnedQty ?? 0)) throw new AppError("INVALID", `Only ${(l.qty! - (l.returnedQty ?? 0)) / (l.scale ?? 1)} of ${l.name} can be returned.`);
      const f = (v?: number | null) => Math.round(((v ?? 0) * i.qty) / l.qty!);
      let serials: string[] = [];
      if (l.serials?.length) {
        serials = cleanSerials(i.serials, i.qty, l.name ?? "Item");
        const sold = new Set(l.serials);
        const stray = serials.find((x) => !sold.has(x));
        if (stray) throw new AppError("INVALID", `Serial ${stray} is not on this bill.`);
      }
      return { ...l, serials, qty: i.qty, discount: f(l.discount), taxable: f(l.taxable), cgst: f(l.cgst), sgst: f(l.sgst), igst: f(l.igst), vat: f(l.vat), cess: f(l.cess), total: f(l.total), returnedQty: 0, sourceLine: i.lineIndex };
    });
    if (!lines.length) throw new AppError("INVALID", "Choose at least one item to return.");

    const sum = (k: "discount" | "taxable" | "cgst" | "sgst" | "igst" | "vat" | "cess" | "total") => lines.reduce((a, l) => a + (l[k] ?? 0), 0);
    const raw = sum("total");
    const grandTotal = settings?.roundOff ? Math.round(raw / 100) * 100 : raw;
    const { number } = await nextNumber(ctx, "return", session);
    const [ret] = await Sale.create(
      [{
        orgId: ctx.orgId, number, kind: "return", status: "completed", locationId: sale.locationId, customerId: sale.customerId, customer: sale.customer,
        interState: sale.interState, lines, billDiscount: 0, subtotal: lines.reduce((a, l) => a + Math.round((l.unitPrice! * l.qty) / (l.scale ?? 1)), 0),
        discountTotal: sum("discount"), taxableTotal: sum("taxable"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), vat: sum("vat"), cess: sum("cess"),
        taxTotal: sum("cgst") + sum("sgst") + sum("igst") + sum("vat") + sum("cess"), roundOff: grandTotal - raw, grandTotal,
        payments: [{ method: refundMethod, amount: grandTotal }], amountPaid: refundMethod === "credit" ? 0 : grandTotal, change: 0, balanceDue: 0,
        returnOf: sale._id, returnOfNumber: sale.number, cashierId: ctx.userId, cashierName: ctx.userName, notes: reason, completedAt: new Date(),
      }],
      { session },
    );
    await Sale.updateOne({ orgId: ctx.orgId, _id: sale._id }, { $inc: Object.fromEntries(lines.map((l) => [`lines.${l.sourceLine}.returnedQty`, l.qty])) }, { session });
    await applyMoves(
      ctx,
      lines.map((l) => ({ productId: String(l.productId), variantId: String(l.variantId), locationId: String(sale.locationId), batchId: l.batchId ? String(l.batchId) : null, qtyDelta: l.qty, unitCost: l.unitCost ?? 0, type: "sale_return" as const, ref: { kind: "return", id: String(ret._id), number } })),
      session,
    );
    for (const l of lines.filter((x) => x.serials.length)) {
      await restoreSerials(ctx, { variantId: String(l.variantId), locationId: String(sale.locationId), serials: l.serials, saleId: String(sale._id), event: "returned by customer", ref: number }, session);
    }
    // Credited to the account: it first clears what is still due on this bill, so bill dues match the khata.
    const offDue = refundMethod === "credit" ? Math.min(grandTotal, sale.balanceDue ?? 0) : 0;
    if (offDue > 0) await Sale.updateOne({ orgId: ctx.orgId, _id: sale._id }, { $inc: { balanceDue: -offDue } }, { session });
    if (refundMethod === "credit" && sale.customerId) await postLedger(ctx, { partyId: sale.customerId, kind: "return", delta: -grandTotal, docKind: "sale", docId: ret._id, number, note: `Return against ${sale.number}` }, session);
    await audit(ctx, "return", "sale", String(ret._id), `Return ${number} against ${sale.number}`, { reason }, session);
    return { saleId: String(ret._id), number };
  });
}

export async function voidSale(ctx: Ctx, saleId: string, reason: string) {
  return inTransaction(async (session) => {
    const sale = await Sale.findOne({ orgId: ctx.orgId, _id: saleId, status: "completed", kind: { $ne: "return" } }, null, { session }).lean<SaleDoc>();
    if (!sale) throw new AppError("NOT_FOUND", "Sale not found");
    if (sale.lines.some((l) => (l.returnedQty ?? 0) > 0)) throw new AppError("CONFLICT", "This sale has returns and can't be voided.");
    const settings = await OrgSettings.findOne({ orgId: ctx.orgId }, null, { session }).lean<OrgSettingsDoc>();
    const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: settings?.timezone ?? "UTC" });
    if (!sale.completedAt || day(sale.completedAt) !== day(new Date())) throw new AppError("CONFLICT", "Only today's sales can be voided. Use a return instead.");
    await Sale.updateOne({ orgId: ctx.orgId, _id: sale._id }, { $set: { status: "void", voidReason: reason } }, { session });
    await applyMoves(
      ctx,
      sale.lines.map((l) => ({ productId: String(l.productId), variantId: String(l.variantId), locationId: String(sale.locationId), batchId: l.batchId ? String(l.batchId) : null, qtyDelta: l.qty!, unitCost: l.unitCost ?? 0, type: "void" as const, ref: { kind: "sale", id: String(sale._id), number: sale.number ?? undefined } })),
      session,
    );
    for (const l of sale.lines.filter((x) => x.serials?.length)) {
      await restoreSerials(ctx, { variantId: String(l.variantId), locationId: String(sale.locationId), serials: l.serials, saleId: String(sale._id), event: "sale voided", ref: sale.number ?? "" }, session);
    }
    if (sale.customerId && (sale.balanceDue ?? 0) > 0) await postLedger(ctx, { partyId: sale.customerId, kind: "sale_void", delta: -(sale.balanceDue ?? 0), docKind: "sale", docId: sale._id, number: sale.number ?? "", note: `Bill voided: ${reason}` }, session);
    await audit(ctx, "void", "sale", saleId, `Voided ${sale.number}`, { reason }, session);
  });
}
