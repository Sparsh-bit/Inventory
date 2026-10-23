import "server-only";
import type { ClientSession } from "mongoose";
import { MAX_ATTACHMENTS, purchaseLineValue } from "@/lib/purchase";
import { AppError, type Ctx } from "../context";
import { Batch, Location, Party, Product, PurchaseOrder, TaxRate, Types, type ProductDoc } from "../models";
import { inTransaction } from "../with-auth";
import { cleanSerials, moveOutSerials, receiveSerials } from "./serials";
import { postLedger } from "./ledger";
import { entryDate, payIn } from "./parties";
import { applyMoves } from "./stock";
import { audit, nextNumber } from "./system";

export interface PoInput {
  supplierId: string;
  locationId: string;
  expectedDate: string | null;
  supplierInvoiceNo: string;
  notes: string;
  lines: { variantId: string; qty: number; unitCost: number }[];
}

const lineValue = purchaseLineValue;

async function buildLines(ctx: Ctx, lines: PoInput["lines"]) {
  const products = await Product.find({ orgId: ctx.orgId, "variants._id": { $in: lines.map((l) => l.variantId) } }).lean<ProductDoc[]>();
  const rates = new Map((await TaxRate.find({ orgId: ctx.orgId }).lean()).map((r) => [String(r._id), r.rateBp + (r.cessBp ?? 0)]));
  return lines.map((l) => {
    const p = products.find((x) => x.variants.some((v) => String(v._id) === l.variantId));
    const v = p?.variants.find((x) => String(x._id) === l.variantId);
    if (!p || !v) throw new AppError("INVALID", "One of the items no longer exists.");
    return {
      productId: p._id, variantId: v._id, name: [p.name, v.name].filter(Boolean).join(" - "), sku: v.sku,
      qtyOrdered: l.qty, unitCost: l.unitCost, rateBp: p.taxRateId ? (rates.get(String(p.taxRateId)) ?? 0) : 0, scale: p.unit?.scale ?? 1,
    };
  });
}

export async function savePurchaseOrder(ctx: Ctx, id: string | null, input: PoInput) {
  const [supplier, location] = await Promise.all([
    Party.findOne({ orgId: ctx.orgId, _id: input.supplierId, kind: "supplier" }).lean(),
    Location.findOne({ orgId: ctx.orgId, _id: input.locationId }).lean(),
  ]);
  if (!supplier) throw new AppError("INVALID", "Supplier not found");
  if (!location) throw new AppError("INVALID", "Location not found");
  const lines = await buildLines(ctx, input.lines);
  const fields = { supplierId: supplier._id, supplierName: supplier.name, locationId: location._id, expectedDate: input.expectedDate ? new Date(input.expectedDate) : null, supplierInvoiceNo: input.supplierInvoiceNo, notes: input.notes };

  if (id) {
    const po = await PurchaseOrder.findOne({ orgId: ctx.orgId, _id: id });
    if (!po) throw new AppError("NOT_FOUND", "Purchase order not found");
    if (!["draft", "ordered"].includes(po.status)) throw new AppError("CONFLICT", "Received orders can't be edited.");
    po.set({ ...fields, lines });
    await po.save();
    await audit(ctx, "update", "purchase", id, `Updated ${po.number}`);
    return { id };
  }
  return inTransaction(async (session) => {
    const { number } = await nextNumber(ctx, "purchase", session);
    const [po] = await PurchaseOrder.create([{ orgId: ctx.orgId, number, status: "ordered", ...fields, lines, createdBy: ctx.userId }], { session });
    await audit(ctx, "create", "purchase", String(po._id), `Created ${number}`, undefined, session);
    return { id: String(po._id) };
  });
}

export interface ReceiveLine {
  lineId: string;
  qty: number;
  batchNo?: string;
  expiry?: string | null;
  unitCost?: number;
  serials?: string[];
}

export async function receivePurchase(ctx: Ctx, poId: string, input: ReceiveLine[]) {
  return inTransaction((session) => receiveIn(ctx, poId, input, session));
}

async function receiveIn(ctx: Ctx, poId: string, input: ReceiveLine[], session: ClientSession) {
  {
    const po = await PurchaseOrder.findOne({ orgId: ctx.orgId, _id: poId }, null, { session });
    if (!po) throw new AppError("NOT_FOUND", "Purchase order not found");
    if (!["ordered", "partial", "draft"].includes(po.status)) throw new AppError("CONFLICT", "This order is already closed.");
    const products = await Product.find({ orgId: ctx.orgId, _id: { $in: po.lines.map((l) => l.productId) } }, null, { session });
    const moves = [];
    let value = 0;
    const receiptLines = [];
    const serialJobs: { productId: string; variantId: string; serials: string[] }[] = [];
    for (const r of input.filter((x) => x.qty > 0)) {
      const line = po.lines.id(r.lineId);
      if (!line) throw new AppError("INVALID", "Invalid order line");
      const product = products.find((p) => String(p._id) === String(line.productId));
      if (!product) throw new AppError("INVALID", `${line.name} no longer exists.`);
      const left = line.qtyOrdered - line.qtyReceived;
      if (r.qty > left) throw new AppError("INVALID", `${line.name}: only ${left / (line.scale ?? 1)} left to receive on this order. Record any extra items as a new purchase.`);
      if (r.unitCost !== undefined) line.unitCost = r.unitCost;
      let batchId: Types.ObjectId | null = null;
      if (product.trackBatch) {
        if (!r.batchNo) throw new AppError("INVALID", `Enter a batch number for ${line.name}.`);
        const b = await Batch.findOneAndUpdate(
          { orgId: ctx.orgId, variantId: line.variantId, batchNo: r.batchNo },
          { $setOnInsert: { productId: line.productId, expiry: r.expiry ? new Date(r.expiry) : null }, $set: { costPrice: line.unitCost } },
          { upsert: true, returnDocument: "after", session },
        );
        batchId = b!._id;
      }
      if (product.trackSerial) serialJobs.push({ productId: String(line.productId), variantId: String(line.variantId), serials: cleanSerials(r.serials, r.qty, line.name ?? "Item") });
      line.qtyReceived += r.qty;
      value += lineValue(r.qty, line.unitCost, line.scale ?? 1, line.rateBp ?? 0);
      receiptLines.push({ lineId: line._id, qty: r.qty, batchNo: r.batchNo, expiry: r.expiry ? new Date(r.expiry) : undefined });
      moves.push({ productId: String(line.productId), variantId: String(line.variantId), locationId: String(po.locationId), batchId: batchId ? String(batchId) : null, qtyDelta: r.qty, unitCost: line.unitCost, type: "purchase" as const, ref: { kind: "purchase", id: poId, number: po.number } });
      const v = product.variants.id(line.variantId);
      if (v) v.costPrice = line.unitCost;
    }
    if (!moves.length) throw new AppError("INVALID", "Enter the quantity received for at least one item.");
    po.receipts.push({ at: new Date(), userId: ctx.userId, lines: receiptLines });
    po.receivedValue += value;
    po.status = po.lines.every((l) => l.qtyReceived >= l.qtyOrdered) ? "received" : "partial";
    await po.save({ session });
    for (const p of products) if (p.isModified()) await p.save({ session });
    await applyMoves(ctx, moves, session);
    for (const j of serialJobs) await receiveSerials(ctx, { ...j, locationId: String(po.locationId), purchaseId: poId, event: "received", ref: po.number }, session);
    const items = receiptLines.map((r) => `${po.lines.find((l) => String(l._id) === String(r.lineId))?.name ?? "Item"} × ${r.qty / (po.lines.find((l) => String(l._id) === String(r.lineId))?.scale ?? 1)}`);
    await postLedger(ctx, { partyId: po.supplierId, kind: "purchase", delta: value, date: po.billDate ?? undefined, docKind: "purchase", docId: po._id, number: po.number, note: [po.supplierInvoiceNo && `Bill ${po.supplierInvoiceNo}`, items.join(", ")].filter(Boolean).join(" · ") }, session);
    await audit(ctx, "receive", "purchase", poId, `Received goods on ${po.number}`, undefined, session);
    return { status: po.status };
  }
}

export async function returnPurchase(ctx: Ctx, poId: string, input: { lineId: string; qty: number; batchNo?: string; serials?: string[] }[]) {
  return inTransaction(async (session) => {
    const po = await PurchaseOrder.findOne({ orgId: ctx.orgId, _id: poId }, null, { session });
    if (!po) throw new AppError("NOT_FOUND", "Purchase order not found");
    const tracked = await Product.find({ orgId: ctx.orgId, _id: { $in: po.lines.map((l) => l.productId) }, $or: [{ trackSerial: true }, { trackBatch: true }] }, { trackSerial: 1, trackBatch: 1 }, { session }).lean();
    const serialProducts = new Set(tracked.filter((p) => p.trackSerial).map((p) => String(p._id)));
    const batchProducts = new Set(tracked.filter((p) => p.trackBatch).map((p) => String(p._id)));
    const moves = [];
    let value = 0;
    for (const r of input.filter((x) => x.qty > 0)) {
      const line = po.lines.id(r.lineId);
      if (!line) throw new AppError("INVALID", "Invalid order line");
      if (r.qty > line.qtyReceived - line.qtyReturned) throw new AppError("INVALID", `You can return at most ${(line.qtyReceived - line.qtyReturned) / (line.scale ?? 1)} of ${line.name}.`);
      let batchId: string | null = null;
      if (batchProducts.has(String(line.productId)) && !r.batchNo) throw new AppError("INVALID", `Enter the batch number of the ${line.name} you are returning.`);
      if (r.batchNo) {
        const b = await Batch.findOne({ orgId: ctx.orgId, variantId: line.variantId, batchNo: r.batchNo }, null, { session });
        if (!b) throw new AppError("INVALID", `Batch ${r.batchNo} not found for ${line.name}.`);
        batchId = String(b._id);
      }
      if (serialProducts.has(String(line.productId))) {
        const serials = cleanSerials(r.serials, r.qty, line.name ?? "Item");
        await moveOutSerials(ctx, { variantId: String(line.variantId), locationId: String(po.locationId), serials, to: { status: "returned" }, event: "returned to supplier", ref: po.number }, session);
      }
      line.qtyReturned += r.qty;
      value += lineValue(r.qty, line.unitCost, line.scale ?? 1, line.rateBp ?? 0);
      moves.push({ productId: String(line.productId), variantId: String(line.variantId), locationId: String(po.locationId), batchId, qtyDelta: -r.qty, unitCost: line.unitCost, type: "purchase_return" as const, ref: { kind: "purchase", id: poId, number: po.number } });
    }
    if (!moves.length) throw new AppError("INVALID", "Enter a quantity to return.");
    po.returnedValue += value;
    await po.save({ session });
    await applyMoves(ctx, moves, session);
    await postLedger(ctx, { partyId: po.supplierId, kind: "purchase_return", delta: -value, docKind: "purchase", docId: po._id, number: po.number, note: "Goods returned to supplier" }, session);
    await audit(ctx, "return", "purchase", poId, `Returned goods on ${po.number}`, undefined, session);
  });
}

export async function cancelPurchase(ctx: Ctx, poId: string) {
  const r = await PurchaseOrder.updateOne({ orgId: ctx.orgId, _id: poId, status: { $in: ["draft", "ordered"] } }, { $set: { status: "cancelled" } });
  if (!r.matchedCount) throw new AppError("CONFLICT", "Only orders with nothing received can be cancelled.");
  await audit(ctx, "cancel", "purchase", poId, "Cancelled purchase order");
}

export interface Attachment {
  url: string;
  name: string;
  type: "png" | "jpg" | "webp" | "pdf";
  size: number;
}

export interface PurchaseBillInput extends PoInput {
  billDate: string | null;
  lines: (PoInput["lines"][number] & { batchNo?: string; expiry?: string | null; serials?: string[] })[];
  /** "full" pays the whole bill; a number pays that much now; null records it as unpaid. */
  paid: { amount: number | "full"; method: "cash" | "card" | "upi" | "bank" | "other"; reference: string } | null;
  attachments: Attachment[];
}

/**
 * A supplier bill entered in one step: the goods are received into stock, the bill goes on the
 * supplier's khata and anything paid now is set against it. All or nothing, in one transaction.
 */
export async function createPurchaseBill(ctx: Ctx, input: PurchaseBillInput) {
  const billDate = input.billDate ? await entryDate(ctx, input.billDate) : new Date();
  return inTransaction(async (session) => {
    // Sequential: queries in one transaction session can't run in parallel.
    const supplier = await Party.findOne({ orgId: ctx.orgId, _id: input.supplierId, kind: "supplier" }, null, { session }).lean();
    const location = await Location.findOne({ orgId: ctx.orgId, _id: input.locationId }, null, { session }).lean();
    if (!supplier) throw new AppError("INVALID", "Supplier not found");
    if (!location) throw new AppError("INVALID", "Location not found");
    const lines = await buildLines(ctx, input.lines);
    const { number } = await nextNumber(ctx, "purchase", session);
    const [po] = await PurchaseOrder.create(
      [{
        orgId: ctx.orgId, number, status: "ordered", supplierId: supplier._id, supplierName: supplier.name, locationId: location._id, expectedDate: null,
        supplierInvoiceNo: input.supplierInvoiceNo, billDate, notes: input.notes, lines, createdBy: ctx.userId,
        attachments: input.attachments.map((a) => ({ ...a, at: new Date(), userId: ctx.userId })),
      }],
      { session },
    );
    await audit(ctx, "create", "purchase", String(po._id), `Purchase bill ${number}${input.supplierInvoiceNo ? ` (supplier bill ${input.supplierInvoiceNo})` : ""}`, undefined, session);
    await receiveIn(
      ctx,
      String(po._id),
      po.lines.map((l, i) => ({ lineId: String(l._id), qty: l.qtyOrdered, batchNo: input.lines[i].batchNo, expiry: input.lines[i].expiry ?? null, serials: input.lines[i].serials })),
      session,
    );
    let paid = 0;
    if (input.paid) {
      const fresh = await PurchaseOrder.findOne({ orgId: ctx.orgId, _id: po._id }, { receivedValue: 1, amountPaid: 1 }, { session }).lean();
      const due = fresh!.receivedValue - fresh!.amountPaid;
      paid = input.paid.amount === "full" ? due : input.paid.amount;
      if (paid > due) throw new AppError("INVALID", `The bill comes to ${(due / 100).toFixed(2)}; you can't pay more than that against it.`);
      if (paid > 0) {
        await payIn(ctx, { partyId: String(supplier._id), amount: paid, method: input.paid.method, reference: input.paid.reference, note: "Paid with the bill", allocations: [{ docId: String(po._id), amount: paid }] }, billDate, session);
      }
    }
    return { id: String(po._id), number, paid };
  });
}

export async function addAttachments(ctx: Ctx, poId: string, files: Attachment[]) {
  const po = await PurchaseOrder.findOne({ orgId: ctx.orgId, _id: poId }, { attachments: 1, number: 1 });
  if (!po) throw new AppError("NOT_FOUND", "Purchase not found");
  if (po.attachments.length + files.length > MAX_ATTACHMENTS) throw new AppError("INVALID", `A purchase can have up to ${MAX_ATTACHMENTS} files.`);
  const r = await PurchaseOrder.updateOne(
    { orgId: ctx.orgId, _id: poId, [`attachments.${MAX_ATTACHMENTS - files.length}`]: { $exists: false } },
    { $push: { attachments: { $each: files.map((f) => ({ ...f, at: new Date(), userId: ctx.userId })) } } },
  );
  if (!r.matchedCount) throw new AppError("INVALID", `A purchase can have up to ${MAX_ATTACHMENTS} files.`);
  await audit(ctx, "attach", "purchase", poId, `Attached ${files.length} file(s) to ${po.number}`);
}

export async function removeAttachment(ctx: Ctx, poId: string, url: string) {
  const r = await PurchaseOrder.updateOne({ orgId: ctx.orgId, _id: poId }, { $pull: { attachments: { url } } });
  if (!r.matchedCount) throw new AppError("NOT_FOUND", "Purchase not found");
  await audit(ctx, "detach", "purchase", poId, "Removed an attached file", { url });
}
