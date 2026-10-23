"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { billMessage } from "@/lib/bill-message";
import { objectId, partyInput, saleInput } from "@/lib/schemas";
import { billUrl } from "../bill-link";
import { Party, Sale } from "../models";
import { batchesFor } from "../services/inventory";
import { saveParty } from "../services/parties";
import { getVariantHits } from "../services/products";
import { getReceiptData } from "../services/receipt";
import { completeSale, deleteHeld, holdSale, returnSale, voidSale } from "../services/sales";
import { closeScanSession, createScanSession } from "../services/scan";
import { AppError } from "../context";
import { withAuth } from "../with-auth";

export const checkout = withAuth("pos:sell", saleInput, async (ctx, input) => {
  const res = await completeSale(ctx, input);
  revalidatePath("/sales");
  return res;
});

export const holdBill = withAuth("pos:sell", saleInput, (ctx, input) => holdSale(ctx, input));

export const listHeldBills = withAuth("pos:sell", z.object({ locationId: objectId }).strict(), async (ctx, { locationId }) =>
  (await Sale.find({ orgId: ctx.orgId, status: "held", locationId }, { grandTotal: 1, customer: 1, lines: 1, updatedAt: 1, cashierName: 1 }).sort({ updatedAt: -1 }).limit(50).lean()).map((h) => ({
    id: String(h._id), total: h.grandTotal ?? 0, customer: h.customer?.name ?? "", items: h.lines.length, at: h.updatedAt.toISOString(), cashier: h.cashierName ?? "",
  })),
);

export const discardHeldBill = withAuth("pos:sell", z.object({ id: objectId }).strict(), async (ctx, { id }) => {
  await deleteHeld(ctx, id);
  return null;
});

export const resumeHeldBill = withAuth("pos:sell", z.object({ id: objectId }).strict(), async (ctx, { id }) => {
  const h = await Sale.findOne({ orgId: ctx.orgId, _id: id, status: "held" }).lean();
  if (!h) throw new AppError("NOT_FOUND", "That bill was already completed or deleted.");
  const hits = await getVariantHits(ctx, h.lines.map((l) => String(l.variantId)), String(h.locationId));
  const customer = h.customerId ? await Party.findOne({ orgId: ctx.orgId, _id: h.customerId }, { name: 1, phone: 1, stateCode: 1, taxId: 1, balance: 1 }).lean() : null;
  return {
    id: String(h._id),
    kind: h.kind === "tax_invoice" ? ("tax_invoice" as const) : ("receipt" as const),
    billDiscount: h.billDiscount ?? 0,
    notes: h.notes ?? "",
    customer: customer ? { id: String(customer._id), name: customer.name, phone: customer.phone, stateCode: customer.stateCode, taxId: customer.taxId, balance: customer.balance } : null,
    lines: h.lines
      .map((l) => ({ hit: hits.find((x) => x.variantId === String(l.variantId)), qty: l.qty, discount: l.discount ?? 0, unitPrice: l.unitPrice ?? 0, serials: l.serials ?? [] }))
      .filter((l) => l.hit),
  };
});

export const refundSale = withAuth(
  "sales:return",
  z.object({ saleId: objectId, items: z.array(z.object({ lineIndex: z.number().int().min(0), qty: z.number().int().min(0), serials: z.array(z.string().trim().min(1).max(64)).max(500).optional() }).strict()).min(1).max(500), refundMethod: z.enum(["cash", "card", "upi", "credit", "other"]), reason: z.string().trim().max(300) }).strict(),
  async (ctx, i) => {
    const res = await returnSale(ctx, i.saleId, i.items, i.refundMethod, i.reason);
    revalidatePath("/sales");
    return res;
  },
);

export const cancelSale = withAuth("sales:void", z.object({ saleId: objectId, reason: z.string().trim().min(3, "Enter a reason").max(300) }).strict(), async (ctx, { saleId, reason }) => {
  await voidSale(ctx, saleId, reason);
  revalidatePath("/sales");
  return null;
});

export const receiptData = withAuth("sales:read", z.object({ saleId: objectId }).strict(), (ctx, { saleId }) => getReceiptData(ctx, saleId));

/** WhatsApp message + public link for a bill, and the customer's phone if there is one. */
export const billShareLink = withAuth("sales:read", z.object({ saleId: objectId }).strict(), async (ctx, { saleId }) => {
  const d = await getReceiptData(ctx, saleId);
  const url = billUrl(ctx.orgId, saleId);
  return { url, text: billMessage(d, url), phone: d.sale.customer?.phone ?? "" };
});

export const findCustomers = withAuth("parties:read", z.object({ q: z.string().max(60) }).strict(), async (ctx, { q }) => {
  const filter: Record<string, unknown> = { orgId: ctx.orgId, kind: "customer", active: true };
  const term = q.trim();
  if (term) {
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { phone: rx }, { taxId: rx }];
  }
  return (await Party.find(filter, { name: 1, phone: 1, stateCode: 1, taxId: 1, balance: 1 }).sort({ name: 1 }).limit(20).lean()).map((c) => ({
    id: String(c._id), name: c.name, phone: c.phone, stateCode: c.stateCode, taxId: c.taxId, balance: c.balance,
  }));
});

export const quickAddCustomer = withAuth("parties:write", partyInput, async (ctx, input) => {
  const r = await saveParty(ctx, null, { ...input, kind: "customer" });
  return { id: r.id, name: input.name, phone: input.phone, stateCode: input.stateCode, taxId: input.taxId, balance: input.openingBalance };
});

export const listBatches = withAuth("pos:sell", z.object({ variantId: objectId, locationId: objectId }).strict(), (ctx, i) => batchesFor(ctx, i.variantId, i.locationId));

export const startRemoteScan = withAuth("products:read", z.object({}).strict(), (ctx) => createScanSession(ctx));
export const stopRemoteScan = withAuth("products:read", z.object({ token: z.string().max(100) }).strict(), async (ctx, { token }) => {
  await closeScanSession(ctx, token);
  return null;
});
