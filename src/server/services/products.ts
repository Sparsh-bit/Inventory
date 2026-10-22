import "server-only";
import { z } from "zod";
import { makeInternalEan13 } from "@/lib/ean13";
import { productInput } from "@/lib/schemas";
import { AppError, type Ctx } from "../context";
import { Category, Location, Product, TaxRate, Types, type ProductDoc } from "../models";
import { inTransaction } from "../with-auth";
import { findInStockSerial } from "./serials";
import { applyMoves, stockByVariant } from "./stock";
import { audit, nextNumber } from "./system";

type Input = z.output<typeof productInput>;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function prepareVariants(ctx: Ctx, input: Input, session: import("mongoose").ClientSession) {
  const seen = new Set<string>();
  const variants = [];
  for (const v of input.variants) {
    let sku = v.sku;
    let barcodes = [...new Set(v.barcodes)];
    if (!sku || !barcodes.length) {
      const { seq } = await nextNumber(ctx, "barcode", session);
      sku ||= `SKU${String(seq).padStart(6, "0")}`;
      if (!barcodes.length) barcodes = [makeInternalEan13(seq)];
    }
    for (const key of [`sku:${sku}`, ...barcodes.map((b) => `bc:${b}`)]) {
      if (seen.has(key)) throw new AppError("CONFLICT", `Duplicate ${key.startsWith("sku") ? "SKU" : "barcode"} "${key.slice(key.indexOf(":") + 1)}" in this product.`);
      seen.add(key);
    }
    variants.push({ _id: v.id ? new Types.ObjectId(v.id) : new Types.ObjectId(), name: v.name, sku, barcodes, attributes: v.attributes, costPrice: v.costPrice, salePrice: v.salePrice, mrp: v.mrp, active: v.active });
  }
  return variants;
}

async function assertRefs(ctx: Ctx, input: Input) {
  if (input.categoryId && !(await Category.exists({ orgId: ctx.orgId, _id: input.categoryId }))) throw new AppError("INVALID", "Category not found");
  if (input.taxRateId && !(await TaxRate.exists({ orgId: ctx.orgId, _id: input.taxRateId }))) throw new AppError("INVALID", "Tax rate not found");
}

function fields(input: Input) {
  return {
    name: input.name, description: input.description, categoryId: input.categoryId, brand: input.brand,
    unit: { code: input.unitCode, scale: input.unitScale }, hsn: input.hsn, taxRateId: input.taxRateId,
    priceIncludesTax: input.priceIncludesTax, trackBatch: input.trackBatch, trackSerial: input.trackSerial, warrantyMonths: input.warrantyMonths, reorderLevel: input.reorderLevel,
    images: input.images, active: input.active,
  };
}

export async function createProduct(ctx: Ctx, input: Input) {
  await assertRefs(ctx, input);
  return inTransaction(async (session) => {
    const variants = await prepareVariants(ctx, input, session);
    const [p] = await Product.create([{ orgId: ctx.orgId, ...fields(input), variants }], { session });
    const opening = input.variants.map((v, i) => ({ v, id: variants[i]._id })).filter((x) => x.v.openingQty > 0);
    if (opening.length) {
      if (input.trackBatch) throw new AppError("INVALID", "Add opening stock for batch-tracked items through a purchase so batch and expiry are recorded.");
      if (input.trackSerial) throw new AppError("INVALID", "Add stock for serial-numbered items through a purchase or a stock adjustment so each serial is recorded.");
      const loc = input.openingLocationId
        ? await Location.findOne({ orgId: ctx.orgId, _id: input.openingLocationId }, null, { session })
        : await Location.findOne({ orgId: ctx.orgId, isDefault: true }, null, { session });
      if (!loc) throw new AppError("INVALID", "Location not found");
      await applyMoves(
        ctx,
        opening.map(({ v, id }) => ({ productId: String(p._id), variantId: String(id), locationId: String(loc._id), qtyDelta: v.openingQty, unitCost: v.costPrice, type: "opening" as const, ref: { kind: "product", id: String(p._id) } })),
        session,
      );
    }
    await audit(ctx, "create", "product", String(p._id), `Created product ${p.name}`, undefined, session);
    return { id: String(p._id) };
  });
}

export async function updateProduct(ctx: Ctx, id: string, input: Input) {
  await assertRefs(ctx, input);
  return inTransaction(async (session) => {
    const existing = await Product.findOne({ orgId: ctx.orgId, _id: id }, null, { session });
    if (!existing) throw new AppError("NOT_FOUND", "Product not found");
    const keptIds = new Set(input.variants.filter((v) => v.id).map((v) => v.id));
    const removed = existing.variants.filter((v) => !keptIds.has(String(v._id)));
    if (removed.length) {
      const stock = await stockByVariant(ctx, removed.map((v) => String(v._id)));
      if ([...stock.values()].some((q) => q !== 0)) throw new AppError("CONFLICT", "A variant with stock can't be removed. Mark it inactive instead.");
    }
    const variants = await prepareVariants(ctx, input, session);
    if (existing.trackSerial !== input.trackSerial || existing.trackBatch !== input.trackBatch) {
      const stock = await stockByVariant(ctx, existing.variants.map((v) => String(v._id)));
      if ([...stock.values()].some((q) => q !== 0)) throw new AppError("CONFLICT", "Batch or serial tracking can only be changed while the product has no stock.");
    }
    existing.set({ ...fields(input), variants });
    await existing.save({ session });
    await audit(ctx, "update", "product", id, `Updated product ${input.name}`, undefined, session);
    return { id };
  });
}

export async function setProductActive(ctx: Ctx, id: string, active: boolean) {
  const res = await Product.updateOne({ orgId: ctx.orgId, _id: id }, { $set: { active } });
  if (!res.matchedCount) throw new AppError("NOT_FOUND", "Product not found");
  await audit(ctx, active ? "restore" : "archive", "product", id, `${active ? "Restored" : "Archived"} product`);
}

export interface VariantHit {
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  sku: string;
  barcode: string;
  salePrice: number;
  mrp: number;
  costPrice: number;
  rateBp: number;
  cessBp: number;
  inclusive: boolean;
  unit: string;
  scale: number;
  hsn: string;
  trackBatch: boolean;
  trackSerial: boolean;
  warrantyMonths: number;
  /** Set when the scanned code was a specific serial number. */
  serial?: string;
  stock: number;
  image: string | null;
}

async function toHits(ctx: Ctx, products: ProductDoc[], locationId?: string, onlyVariant?: string): Promise<VariantHit[]> {
  const taxIds = [...new Set(products.map((p) => p.taxRateId && String(p.taxRateId)).filter(Boolean))] as string[];
  const rates = new Map((await TaxRate.find({ orgId: ctx.orgId, _id: { $in: taxIds } }).lean()).map((r) => [String(r._id), r]));
  const pairs = products.flatMap((p) => p.variants.filter((v) => v.active && (!onlyVariant || String(v._id) === onlyVariant)).map((v) => ({ p, v })));
  const stock = await stockByVariant(ctx, pairs.map(({ v }) => String(v._id)), locationId);
  return pairs.map(({ p, v }) => {
    const r = p.taxRateId ? rates.get(String(p.taxRateId)) : undefined;
    return {
      productId: String(p._id), variantId: String(v._id), name: p.name, variantName: v.name ?? "", sku: v.sku, barcode: v.barcodes[0] ?? "",
      salePrice: v.salePrice, mrp: v.mrp ?? 0, costPrice: v.costPrice ?? 0, rateBp: r?.rateBp ?? 0, cessBp: r?.cessBp ?? 0,
      inclusive: p.priceIncludesTax, unit: p.unit?.code ?? "pcs", scale: p.unit?.scale ?? 1, hsn: p.hsn ?? "", trackBatch: p.trackBatch, trackSerial: !!p.trackSerial, warrantyMonths: p.warrantyMonths ?? 0,
      stock: stock.get(String(v._id)) ?? 0, image: p.images?.[0] ?? null,
    };
  });
}

/** Exact barcode, then SKU. */
export async function findByCode(ctx: Ctx, code: string, locationId?: string): Promise<VariantHit | null> {
  const c = code.trim();
  if (!c) return null;
  const p = await Product.findOne({ orgId: ctx.orgId, active: true, $or: [{ "variants.barcodes": c }, { "variants.sku": c }] }).lean<ProductDoc>();
  if (p) {
    const v = p.variants.find((x) => x.barcodes.includes(c)) ?? p.variants.find((x) => x.sku === c);
    return v ? ((await toHits(ctx, [p], locationId, String(v._id)))[0] ?? null) : null;
  }
  // Not a product code: maybe a serial number / IMEI of an item in stock here.
  const sn = await findInStockSerial(ctx, c, locationId);
  if (!sn) return null;
  const sp = await Product.findOne({ orgId: ctx.orgId, _id: sn.productId, active: true }).lean<ProductDoc>();
  const hit = sp ? (await toHits(ctx, [sp], locationId, String(sn.variantId)))[0] : undefined;
  return hit ? { ...hit, serial: sn.serial } : null;
}

export async function searchVariants(ctx: Ctx, q: string, locationId?: string, limit = 20): Promise<VariantHit[]> {
  const term = q.trim().slice(0, 80);
  const filter: Record<string, unknown> = { orgId: ctx.orgId, active: true };
  if (term) {
    const rx = new RegExp(escapeRegex(term), "i");
    filter.$or = [{ name: rx }, { brand: rx }, { "variants.sku": rx }, { "variants.barcodes": term }, { "variants.name": rx }];
  }
  const products = await Product.find(filter).sort({ name: 1 }).limit(limit).lean<ProductDoc[]>();
  return (await toHits(ctx, products, locationId)).slice(0, limit * 2);
}

export async function getVariantHits(ctx: Ctx, variantIds: string[], locationId?: string) {
  const products = await Product.find({ orgId: ctx.orgId, "variants._id": { $in: variantIds } }).lean<ProductDoc[]>();
  const hits = await toHits(ctx, products, locationId);
  const wanted = new Set(variantIds);
  return hits.filter((h) => wanted.has(h.variantId));
}
