import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import type { Ctx } from "@/server/context";

let rs: MongoMemoryReplSet;
let svc: {
  products: typeof import("@/server/services/products");
  sales: typeof import("@/server/services/sales");
  system: typeof import("@/server/services/system");
  onboarding: typeof import("@/server/services/onboarding");
  purchases: typeof import("@/server/services/purchases");
  parties: typeof import("@/server/services/parties");
  models: typeof import("@/server/models");
};

const ctx = (role: Ctx["role"] = "owner"): Ctx => ({
  userId: "u-" + role, userName: "Tester", userEmail: "t@example.com", orgId: new mongoose.Types.ObjectId().toHexString(), orgName: "Org", role,
});

async function business(c: Ctx) {
  await svc.onboarding.initializeBusiness(c, { name: "Shop", businessType: "Retail store", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", taxMode: "GST", taxId: "", stateCode: "27", locationName: "Main", sample: false });
  const loc = await svc.models.Location.findOne({ orgId: c.orgId, isDefault: true }).lean();
  return String(loc!._id);
}

async function product(c: Ctx, openingQty: number, extra: Partial<Parameters<typeof svc.products.createProduct>[1]> = {}) {
  const { id } = await svc.products.createProduct(c, {
    name: "Widget", description: "", categoryId: null, brand: "", unitCode: "pcs", unitScale: 1, hsn: "", taxRateId: null, priceIncludesTax: true,
    trackBatch: false, reorderLevel: 0, images: [], active: true,
    variants: [{ name: "", sku: "", barcodes: [], attributes: [], costPrice: 500, salePrice: 1000, mrp: 0, active: true, openingQty }],
    ...extra,
  } as Parameters<typeof svc.products.createProduct>[1]);
  const p = await svc.models.Product.findOne({ orgId: c.orgId, _id: id }).lean();
  return { productId: id, variantId: String(p!.variants[0]._id), barcode: p!.variants[0].barcodes[0] };
}

const cashSale = (locationId: string, variantId: string, qty = 1, amount = 1000) => ({
  locationId, customerId: null, lines: [{ variantId, qty, discount: 0 }], billDiscount: 0,
  payments: [{ method: "cash" as const, amount, reference: "" }], kind: "receipt" as const, notes: "",
});

beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  Object.assign(process.env, { MONGODB_URI: rs.getUri("stockpilot-test"), BETTER_AUTH_SECRET: "x".repeat(40), APP_URL: "http://localhost:3000" });
  const { connectDb } = await import("@/server/db");
  await connectDb();
  svc = {
    products: await import("@/server/services/products"),
    sales: await import("@/server/services/sales"),
    system: await import("@/server/services/system"),
    onboarding: await import("@/server/services/onboarding"),
    purchases: await import("@/server/services/purchases"),
    parties: await import("@/server/services/parties"),
    models: await import("@/server/models"),
  };
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await rs?.stop();
});

describe("stock & sales invariants", () => {
  it("never oversells under concurrency", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 3);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => svc.sales.completeSale(c, cashSale(loc, variantId))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => /in stock/.test(String(r.reason?.message)))).toBe(true);
    const level = await svc.models.StockLevel.findOne({ orgId: c.orgId, variantId }).lean();
    expect(level!.qty).toBe(0);
    expect(await svc.models.StockMove.countDocuments({ orgId: c.orgId, variantId, type: "sale" })).toBe(3);
  });

  it("numbers documents without gaps or duplicates", async () => {
    const c = ctx();
    await business(c);
    const nums = await Promise.all(Array.from({ length: 30 }, () => svc.system.nextNumber(c, "sale")));
    const seqs = nums.map((n) => n.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(nums[0].number).toMatch(/^S\/\d{2}-\d{2}\/\d{5}$/);
  });

  it("isolates businesses", async () => {
    const a = ctx();
    const b = ctx();
    await business(a);
    await business(b);
    const { productId, barcode } = await product(a, 1);
    expect(await svc.products.findByCode(b, barcode)).toBeNull();
    expect(await svc.products.findByCode(a, barcode)).not.toBeNull();
    await expect(svc.products.setProductActive(b, productId, false)).rejects.toThrow(/not found/i);
    await expect(svc.models.Product.find({}).exec()).rejects.toThrow(/Tenant scope/);
    // the same barcode is allowed in another business
    await expect(product(b, 0, { variants: [{ name: "", sku: "", barcodes: [barcode], attributes: [], costPrice: 0, salePrice: 100, mrp: 0, active: true, openingQty: 0 }] })).resolves.toBeTruthy();
  });

  it("rejects duplicate barcodes within a business", async () => {
    const c = ctx();
    await business(c);
    const { barcode } = await product(c, 0);
    await expect(product(c, 0, { variants: [{ name: "", sku: "", barcodes: [barcode], attributes: [], costPrice: 0, salePrice: 100, mrp: 0, active: true, openingQty: 0 }] })).rejects.toThrow();
  });

  it("caps returns at the sold quantity and restocks", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 5);
    const { saleId } = await svc.sales.completeSale(c, cashSale(loc, variantId, 2, 2000));
    await svc.sales.returnSale(c, saleId, [{ lineIndex: 0, qty: 1 }], "cash", "damaged");
    await expect(svc.sales.returnSale(c, saleId, [{ lineIndex: 0, qty: 2 }], "cash", "again")).rejects.toThrow(/at most|Only 1/);
    const level = await svc.models.StockLevel.findOne({ orgId: c.orgId, variantId }).lean();
    expect(level!.qty).toBe(4);
  });

  it("computes GST and blocks cashier over-discount", async () => {
    const c = ctx();
    const loc = await business(c);
    const rate = await svc.models.TaxRate.findOne({ orgId: c.orgId, rateBp: 1800 }).lean();
    const { variantId } = await product(c, 10, { taxRateId: String(rate!._id), priceIncludesTax: false });
    const q = await svc.sales.quoteSale(c, { ...cashSale(loc, variantId), lines: [{ variantId, qty: 2, discount: 0 }] });
    expect(q).toMatchObject({ taxableTotal: 2000, cgst: 180, sgst: 180, grandTotal: 2400 }); // 2360 rounded off
    const cashier = { ...c, role: "cashier" as const };
    await expect(svc.sales.completeSale(cashier, { ...cashSale(loc, variantId, 1, 1180), billDiscount: 500 })).rejects.toThrow(/manager/);
  });

  it("ignores price overrides from roles without price:override", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 5);
    const cashier = { ...c, role: "cashier" as const };
    const { saleId } = await svc.sales.completeSale(cashier, { ...cashSale(loc, variantId), lines: [{ variantId, qty: 1, discount: 0, unitPrice: 1 }] });
    const sale = await svc.models.Sale.findOne({ orgId: c.orgId, _id: saleId }).lean();
    expect(sale!.lines[0].unitPrice).toBe(1000);
    const manager = { ...c, role: "manager" as const };
    const r = await svc.sales.completeSale(manager, { ...cashSale(loc, variantId, 1, 900), lines: [{ variantId, qty: 1, discount: 0, unitPrice: 900 }] });
    expect((await svc.models.Sale.findOne({ orgId: c.orgId, _id: r.saleId }).lean())!.lines[0].unitPrice).toBe(900);
  });

  it("voids today's sale and restocks", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 5);
    const { saleId } = await svc.sales.completeSale(c, cashSale(loc, variantId, 2, 2000));
    await svc.sales.voidSale(c, saleId, "wrong item");
    expect((await svc.models.StockLevel.findOne({ orgId: c.orgId, variantId }).lean())!.qty).toBe(5);
    await expect(svc.sales.voidSale(c, saleId, "again")).rejects.toThrow(/not found/i);
  });

  it("enforces customer credit limits", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 10);
    const { id: customerId } = await svc.parties.saveParty(c, null, { kind: "customer", name: "Ravi", phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 1500, openingBalance: 0, notes: "" });
    await svc.sales.completeSale(c, { ...cashSale(loc, variantId), customerId, payments: [{ method: "credit", amount: 1000, reference: "" }] });
    await expect(svc.sales.completeSale(c, { ...cashSale(loc, variantId), customerId, payments: [{ method: "credit", amount: 1000, reference: "" }] })).rejects.toThrow(/credit limit/);
    await svc.parties.recordPayment(c, { partyId: customerId, amount: 1000, method: "cash", reference: "" });
    const party = await svc.models.Party.findOne({ orgId: c.orgId, _id: customerId }).lean();
    expect(party!.balance).toBe(0);
    const sale = await svc.models.Sale.findOne({ orgId: c.orgId, customerId }).lean();
    expect(sale!.balanceDue).toBe(0);
  });

  it("receives purchases partially then fully, with batches and FEFO sales", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 0, { trackBatch: true });
    const { id: supplierId } = await svc.parties.saveParty(c, null, { kind: "supplier", name: "Acme", phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 0, openingBalance: 0, notes: "" });
    const { id: poId } = await svc.purchases.savePurchaseOrder(c, null, { supplierId, locationId: loc, expectedDate: null, supplierInvoiceNo: "", notes: "", lines: [{ variantId, qty: 10, unitCost: 400 }] });
    const po = await svc.models.PurchaseOrder.findOne({ orgId: c.orgId, _id: poId }).lean();
    const lineId = String(po!.lines[0]._id);
    expect((await svc.purchases.receivePurchase(c, poId, [{ lineId, qty: 4, batchNo: "LATE", expiry: "2031-01-01" }])).status).toBe("partial");
    expect((await svc.purchases.receivePurchase(c, poId, [{ lineId, qty: 6, batchNo: "EARLY", expiry: "2030-01-01" }])).status).toBe("received");
    const { saleId } = await svc.sales.completeSale(c, cashSale(loc, variantId, 7, 7000));
    const sale = await svc.models.Sale.findOne({ orgId: c.orgId, _id: saleId }).lean();
    expect(sale!.lines.map((l) => [l.batchNo, l.qty])).toEqual([["EARLY", 6], ["LATE", 1]]);
    const supplier = await svc.models.Party.findOne({ orgId: c.orgId, _id: supplierId }).lean();
    expect(supplier!.balance).toBe(4000);
  });
});
