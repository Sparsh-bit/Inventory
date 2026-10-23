import "server-only";
import type { PipelineStage } from "mongoose";
import type { Ctx } from "../context";
import { Batch, LedgerEntry, Party, Product, Sale, StockLevel, Types } from "../models";

/** Midnight of `date` in `tz`, as a UTC instant. */
export function startOfDay(tz: string, date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = Math.round((asUtc - date.getTime()) / 60000) * 60000;
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")) - offset);
}

/** Parses yyyy-mm-dd range in the business timezone; defaults to the current month. */
export function parseRange(tz: string, from?: string, to?: string) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const today = startOfDay(tz);
  const localToday = new Date(today.getTime() + 12 * 3600e3).toLocaleDateString("en-CA", { timeZone: tz });
  const f = from && re.test(from) ? from : `${localToday.slice(0, 8)}01`;
  const t = to && re.test(to) ? to : localToday;
  const start = startOfDay(tz, new Date(`${f}T12:00:00Z`));
  const end = new Date(startOfDay(tz, new Date(`${t}T12:00:00Z`)).getTime() + 86400e3);
  return { from: f, to: t, start, end, today: localToday };
}

const oid = (s: string) => new Types.ObjectId(s);
const SALE_KINDS = ["receipt", "tax_invoice"];

function salesMatch(ctx: Ctx, start: Date, end: Date, kinds = SALE_KINDS, locationId?: string) {
  const m: Record<string, unknown> = { orgId: oid(ctx.orgId), status: "completed", kind: { $in: kinds }, completedAt: { $gte: start, $lt: end } };
  if (locationId) m.locationId = oid(locationId);
  return { $match: m };
}

const lineProfit = { $subtract: ["$lines.taxable", { $round: [{ $divide: [{ $multiply: ["$lines.unitCost", "$lines.qty"] }, { $ifNull: ["$lines.scale", 1] }] }, 0] }] };

export async function salesTotals(ctx: Ctx, start: Date, end: Date, locationId?: string) {
  const [sales] = await Sale.aggregate([
    salesMatch(ctx, start, end, SALE_KINDS, locationId),
    { $group: { _id: null, revenue: { $sum: "$grandTotal" }, tax: { $sum: "$taxTotal" }, taxable: { $sum: "$taxableTotal" }, count: { $sum: 1 }, due: { $sum: "$balanceDue" } } },
  ]);
  const [returns] = await Sale.aggregate([
    salesMatch(ctx, start, end, ["return"], locationId),
    { $group: { _id: null, total: { $sum: "$grandTotal" }, taxable: { $sum: "$taxableTotal" }, count: { $sum: 1 } } },
  ]);
  const profit = async (kinds: string[]) =>
    (await Sale.aggregate([salesMatch(ctx, start, end, kinds, locationId), { $unwind: "$lines" }, { $group: { _id: null, p: { $sum: lineProfit } } }]))[0]?.p ?? 0;
  const [pSales, pReturns] = await Promise.all([profit(SALE_KINDS), profit(["return"])]);
  const revenue = sales?.revenue ?? 0;
  const count = sales?.count ?? 0;
  return {
    revenue, count, tax: sales?.tax ?? 0, avgBill: count ? Math.round(revenue / count) : 0, creditGiven: sales?.due ?? 0,
    returns: returns?.total ?? 0, returnCount: returns?.count ?? 0, net: revenue - (returns?.total ?? 0), grossProfit: pSales - pReturns,
  };
}

export async function salesByDay(ctx: Ctx, tz: string, start: Date, end: Date) {
  const rows = await Sale.aggregate<{ _id: string; revenue: number; count: number }>([
    salesMatch(ctx, start, end),
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: tz } }, revenue: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const map = new Map(rows.map((r) => [r._id, r]));
  const out: { date: string; revenue: number; count: number }[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += 86400e3) {
    const d = new Date(t + 12 * 3600e3).toLocaleDateString("en-CA", { timeZone: tz });
    if (out.at(-1)?.date === d) continue;
    out.push({ date: d, revenue: map.get(d)?.revenue ?? 0, count: map.get(d)?.count ?? 0 });
  }
  return out;
}

export async function salesByProduct(ctx: Ctx, start: Date, end: Date, limit = 50) {
  return Sale.aggregate<{ _id: string; name: string; sku: string; qty: number; scale: number; revenue: number; profit: number }>([
    salesMatch(ctx, start, end),
    { $unwind: "$lines" },
    { $group: { _id: "$lines.variantId", name: { $first: "$lines.name" }, sku: { $first: "$lines.sku" }, scale: { $first: "$lines.scale" }, qty: { $sum: "$lines.qty" }, revenue: { $sum: "$lines.total" }, profit: { $sum: lineProfit } } },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
}

export async function salesByPayment(ctx: Ctx, start: Date, end: Date) {
  return Sale.aggregate<{ _id: string; amount: number; count: number }>([
    salesMatch(ctx, start, end),
    { $unwind: "$payments" },
    { $group: { _id: "$payments.method", amount: { $sum: "$payments.amount" }, count: { $sum: 1 } } },
    { $sort: { amount: -1 } },
  ]);
}

export async function salesByCashier(ctx: Ctx, start: Date, end: Date) {
  return Sale.aggregate<{ _id: string; name: string; revenue: number; count: number }>([
    salesMatch(ctx, start, end),
    { $group: { _id: "$cashierId", name: { $first: "$cashierName" }, revenue: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
    { $sort: { revenue: -1 } },
  ]);
}

export async function salesByCategory(ctx: Ctx, start: Date, end: Date) {
  return Sale.aggregate<{ _id: string | null; name: string | null; revenue: number; qty: number }>([
    salesMatch(ctx, start, end),
    { $unwind: "$lines" },
    { $group: { _id: "$lines.productId", revenue: { $sum: "$lines.total" }, qty: { $sum: "$lines.qty" } } },
    { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "p", pipeline: [{ $project: { categoryId: 1 } }] } },
    { $group: { _id: { $first: "$p.categoryId" }, revenue: { $sum: "$revenue" }, qty: { $sum: "$qty" } } },
    { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "c", pipeline: [{ $project: { name: 1 } }] } },
    { $project: { revenue: 1, qty: 1, name: { $first: "$c.name" } } },
    { $sort: { revenue: -1 } },
  ]);
}

/** GST: HSN-wise and rate-wise summaries, B2B vs B2C, net of returns. */
export async function gstSummary(ctx: Ctx, start: Date, end: Date) {
  const base: PipelineStage[] = [
    salesMatch(ctx, start, end, [...SALE_KINDS, "return"]),
    { $unwind: "$lines" },
    { $addFields: { sign: { $cond: [{ $eq: ["$kind", "return"] }, -1, 1] }, b2b: { $gt: [{ $strLenCP: { $ifNull: ["$customer.taxId", ""] } }, 0] } } },
  ];
  const sum = (f: string) => ({ $sum: { $multiply: [`$lines.${f}`, "$sign"] } });
  const fields = { taxable: sum("taxable"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), cess: sum("cess"), total: sum("total") };
  const [byHsn, byRate, byType] = await Promise.all([
    Sale.aggregate([...base, { $group: { _id: { hsn: "$lines.hsn", rate: "$lines.rateBp" }, qty: { $sum: { $multiply: [{ $divide: ["$lines.qty", { $ifNull: ["$lines.scale", 1] }] }, "$sign"] } }, ...fields } }, { $sort: { "_id.hsn": 1, "_id.rate": 1 } }]),
    Sale.aggregate([...base, { $group: { _id: "$lines.rateBp", ...fields } }, { $sort: { _id: 1 } }]),
    Sale.aggregate([...base, { $group: { _id: "$b2b", ...fields, invoices: { $addToSet: "$_id" } } }, { $project: { taxable: 1, cgst: 1, sgst: 1, igst: 1, cess: 1, total: 1, invoices: { $size: "$invoices" } } }]),
  ]);
  return { byHsn, byRate, byType } as {
    byHsn: { _id: { hsn: string; rate: number }; qty: number; taxable: number; cgst: number; sgst: number; igst: number; cess: number; total: number }[];
    byRate: { _id: number; taxable: number; cgst: number; sgst: number; igst: number; cess: number; total: number }[];
    byType: { _id: boolean; taxable: number; cgst: number; sgst: number; igst: number; cess: number; total: number; invoices: number }[];
  };
}

export async function stockValuation(ctx: Ctx, locationId?: string) {
  const match: Record<string, unknown> = { orgId: oid(ctx.orgId), qty: { $ne: 0 } };
  if (locationId) match.locationId = oid(locationId);
  const rows = await StockLevel.aggregate<{ _id: Types.ObjectId; qty: number; productId: Types.ObjectId }>([
    { $match: match },
    { $group: { _id: "$variantId", qty: { $sum: "$qty" }, productId: { $first: "$productId" } } },
  ]);
  const products = await Product.find({ orgId: ctx.orgId, _id: { $in: [...new Set(rows.map((r) => String(r.productId)))] } }, { name: 1, unit: 1, variants: 1 }).lean();
  const byVariant = new Map(products.flatMap((p) => p.variants.map((v) => [String(v._id), { p, v }] as const)));
  const items = rows
    .map((r) => {
      const hit = byVariant.get(String(r._id));
      if (!hit) return null;
      const scale = hit.p.unit?.scale ?? 1;
      return {
        variantId: String(r._id), name: [hit.p.name, hit.v.name].filter(Boolean).join(" - "), sku: hit.v.sku, qty: r.qty, scale, unit: hit.p.unit?.code ?? "pcs",
        costValue: Math.round(((hit.v.costPrice ?? 0) * r.qty) / scale), saleValue: Math.round((hit.v.salePrice * r.qty) / scale),
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.costValue - a.costValue);
  return { items, costTotal: items.reduce((a, i) => a + i.costValue, 0), saleTotal: items.reduce((a, i) => a + i.saleValue, 0) };
}

export async function lowStock(ctx: Ctx, limit = 100) {
  return Product.aggregate<{ productId: Types.ObjectId; variantId: Types.ObjectId; name: string; variantName: string; sku: string; reorderLevel: number; qty: number; scale: number; unit: string }>([
    { $match: { orgId: oid(ctx.orgId), active: true, reorderLevel: { $gt: 0 } } },
    { $unwind: "$variants" },
    { $match: { "variants.active": true } },
    { $lookup: { from: "stocklevels", let: { v: "$variants._id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$orgId", oid(ctx.orgId)] }, { $eq: ["$variantId", "$$v"] }] } } }, { $group: { _id: null, qty: { $sum: "$qty" } } }], as: "s" } },
    { $project: { productId: "$_id", variantId: "$variants._id", name: 1, variantName: "$variants.name", sku: "$variants.sku", reorderLevel: 1, scale: "$unit.scale", unit: "$unit.code", qty: { $ifNull: [{ $first: "$s.qty" }, 0] } } },
    { $match: { $expr: { $lte: ["$qty", { $multiply: ["$reorderLevel", { $ifNull: ["$scale", 1] }] }] } } },
    { $sort: { qty: 1 } },
    { $limit: limit },
  ]);
}

export async function expiringBatches(ctx: Ctx, withinDays: number) {
  const until = new Date(Date.now() + withinDays * 86400e3);
  const batches = await Batch.find({ orgId: ctx.orgId, expiry: { $ne: null, $lte: until } }).sort({ expiry: 1 }).limit(500).lean();
  if (!batches.length) return [];
  const levels = await StockLevel.aggregate<{ _id: Types.ObjectId; qty: number }>([
    { $match: { orgId: oid(ctx.orgId), batchId: { $in: batches.map((b) => b._id) }, qty: { $gt: 0 } } },
    { $group: { _id: "$batchId", qty: { $sum: "$qty" } } },
  ]);
  const qty = new Map(levels.map((l) => [String(l._id), l.qty]));
  const products = await Product.find({ orgId: ctx.orgId, _id: { $in: batches.map((b) => b.productId) } }, { name: 1, variants: 1, unit: 1 }).lean();
  return batches
    .filter((b) => (qty.get(String(b._id)) ?? 0) > 0)
    .map((b) => {
      const p = products.find((x) => String(x._id) === String(b.productId));
      const v = p?.variants.find((x) => String(x._id) === String(b.variantId));
      return { batchId: String(b._id), batchNo: b.batchNo, expiry: b.expiry!, name: [p?.name, v?.name].filter(Boolean).join(" - "), qty: qty.get(String(b._id)) ?? 0, scale: p?.unit?.scale ?? 1, expired: b.expiry! < new Date() };
    });
}

export async function balances(ctx: Ctx, kind: "customer" | "supplier") {
  const rows = await Party.find({ orgId: ctx.orgId, kind, balance: { $gt: 0 } }, { name: 1, phone: 1, balance: 1 }).sort({ balance: -1 }).limit(200).lean();
  return { rows, total: rows.reduce((a, r) => a + r.balance, 0) };
}

/** Purchases in a period, from the supplier ledger: goods by the date they were received, payments by the date paid. */
export async function purchaseTotals(ctx: Ctx, start: Date, end: Date) {
  const rows = await LedgerEntry.aggregate<{ _id: string; sum: number; docs: unknown[] }>([
    { $match: { orgId: oid(ctx.orgId), date: { $gte: start, $lt: end }, kind: { $in: ["purchase", "purchase_return", "payment", "reversal"] } } },
    { $lookup: { from: Party.collection.name, localField: "partyId", foreignField: "_id", as: "p", pipeline: [{ $project: { kind: 1 } }] } },
    { $match: { "p.kind": "supplier" } },
    { $match: { $or: [{ kind: { $in: ["purchase", "purchase_return"] } }, { docKind: "payment" }] } },
    { $group: { _id: { $cond: [{ $eq: ["$docKind", "payment"] }, "paid", "$kind"] }, sum: { $sum: "$delta" }, docs: { $addToSet: "$docId" } } },
  ]);
  const by = (k: string) => rows.find((r) => r._id === k);
  return { received: by("purchase")?.sum ?? 0, returned: 0 - (by("purchase_return")?.sum ?? 0), paid: 0 - (by("paid")?.sum ?? 0), count: by("purchase")?.docs.length ?? 0 };
}
