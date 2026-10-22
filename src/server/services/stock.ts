import "server-only";
import type { ClientSession } from "mongoose";
import { AppError, type Ctx } from "../context";
import { Batch, Product, StockLevel, StockMove, Types, type MoveType } from "../models";

export interface MoveInput {
  productId: string;
  variantId: string;
  locationId: string;
  batchId?: string | null;
  qtyDelta: number;
  unitCost?: number;
  type: MoveType;
  ref?: { kind: string; id: string; number?: string };
  reason?: string;
}

/**
 * The only way stock changes. Decrements are conditional (`qty >= n`) so concurrent
 * sales can never take the same last unit; callers run this inside a transaction.
 */
export async function applyMoves(ctx: Ctx, moves: MoveInput[], session: ClientSession, opts: { allowNegative?: boolean; flagShort?: boolean } = {}): Promise<string[]> {
  // flagShort: the sale already happened (offline) — record it, but report variants that went short.
  const short: string[] = [];
  for (const m of moves) {
    if (m.qtyDelta === 0) continue;
    const key = { orgId: ctx.orgId, locationId: m.locationId, variantId: m.variantId, batchId: m.batchId ?? null };
    if (m.qtyDelta < 0 && !(opts.allowNegative && !m.batchId)) {
      const res = await StockLevel.updateOne({ ...key, qty: { $gte: -m.qtyDelta } }, { $inc: { qty: m.qtyDelta } }, { session });
      if (res.matchedCount === 0 && opts.flagShort) {
        await StockLevel.updateOne(key, { $inc: { qty: m.qtyDelta }, $setOnInsert: { productId: m.productId } }, { upsert: true, session });
        short.push(m.variantId);
      } else if (res.matchedCount === 0) {
        const level = await StockLevel.findOne(key, { qty: 1 }, { session }).lean();
        const product = await Product.findOne({ orgId: ctx.orgId, "variants._id": m.variantId }, { name: 1, unit: 1, "variants.$": 1 }, { session }).lean();
        const name = product ? [product.name, product.variants[0]?.name].filter(Boolean).join(" ") : "An item";
        const scale = product?.unit?.scale ?? 1;
        throw new AppError("INSUFFICIENT_STOCK", `${name} has only ${(level?.qty ?? 0) / scale} ${product?.unit?.code ?? ""} in stock.`.replace(" .", "."));
      }
    } else {
      await StockLevel.updateOne(key, { $inc: { qty: m.qtyDelta }, $setOnInsert: { productId: m.productId } }, { upsert: true, session });
    }
  }
  const docs = moves
    .filter((m) => m.qtyDelta !== 0)
    .map((m) => ({ ...m, orgId: ctx.orgId, batchId: m.batchId ?? null, unitCost: m.unitCost ?? 0, userId: ctx.userId }));
  if (docs.length) await StockMove.insertMany(docs, { session });
  return short;
}

/** First-expiry-first-out allocation across batches at a location. */
export async function pickBatchesFefo(ctx: Ctx, variantId: string, locationId: string, qty: number, session: ClientSession) {
  const levels = await StockLevel.find({ orgId: ctx.orgId, variantId, locationId, batchId: { $ne: null }, qty: { $gt: 0 } }, null, { session }).lean();
  if (!levels.length) return [];
  const batches = await Batch.find({ orgId: ctx.orgId, _id: { $in: levels.map((l) => l.batchId) } }, null, { session }).lean();
  const expiry = new Map(batches.map((b) => [String(b._id), b.expiry ? b.expiry.getTime() : Number.MAX_SAFE_INTEGER]));
  levels.sort((a, b) => (expiry.get(String(a.batchId)) ?? 0) - (expiry.get(String(b.batchId)) ?? 0));
  const out: { batchId: string; qty: number }[] = [];
  let left = qty;
  for (const l of levels) {
    if (left <= 0) break;
    const take = Math.min(left, l.qty);
    out.push({ batchId: String(l.batchId), qty: take });
    left -= take;
  }
  if (left > 0) out.push({ batchId: out.at(-1)?.batchId ?? String(levels[0].batchId), qty: left }); // will fail the conditional decrement with a clear message
  return mergeBatches(out);
}

function mergeBatches(parts: { batchId: string; qty: number }[]) {
  const m = new Map<string, number>();
  for (const p of parts) m.set(p.batchId, (m.get(p.batchId) ?? 0) + p.qty);
  return [...m].map(([batchId, qty]) => ({ batchId, qty }));
}

export async function stockByVariant(ctx: Ctx, variantIds: string[], locationId?: string) {
  const match: Record<string, unknown> = { orgId: new Types.ObjectId(ctx.orgId), variantId: { $in: variantIds.map((v) => new Types.ObjectId(v)) } };
  if (locationId) match.locationId = new Types.ObjectId(locationId);
  const rows = await StockLevel.aggregate<{ _id: Types.ObjectId; qty: number }>([{ $match: match }, { $group: { _id: "$variantId", qty: { $sum: "$qty" } } }]);
  return new Map(rows.map((r) => [String(r._id), r.qty]));
}
