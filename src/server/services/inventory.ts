import "server-only";
import { AppError, type Ctx } from "../context";
import { Batch, Location, OrgSettings, Product, StockLevel, type ProductDoc } from "../models";
import { inTransaction } from "../with-auth";
import { applyMoves } from "./stock";
import { audit } from "./system";

async function variantProducts(ctx: Ctx, variantIds: string[]) {
  const products = await Product.find({ orgId: ctx.orgId, "variants._id": { $in: variantIds } }).lean<ProductDoc[]>();
  return (variantId: string) => {
    const p = products.find((x) => x.variants.some((v) => String(v._id) === variantId));
    const v = p?.variants.find((x) => String(x._id) === variantId);
    if (!p || !v) throw new AppError("INVALID", "One of the items no longer exists.");
    return { p, v };
  };
}

async function assertLocation(ctx: Ctx, id: string) {
  if (!(await Location.exists({ orgId: ctx.orgId, _id: id, active: true }))) throw new AppError("INVALID", "Location not found");
}

/** Positive or negative manual corrections (damage, theft, found stock…). */
export async function adjustStock(ctx: Ctx, input: { locationId: string; reason: string; lines: { variantId: string; batchId: string | null; qtyDelta: number }[] }) {
  await assertLocation(ctx, input.locationId);
  const find = await variantProducts(ctx, input.lines.map((l) => l.variantId));
  return inTransaction(async (session) => {
    const moves = input.lines.map((l) => {
      const { p, v } = find(l.variantId);
      if (p.trackBatch && !l.batchId) throw new AppError("INVALID", `Choose a batch for ${p.name}.`);
      return { productId: String(p._id), variantId: l.variantId, locationId: input.locationId, batchId: l.batchId, qtyDelta: l.qtyDelta, unitCost: v.costPrice ?? 0, type: "adjust" as const, reason: input.reason };
    });
    await applyMoves(ctx, moves, session);
    await audit(ctx, "adjust", "stock", input.locationId, `Stock adjustment: ${input.reason}`, { lines: input.lines.length }, session);
  });
}

export async function transferStock(ctx: Ctx, input: { fromId: string; toId: string; note: string; lines: { variantId: string; batchId: string | null; qty: number }[] }) {
  if (input.fromId === input.toId) throw new AppError("INVALID", "Choose two different locations.");
  await Promise.all([assertLocation(ctx, input.fromId), assertLocation(ctx, input.toId)]);
  const find = await variantProducts(ctx, input.lines.map((l) => l.variantId));
  return inTransaction(async (session) => {
    const ref = { kind: "transfer", id: input.fromId };
    const moves = input.lines.flatMap((l) => {
      const { p, v } = find(l.variantId);
      if (p.trackBatch && !l.batchId) throw new AppError("INVALID", `Choose a batch for ${p.name}.`);
      const base = { productId: String(p._id), variantId: l.variantId, batchId: l.batchId, unitCost: v.costPrice ?? 0, reason: input.note, ref };
      return [
        { ...base, locationId: input.fromId, qtyDelta: -l.qty, type: "transfer_out" as const },
        { ...base, locationId: input.toId, qtyDelta: l.qty, type: "transfer_in" as const },
      ];
    });
    await applyMoves(ctx, moves, session);
    await audit(ctx, "transfer", "stock", input.fromId, `Transferred ${input.lines.length} item(s)`, { to: input.toId }, session);
  });
}

/** Sets counted quantities; the difference is posted as a "count" movement. */
export async function postStockCount(ctx: Ctx, input: { locationId: string; lines: { variantId: string; batchId: string | null; counted: number }[] }) {
  await assertLocation(ctx, input.locationId);
  const find = await variantProducts(ctx, input.lines.map((l) => l.variantId));
  return inTransaction(async (session) => {
    const settings = await OrgSettings.findOne({ orgId: ctx.orgId }, null, { session }).lean();
    const moves = [];
    for (const l of input.lines) {
      const { p, v } = find(l.variantId);
      const level = await StockLevel.findOne({ orgId: ctx.orgId, locationId: input.locationId, variantId: l.variantId, batchId: l.batchId }, null, { session }).lean();
      const delta = l.counted - (level?.qty ?? 0);
      if (delta) moves.push({ productId: String(p._id), variantId: l.variantId, locationId: input.locationId, batchId: l.batchId, qtyDelta: delta, unitCost: v.costPrice ?? 0, type: "count" as const, reason: "Stock count" });
    }
    await applyMoves(ctx, moves, session, { allowNegative: settings?.allowNegativeStock });
    await audit(ctx, "count", "stock", input.locationId, `Stock count posted (${moves.length} changes)`, undefined, session);
    return { changed: moves.length };
  });
}

export async function batchesFor(ctx: Ctx, variantId: string, locationId: string) {
  const levels = await StockLevel.find({ orgId: ctx.orgId, variantId, locationId, batchId: { $ne: null } }).lean();
  const batches = await Batch.find({ orgId: ctx.orgId, variantId }).sort({ expiry: 1 }).lean();
  return batches.map((b) => ({
    id: String(b._id),
    batchNo: b.batchNo,
    expiry: b.expiry ? b.expiry.toISOString().slice(0, 10) : null,
    qty: levels.find((l) => String(l.batchId) === String(b._id))?.qty ?? 0,
  }));
}
