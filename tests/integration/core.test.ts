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
  ledger: typeof import("@/server/services/ledger");
  inventory: typeof import("@/server/services/inventory");
  reports: typeof import("@/server/services/reports");
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
    ledger: await import("@/server/services/ledger"),
    inventory: await import("@/server/services/inventory"),
    reports: await import("@/server/services/reports"),
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

  it("records opening stock of a batch-tracked product as its first batch", async () => {
    const c = ctx();
    const loc = await business(c);
    const v = { name: "", sku: "", barcodes: [], attributes: [], costPrice: 1500, salePrice: 2000, mrp: 2000, active: true, openingQty: 20 };
    await expect(product(c, 0, { trackBatch: true, variants: [v] })).rejects.toThrow(/batch number/);
    const { variantId } = await product(c, 0, { trackBatch: true, variants: [{ ...v, openingBatchNo: "B2610", openingExpiry: "2027-03-31" }] });
    const batch = await svc.models.Batch.findOne({ orgId: c.orgId, variantId }).lean();
    expect(batch).toMatchObject({ batchNo: "B2610", costPrice: 1500 });
    expect(batch!.expiry!.toISOString().slice(0, 10)).toBe("2027-03-31");
    const level = await svc.models.StockLevel.findOne({ orgId: c.orgId, variantId, batchId: batch!._id }).lean();
    expect(level!.qty).toBe(20);
    // and it sells from that batch
    await svc.sales.completeSale(c, cashSale(loc, variantId, 3, 6000));
    expect((await svc.models.StockLevel.findOne({ orgId: c.orgId, variantId, batchId: batch!._id }).lean())!.qty).toBe(17);
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

  it("tracks serial numbers from purchase to sale to return", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 0, { trackSerial: true, warrantyMonths: 12 });
    const { id: supplierId } = await svc.parties.saveParty(c, null, { kind: "supplier", name: "Phones Inc", phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 0, openingBalance: 0, notes: "" });
    const { id: poId } = await svc.purchases.savePurchaseOrder(c, null, { supplierId, locationId: loc, expectedDate: null, supplierInvoiceNo: "", notes: "", lines: [{ variantId, qty: 3, unitCost: 500 }] });
    const lineId = String((await svc.models.PurchaseOrder.findOne({ orgId: c.orgId, _id: poId }).lean())!.lines[0]._id);
    await expect(svc.purchases.receivePurchase(c, poId, [{ lineId, qty: 3, serials: ["IMEI-1", "IMEI-2"] }])).rejects.toThrow(/exactly 3/);
    await svc.purchases.receivePurchase(c, poId, [{ lineId, qty: 3, serials: ["IMEI-1", "IMEI-2", "IMEI-3"] }]);

    // A serial scan resolves to its product.
    const hit = await svc.products.findByCode(c, "IMEI-2", loc);
    expect(hit).toMatchObject({ variantId, serial: "IMEI-2" });

    // Selling needs serials, and the same serial can never be sold twice, even concurrently.
    await expect(svc.sales.completeSale(c, cashSale(loc, variantId))).rejects.toThrow(/serial/);
    const sell = (serial: string) => svc.sales.completeSale(c, { ...cashSale(loc, variantId), lines: [{ variantId, qty: 1, discount: 0, serials: [serial] }] });
    const race = await Promise.allSettled([sell("IMEI-1"), sell("IMEI-1")]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const sold = await svc.models.SerialNumber.findOne({ orgId: c.orgId, serial: "IMEI-1" }).lean();
    expect(sold).toMatchObject({ status: "sold" });
    expect(sold!.warrantyUntil).toBeTruthy();
    expect(await svc.products.findByCode(c, "IMEI-1", loc)).toBeNull();

    // Return brings the serial back; only serials from that bill are accepted.
    const saleId = String(sold!.saleId);
    await expect(svc.sales.returnSale(c, saleId, [{ lineIndex: 0, qty: 1, serials: ["IMEI-3"] }], "cash", "")).rejects.toThrow(/not on this bill/);
    await svc.sales.returnSale(c, saleId, [{ lineIndex: 0, qty: 1, serials: ["IMEI-1"] }], "cash", "faulty");
    expect(await svc.models.SerialNumber.findOne({ orgId: c.orgId, serial: "IMEI-1" }).lean()).toMatchObject({ status: "in_stock", saleId: null });

    // Purchase return removes the serial from stock.
    await svc.purchases.returnPurchase(c, poId, [{ lineId, qty: 1, serials: ["IMEI-3"] }]);
    expect(await svc.models.SerialNumber.findOne({ orgId: c.orgId, serial: "IMEI-3" }).lean()).toMatchObject({ status: "returned" });
    expect((await svc.models.StockLevel.findOne({ orgId: c.orgId, variantId }).lean())!.qty).toBe(2);
  });

  it("syncs offline bills idempotently and flags conflicts instead of losing sales", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 1); // only 1 in stock
    const offline = await import("@/server/services/offline");
    const t1 = await offline.registerDevice(c, "Counter 1");
    const t2 = await offline.registerDevice(c, "Counter 2");
    expect([t1.code, t2.code]).toEqual(["T1", "T2"]);
    const device = await offline.deviceFromToken(c, t1.token);
    await expect(offline.deviceFromToken(c, "x".repeat(43))).rejects.toThrow(/not registered/);

    const snap = await offline.posSnapshot(c, loc);
    expect(snap.variants.some((v) => v.variantId === variantId)).toBe(true);

    const { fiscalYear, offlineNumber } = await import("@/lib/numbering");
    const fy = fiscalYear(new Date(), 4, "Asia/Kolkata");
    const num = (seq: number, code = "T1") => offlineNumber("S", code, fy, seq);
    const sale = (seq: number, qty: number, extra: Record<string, unknown> = {}) =>
      offline.offlineSaleInput.parse({
        clientId: crypto.randomUUID(), number: num(seq), createdAt: new Date().toISOString(), locationId: loc, customerId: null, kind: "receipt", billDiscount: 0,
        lines: [{ variantId, qty, unitPrice: 1000, discount: 0 }], payments: [{ method: "cash", amount: 1000 * qty }], grandTotal: 1000 * qty, ...extra,
      });

    const first = sale(1, 1);
    const r1 = await offline.syncOfflineSale(c, device.code, String(device._id), first);
    expect(r1).toMatchObject({ status: "synced", number: num(1), issues: [] });
    // Same bill sent again (e.g. network dropped after the server saved it).
    expect(await offline.syncOfflineSale(c, device.code, String(device._id), first)).toMatchObject({ status: "duplicate", saleId: r1.saleId });

    // Stock is gone but the customer already has the goods: recorded + flagged.
    const r2 = await offline.syncOfflineSale(c, device.code, String(device._id), sale(2, 2));
    expect(r2.status).toBe("synced");
    expect(r2.issues!.join()).toMatch(/below zero/);
    expect((await svc.models.StockLevel.findOne({ orgId: c.orgId, variantId }).lean())!.qty).toBe(-2);
    expect(await svc.models.Sale.countDocuments({ orgId: c.orgId, "syncIssues.0": { $exists: true } })).toBe(1);

    // Another till's series, a reused number and a changed price/total.
    expect(await offline.syncOfflineSale(c, device.code, String(device._id), { ...sale(3, 1), number: num(3, "T2") })).toMatchObject({ status: "rejected" });
    expect(await offline.syncOfflineSale(c, device.code, String(device._id), { ...sale(1, 1), clientId: crypto.randomUUID() })).toMatchObject({ status: "rejected", error: expect.stringMatching(/already used/) });
    const cashier = { ...c, role: "cashier" as const };
    const r4 = await offline.syncOfflineSale(cashier, device.code, String(device._id), sale(4, 1, { lines: [{ variantId, qty: 1, unitPrice: 500, discount: 0, serials: [] }], grandTotal: 999 }));
    expect(r4.issues!.join()).toMatch(/current price/);
    expect(r4.issues!.join()).toMatch(/Printed total/);
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

describe("supplier payments against chosen invoices, and the khata ledger", () => {
  const party = (c: Ctx, kind: "customer" | "supplier", name: string, extra: { creditLimit?: number; openingBalance?: number } = {}) =>
    svc.parties.saveParty(c, null, { kind, name, phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: extra.creditLimit ?? 0, openingBalance: extra.openingBalance ?? 0, notes: "" });

  async function receivedPo(c: Ctx, loc: string, supplierId: string, variantId: string, qty: number, unitCost: number, invoice: string) {
    const { id } = await svc.purchases.savePurchaseOrder(c, null, { supplierId, locationId: loc, expectedDate: null, supplierInvoiceNo: invoice, notes: "", lines: [{ variantId, qty, unitCost }] });
    const po = await svc.models.PurchaseOrder.findOne({ orgId: c.orgId, _id: id }).lean();
    await svc.purchases.receivePurchase(c, id, [{ lineId: String(po!.lines[0]._id), qty }]);
    return id;
  }
  const paid = async (c: Ctx, id: string) => (await svc.models.PurchaseOrder.findOne({ orgId: c.orgId, _id: id }).lean())!.amountPaid;

  it("pays part of one chosen invoice; the rest stays due on that invoice", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 0);
    const { id: sup } = await party(c, "supplier", "Lays Distributor");
    const older = await receivedPo(c, loc, sup, variantId, 10, 1_000_00, "OLD-1"); // ₹10,000 (older)
    const big = await receivedPo(c, loc, sup, variantId, 3, 25_000_00, "INV-75K"); // ₹75,000

    const r = await svc.parties.recordPayment(c, { partyId: sup, amount: 50_000_00, method: "bank", reference: "UTR123", note: "Part payment", date: null, allocations: [{ docId: big, amount: 50_000_00 }] });
    expect(r.allocations).toEqual([{ number: expect.any(String), amount: 50_000_00 }]);
    expect(await paid(c, big)).toBe(50_000_00);
    expect(await paid(c, older)).toBe(0); // not touched even though it is older
    expect((await svc.models.Party.findOne({ orgId: c.orgId, _id: sup }).lean())!.balance).toBe(35_000_00);
    const pay = await svc.models.Payment.findOne({ orgId: c.orgId, partyId: sup }).lean();
    expect(pay).toMatchObject({ reference: "UTR123", note: "Part payment", method: "bank" });
  });

  it("rejects bad allocations and leaves everything unchanged", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 0);
    const { id: sup } = await party(c, "supplier", "A");
    const { id: other } = await party(c, "supplier", "B");
    const po = await receivedPo(c, loc, sup, variantId, 1, 10_000, "X");
    const othersPo = await receivedPo(c, loc, other, variantId, 1, 10_000, "Y");
    const base = { partyId: sup, method: "cash" as const, reference: "", date: null };
    await expect(svc.parties.recordPayment(c, { ...base, amount: 20_000, allocations: [{ docId: po, amount: 15_000 }] })).rejects.toThrow(/only has/);
    await expect(svc.parties.recordPayment(c, { ...base, amount: 5_000, allocations: [{ docId: po, amount: 8_000 }] })).rejects.toThrow(/more than the payment/);
    await expect(svc.parties.recordPayment(c, { ...base, amount: 5_000, allocations: [{ docId: othersPo, amount: 5_000 }] })).rejects.toThrow(/doesn't belong/);
    await expect(svc.parties.recordPayment(c, { ...base, amount: 5_000, allocations: [{ docId: po, amount: 2_000 }, { docId: po, amount: 2_000 }] })).rejects.toThrow(/twice/);
    await expect(svc.parties.recordPayment(c, { ...base, amount: 5_000, date: "2999-01-01" })).rejects.toThrow(/future/);
    expect(await paid(c, po)).toBe(0);
    expect((await svc.models.Party.findOne({ orgId: c.orgId, _id: sup }).lean())!.balance).toBe(10_000);
    expect(await svc.models.Payment.countDocuments({ orgId: c.orgId, partyId: sup })).toBe(0);
  });

  it("puts what is left after the chosen invoice on the oldest other invoices, then as advance", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 0);
    const { id: sup } = await party(c, "supplier", "S");
    const a = await receivedPo(c, loc, sup, variantId, 1, 10_000, "A");
    const b = await receivedPo(c, loc, sup, variantId, 1, 10_000, "B");
    const r = await svc.parties.recordPayment(c, { partyId: sup, amount: 25_000, method: "cash", reference: "", date: null, allocations: [{ docId: b, amount: 10_000 }] });
    expect(await paid(c, b)).toBe(10_000);
    expect(await paid(c, a)).toBe(10_000);
    expect(r.advance).toBe(5_000);
    expect((await svc.models.Party.findOne({ orgId: c.orgId, _id: sup }).lean())!.balance).toBe(-5_000);
  });

  it("two saves of the same opening-balance change post it once", async () => {
    const c = ctx();
    await business(c);
    const { id } = await party(c, "customer", "Twice");
    const data = { kind: "customer" as const, name: "Twice", phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 0, openingBalance: 100, notes: "" };
    await Promise.allSettled([svc.parties.saveParty(c, id, data), svc.parties.saveParty(c, id, data)]);
    expect((await svc.models.Party.findOne({ orgId: c.orgId, _id: id }).lean())!.balance).toBe(100);
    expect(await svc.models.LedgerEntry.countDocuments({ orgId: c.orgId, partyId: id })).toBe(1);
  });

  it("customer khata: opening balance, udhaar with note and back-date, payment, statement in date order", async () => {
    const c = ctx();
    await business(c);
    const { id: cust } = await party(c, "customer", "Ramesh", { openingBalance: 1_000, creditLimit: 10_000 });
    await svc.parties.addUdhaar(c, { partyId: cust, amount: 500, note: "2 kg sugar", date: null });
    await svc.parties.addUdhaar(c, { partyId: cust, amount: 300, note: "Back-dated", date: "2026-01-15" });
    await expect(svc.parties.addUdhaar(c, { partyId: cust, amount: 9_000, note: "too much", date: null })).rejects.toThrow(/credit limit/);
    await svc.parties.recordPayment(c, { partyId: cust, amount: 700, method: "upi", reference: "", date: null });
    // editing the opening balance moves the balance by the difference, not to a stale value
    await svc.parties.saveParty(c, cust, { kind: "customer", name: "Ramesh", phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 10_000, openingBalance: 1_500, notes: "" });

    const st = await svc.ledger.partyStatement(c, cust);
    expect(st.balance).toBe(1_000 + 500 + 300 - 700 + 500);
    expect(st.rows.at(-1)!.balance).toBe(st.balance);
    expect(st.broughtForward).toBe(0);
    expect(st.rows[0]).toMatchObject({ kind: "udhaar", note: "Back-dated", delta: 300 }); // dated January, so first
    expect(st.rows.map((r) => r.kind)).toEqual(["udhaar", "opening", "udhaar", "payment", "opening"]);
    // running balance is consistent row to row
    let run = st.broughtForward;
    for (const r of st.rows) expect(r.balance).toBe((run += r.delta));
  });

  it("credit sales, returns and voids all land in the customer's ledger", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 10);
    const { id: cust } = await party(c, "customer", "Sita");
    const onAccount = (qty: number) => ({ ...cashSale(loc, variantId, qty, 0), customerId: cust, payments: [{ method: "credit" as const, amount: qty * 1000, reference: "" }] });
    const { saleId } = await svc.sales.completeSale(c, onAccount(2));
    const { saleId: second } = await svc.sales.completeSale(c, onAccount(1));
    await svc.sales.returnSale(c, saleId, [{ lineIndex: 0, qty: 1 }], "credit", "damaged");
    await svc.sales.voidSale(c, second, "wrong customer");
    const st = await svc.ledger.partyStatement(c, cust);
    expect(st.rows.map((r) => [r.kind, r.delta])).toEqual([["sale", 2000], ["sale", 1000], ["return", -1000], ["sale_void", -1000]]);
    expect(st.balance).toBe(1000);
    // the credit return also lowered what is due on the original bill
    expect((await svc.models.Sale.findOne({ orgId: c.orgId, _id: saleId }).lean())!.balanceDue).toBe(1000);
    const bills = await svc.parties.listOpenDocs(c, cust);
    expect(bills.map((b) => b.due)).toEqual([1000]);
  });
  it("undo: udhaar and payments are reversed once, bills get their dues back, bills themselves can't be undone", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 10);
    const { id: cust } = await party(c, "customer", "Undo Test");
    const { saleId } = await svc.sales.completeSale(c, { ...cashSale(loc, variantId, 2, 0), customerId: cust, payments: [{ method: "credit" as const, amount: 2000, reference: "" }] });
    await svc.parties.addUdhaar(c, { partyId: cust, amount: 500, note: "typo", date: null });
    await svc.parties.recordPayment(c, { partyId: cust, amount: 1500, method: "cash", reference: "", date: null, allocations: [{ docId: saleId, amount: 1500 }] });
    const entries = await svc.models.LedgerEntry.find({ orgId: c.orgId, partyId: cust }).sort({ createdAt: 1 }).lean();
    const [saleEntry, udhaarEntry, payEntry] = entries;
    expect((await svc.models.Party.findOne({ orgId: c.orgId, _id: cust }).lean())!.balance).toBe(1000);

    await expect(svc.parties.reverseEntry(c, { entryId: String(saleEntry._id), reason: "nope" })).rejects.toThrow(/Only udhaar entries and payments/);
    await svc.parties.reverseEntry(c, { entryId: String(udhaarEntry._id), reason: "Entered by mistake" });
    await expect(svc.parties.reverseEntry(c, { entryId: String(udhaarEntry._id), reason: "again" })).rejects.toThrow(/already been undone/);
    await svc.parties.reverseEntry(c, { entryId: String(payEntry._id), reason: "Cheque bounced" });

    expect((await svc.models.Party.findOne({ orgId: c.orgId, _id: cust }).lean())!.balance).toBe(2000);
    const sale = await svc.models.Sale.findOne({ orgId: c.orgId, _id: saleId }).lean();
    expect(sale!.balanceDue).toBe(2000);
    expect((await svc.models.Payment.findOne({ orgId: c.orgId, partyId: cust }).lean())!.reversedAt).toBeTruthy();
    const st = await svc.ledger.partyStatement(c, cust);
    expect(st.rows.map((r) => [r.kind, r.delta, !!r.reversed])).toEqual([
      ["sale", 2000, false], ["udhaar", 500, true], ["payment", -1500, true], ["reversal", -500, false], ["reversal", 1500, false],
    ]);
    expect(st.rows.find((r) => r.kind === "udhaar")!.reversed!.reason).toBe("Entered by mistake");
    expect(st.rows.at(-1)!.balance).toBe(2000);
  });

  it("two people undoing the same payment at once only undo it once", async () => {
    const c = ctx();
    await business(c);
    const { id: cust } = await party(c, "customer", "Race", { openingBalance: 1000 });
    await svc.parties.recordPayment(c, { partyId: cust, amount: 400, method: "cash", reference: "", date: null });
    const pay = await svc.models.LedgerEntry.findOne({ orgId: c.orgId, partyId: cust, kind: "payment" }).lean();
    const results = await Promise.allSettled([1, 2].map(() => svc.parties.reverseEntry(c, { entryId: String(pay!._id), reason: "race" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await svc.models.Party.findOne({ orgId: c.orgId, _id: cust }).lean())!.balance).toBe(1000);
    expect(await svc.models.LedgerEntry.countDocuments({ orgId: c.orgId, partyId: cust, kind: "reversal" })).toBe(1);
  });
});

describe("regression tests for the bug sweep", () => {
  const party = (c: Ctx, kind: "customer" | "supplier", name: string, openingBalance = 0) =>
    svc.parties.saveParty(c, null, { kind, name, phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 0, openingBalance, notes: "" });

  it("a return can't list the same bill line twice (no double refunds)", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 10);
    const { saleId } = await svc.sales.completeSale(c, cashSale(loc, variantId, 5, 5000));
    await expect(svc.sales.returnSale(c, saleId, [{ lineIndex: 0, qty: 5 }, { lineIndex: 0, qty: 5 }], "cash", "x")).rejects.toThrow(/only be listed once/);
    expect((await svc.models.StockLevel.findOne({ orgId: c.orgId, variantId }).lean())!.qty).toBe(5);
  });

  it("returning goods from an unpaid credit bill clears the due instead of paying out cash", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 10);
    const { id: cust } = await party(c, "customer", "Due");
    const { saleId } = await svc.sales.completeSale(c, { ...cashSale(loc, variantId, 1, 0), customerId: cust, payments: [{ method: "credit" as const, amount: 1000, reference: "" }] });
    const r = await svc.sales.returnSale(c, saleId, [{ lineIndex: 0, qty: 1 }], "cash", "unwanted");
    expect(r).toMatchObject({ offDue: 1000, payBack: 0 });
    expect((await svc.models.Party.findOne({ orgId: c.orgId, _id: cust }).lean())!.balance).toBe(0);
    expect((await svc.models.Sale.findOne({ orgId: c.orgId, _id: saleId }).lean())!.balanceDue).toBe(0);
    const ret = await svc.models.Sale.findOne({ orgId: c.orgId, _id: r.saleId }).lean();
    expect(ret!.payments).toEqual([{ method: "credit", amount: 1000 }]);
  });

  it("can't receive more than was ordered", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 0);
    const { id: sup } = await party(c, "supplier", "S");
    const { id: po } = await svc.purchases.savePurchaseOrder(c, null, { supplierId: sup, locationId: loc, expectedDate: null, supplierInvoiceNo: "", notes: "", lines: [{ variantId, qty: 10, unitCost: 100 }] });
    const lineId = String((await svc.models.PurchaseOrder.findOne({ orgId: c.orgId, _id: po }).lean())!.lines[0]._id);
    await expect(svc.purchases.receivePurchase(c, po, [{ lineId, qty: 20 }])).rejects.toThrow(/only 10 left to receive/);
    await svc.purchases.receivePurchase(c, po, [{ lineId, qty: 10 }]);
    expect((await svc.models.StockLevel.findOne({ orgId: c.orgId, variantId }).lean())!.qty).toBe(10);
  });

  it("a stock count with the same item on several lines adds them up", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 1);
    await svc.inventory.postStockCount(c, { locationId: loc, lines: [1, 1, 1].map((counted) => ({ variantId, batchId: null, counted })) });
    expect((await svc.models.StockLevel.findOne({ orgId: c.orgId, variantId }).lean())!.qty).toBe(3);
  });

  it("editing a product can't take over another product's variant or change the unit while in stock", async () => {
    const c = ctx();
    await business(c);
    const a = await product(c, 5);
    const b = await product(c, 0);
    const base = { name: "Widget", description: "", categoryId: null, brand: "", unitCode: "pcs", unitScale: 1 as const, hsn: "", taxRateId: null, priceIncludesTax: true, trackBatch: false, trackSerial: false, warrantyMonths: 0, reorderLevel: 0, images: [], active: true };
    const v = { name: "", sku: "", barcodes: [], attributes: [], costPrice: 500, salePrice: 1000, mrp: 0, active: true, openingQty: 0 };
    await expect(svc.products.updateProduct(c, b.productId, { ...base, variants: [{ ...v, id: a.variantId }] } as never)).rejects.toThrow(/doesn't belong/);
    await expect(svc.products.updateProduct(c, a.productId, { ...base, unitCode: "kg", unitScale: 1000, variants: [{ ...v, id: a.variantId }] } as never)).rejects.toThrow(/no stock/);
  });

  it("a contact with a balance can't be archived", async () => {
    const c = ctx();
    await business(c);
    const { id } = await party(c, "customer", "Owes", 500);
    await expect(svc.parties.setPartyActive(c, id, false)).rejects.toThrow(/still has a balance/);
    await svc.parties.recordPayment(c, { partyId: id, amount: 500, method: "cash", reference: "", date: null });
    await svc.parties.setPartyActive(c, id, false);
    expect((await svc.models.Party.findOne({ orgId: c.orgId, _id: id }).lean())!.active).toBe(false);
  });

  it("purchase report counts goods when received and money when paid", async () => {
    const c = ctx();
    const loc = await business(c);
    const { variantId } = await product(c, 0);
    const { id: sup } = await party(c, "supplier", "R");
    const { id: po } = await svc.purchases.savePurchaseOrder(c, null, { supplierId: sup, locationId: loc, expectedDate: null, supplierInvoiceNo: "", notes: "", lines: [{ variantId, qty: 4, unitCost: 250 }] });
    const lineId = String((await svc.models.PurchaseOrder.findOne({ orgId: c.orgId, _id: po }).lean())!.lines[0]._id);
    await svc.purchases.receivePurchase(c, po, [{ lineId, qty: 4 }]);
    await svc.parties.recordPayment(c, { partyId: sup, amount: 400, method: "cash", reference: "", date: null });
    const t = await svc.reports.purchaseTotals(c, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    expect(t).toEqual({ received: 1000, returned: 0, paid: 400, count: 1 });
    const old = await svc.reports.purchaseTotals(c, new Date("2020-01-01"), new Date("2020-02-01"));
    expect(old.received).toBe(0);
  });
});
