import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import type { Ctx } from "@/server/context";
import { MOCK_CREDENTIALS, startMockNic } from "../../scripts/mock-nic.mjs";

let rs: MongoMemoryReplSet;
let nic: { url: string; publicKey: string; close: () => Promise<void> };
let einv: typeof import("@/server/services/einvoice");
let models: typeof import("@/server/models");
let sales: typeof import("@/server/services/sales");
let products: typeof import("@/server/services/products");
let parties: typeof import("@/server/services/parties");
let onboarding: typeof import("@/server/services/onboarding");

beforeAll(async () => {
  nic = await startMockNic();
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  Object.assign(process.env, { MONGODB_URI: rs.getUri("einv-test"), BETTER_AUTH_SECRET: "z".repeat(40), APP_URL: "http://localhost:3000", NIC_EXTRA_HOSTS: new URL(nic.url).host });
  const { connectDb } = await import("@/server/db");
  await connectDb();
  [einv, models, sales, products, parties, onboarding] = await Promise.all([
    import("@/server/services/einvoice"), import("@/server/models"), import("@/server/services/sales"), import("@/server/services/products"), import("@/server/services/parties"), import("@/server/services/onboarding"),
  ]);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await rs?.stop();
  await nic?.close();
});

describe("GST e-invoice via the NIC API", () => {
  it("generates an IRN, rejects duplicates, creates an e-way bill and cancels", async () => {
    const ctx: Ctx = { userId: "u", userName: "Owner", userEmail: "o@x.test", orgId: new mongoose.Types.ObjectId().toHexString(), orgName: "Sharma Traders", role: "owner" };
    // getOrgSettings is cached per request in the app; tests call services directly.
    await onboarding.initializeBusiness(ctx, { name: "Sharma Traders", businessType: "Retail store", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", taxMode: "GST", taxId: "27AAPFU0939F1ZV", stateCode: "27", locationName: "Main", sample: false });
    await models.OrgSettings.updateOne({ orgId: ctx.orgId }, { $set: { legalName: "Sharma Traders Pvt Ltd", address: { line1: "12 MG Road", city: "Pune", postalCode: "411001" } } });
    const loc = String((await models.Location.findOne({ orgId: ctx.orgId }).lean())!._id);
    const rate = String((await models.TaxRate.findOne({ orgId: ctx.orgId, rateBp: 1800 }).lean())!._id);
    const { id: productId } = await products.createProduct(ctx, {
      name: "Steel Almirah", description: "", categoryId: null, brand: "", unitCode: "pcs", unitScale: 1, hsn: "94032010", taxRateId: rate, priceIncludesTax: true, trackBatch: false, trackSerial: false, warrantyMonths: 0,
      reorderLevel: 0, images: [], active: true, variants: [{ name: "", sku: "ALM", barcodes: ["111"], attributes: [], costPrice: 0, salePrice: 1180000, mrp: 0, active: true, openingQty: 5 }],
    });
    const variantId = String((await models.Product.findOne({ orgId: ctx.orgId, _id: productId }).lean())!.variants[0]._id);
    const { id: customerId } = await parties.saveParty(ctx, null, { kind: "customer", name: "Bangalore Retail Pvt Ltd", phone: "", email: "", taxId: "29AAGCB7383J1Z4", stateCode: "29", address: { line1: "5 Brigade Road", city: "Bengaluru", postalCode: "560001" }, creditLimit: 0, openingBalance: 0, notes: "" });
    const { saleId } = await sales.completeSale(ctx, { locationId: loc, customerId, lines: [{ variantId, qty: 1, discount: 0 }], billDiscount: 0, payments: [{ method: "card", amount: 1180000, reference: "" }], kind: "tax_invoice", notes: "" });

    // Not configured yet.
    await expect(einv.generateIrn(ctx, saleId)).rejects.toThrow(/Turn on e-invoicing/);

    // Arbitrary hosts are refused (SSRF guard).
    await expect(einv.saveEinvoiceSettings(ctx, { enabled: true, environment: "sandbox", baseUrl: "http://169.254.169.254", paths: { auth: "/a", invoice: "/b", cancel: "/c", ewb: "/d" }, clientId: "x", username: "y" })).rejects.toThrow(/not allowed/);

    const paths = { auth: "/eivital/v1.04/auth", invoice: "/eicore/v1.03/Invoice", cancel: "/eicore/v1.03/Invoice/Cancel", ewb: "/eiewb/v1.03/ewaybill" };
    await einv.saveEinvoiceSettings(ctx, { enabled: true, environment: "sandbox", baseUrl: nic.url, paths, clientId: MOCK_CREDENTIALS.clientId, username: MOCK_CREDENTIALS.username, clientSecret: MOCK_CREDENTIALS.clientSecret, password: "wrong", publicKey: nic.publicKey });
    await expect(einv.testConnection(ctx)).rejects.toThrow(/Invalid username or password/);
    // Saving without re-entering secrets keeps the stored ones; secrets are never returned.
    await einv.saveEinvoiceSettings(ctx, { enabled: true, environment: "sandbox", baseUrl: nic.url, paths, clientId: MOCK_CREDENTIALS.clientId, username: MOCK_CREDENTIALS.username, password: MOCK_CREDENTIALS.password });
    const shown = await einv.getEinvoiceSettings(ctx);
    expect(shown).toMatchObject({ hasClientSecret: true, hasPassword: true, hasPublicKey: true });
    expect(JSON.stringify(shown)).not.toContain(MOCK_CREDENTIALS.password);
    await einv.testConnection(ctx);

    const { irn, ackNo } = await einv.generateIrn(ctx, saleId);
    expect(irn).toMatch(/^[a-f0-9]{64}$/);
    expect(ackNo).toBeTruthy();
    const sale = await models.Sale.findOne({ orgId: ctx.orgId, _id: saleId }).lean();
    expect(sale!.einvoice).toMatchObject({ status: "generated", irn });
    expect(sale!.einvoice!.signedQr).toMatch(/^eyJ/);
    await expect(einv.generateIrn(ctx, saleId)).rejects.toThrow(/already exists/);

    const { ewbNo } = await einv.generateEwb(ctx, saleId, { transMode: "1", distance: 840, vehNo: "MH12AB1234" });
    expect(ewbNo).toMatch(/^3210/);

    await einv.cancelIrn(ctx, saleId, "2", "Wrong rate");
    expect((await models.Sale.findOne({ orgId: ctx.orgId, _id: saleId }).lean())!.einvoice!.status).toBe("cancelled");

    // Credentials are encrypted at rest.
    const raw = await models.EinvoiceConfig.findOne({ orgId: ctx.orgId }).lean();
    expect(raw!.secrets).not.toContain(MOCK_CREDENTIALS.password);
  });

  it("records validation problems instead of sending bad invoices", async () => {
    const ctx: Ctx = { userId: "u", userName: "Owner", userEmail: "o@x.test", orgId: new mongoose.Types.ObjectId().toHexString(), orgName: "No Address Co", role: "owner" };
    await onboarding.initializeBusiness(ctx, { name: "No Address Co", businessType: "Retail store", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", taxMode: "GST", taxId: "27AAPFU0939F1ZV", stateCode: "27", locationName: "Main", sample: false });
    await einv.saveEinvoiceSettings(ctx, { enabled: true, environment: "sandbox", baseUrl: nic.url, paths: { auth: "/eivital/v1.04/auth", invoice: "/eicore/v1.03/Invoice", cancel: "/eicore/v1.03/Invoice/Cancel", ewb: "/eiewb/v1.03/ewaybill" }, ...MOCK_CREDENTIALS, publicKey: nic.publicKey });
    const loc = String((await models.Location.findOne({ orgId: ctx.orgId }).lean())!._id);
    const { id: productId } = await products.createProduct(ctx, {
      name: "Thing", description: "", categoryId: null, brand: "", unitCode: "pcs", unitScale: 1, hsn: "", taxRateId: null, priceIncludesTax: true, trackBatch: false, trackSerial: false, warrantyMonths: 0,
      reorderLevel: 0, images: [], active: true, variants: [{ name: "", sku: "T1", barcodes: ["222"], attributes: [], costPrice: 0, salePrice: 1000, mrp: 0, active: true, openingQty: 5 }],
    });
    const variantId = String((await models.Product.findOne({ orgId: ctx.orgId, _id: productId }).lean())!.variants[0]._id);
    const { id: customerId } = await parties.saveParty(ctx, null, { kind: "customer", name: "Buyer", phone: "", email: "", taxId: "29AAGCB7383J1Z4", stateCode: "29", address: {}, creditLimit: 0, openingBalance: 0, notes: "" });
    const { saleId } = await sales.completeSale(ctx, { locationId: loc, customerId, lines: [{ variantId, qty: 1, discount: 0 }], billDiscount: 0, payments: [{ method: "cash", amount: 1000, reference: "" }], kind: "tax_invoice", notes: "" });
    await expect(einv.generateIrn(ctx, saleId)).rejects.toThrow(/HSN/);
    const sale = await models.Sale.findOne({ orgId: ctx.orgId, _id: saleId }).lean();
    expect(sale!.einvoice!.status).toBe("failed");
    expect(sale!.einvoice!.errors.join()).toMatch(/address line 1|PIN code/);
  });
});
