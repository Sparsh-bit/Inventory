import mongoose, { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { tenantPlugin } from "./tenant-plugin";

const { ObjectId } = Schema.Types;
const orgId = { type: ObjectId, required: true, index: true } as const;
const opts = { timestamps: true, versionKey: false } as const;

function model<S extends Schema>(name: string, schema: S, tenant = true): Model<InferSchemaType<S>> {
  if (tenant) schema.plugin(tenantPlugin);
  return (mongoose.models[name] as Model<InferSchemaType<S>>) ?? mongoose.model(name, schema);
}

const address = new Schema(
  { line1: String, line2: String, city: String, state: String, postalCode: String, country: String },
  { _id: false },
);

/* ---------------- organization settings ---------------- */

const orgSettingsSchema = new Schema(
  {
    orgId: { type: ObjectId, required: true, unique: true },
    businessType: { type: String, default: "retail" },
    legalName: String,
    taxId: String, // GSTIN / VAT number
    stateCode: String, // 2-digit GST state code
    address: { type: address, default: {} },
    phone: String,
    email: String,
    logoUrl: String,
    currency: { type: String, default: "INR" },
    locale: { type: String, default: "en-IN" },
    timezone: { type: String, default: "Asia/Kolkata" },
    taxMode: { type: String, enum: ["GST", "VAT", "NONE"], default: "GST" },
    pricesIncludeTax: { type: Boolean, default: true },
    roundOff: { type: Boolean, default: true },
    allowNegativeStock: { type: Boolean, default: false },
    fiscalYearStartMonth: { type: Number, default: 4, min: 1, max: 12 },
    receipt: {
      paperWidth: { type: Number, enum: [58, 80], default: 80 },
      header: { type: String, default: "" },
      footer: { type: String, default: "Thank you! Visit again." },
      showHsn: { type: Boolean, default: false },
      showUpiQr: { type: Boolean, default: false },
      upiId: { type: String, default: "" },
    },
    invoiceTerms: { type: String, default: "" },
    prefixes: {
      sale: { type: String, default: "S" },
      invoice: { type: String, default: "INV" },
      return: { type: String, default: "CN" },
      purchase: { type: String, default: "PO" },
    },
    scanner: {
      interKeyMs: { type: Number, default: 35, min: 5, max: 200 },
      minLength: { type: Number, default: 4, min: 2, max: 20 },
    },
  },
  opts,
);
export const OrgSettings = model("OrgSettings", orgSettingsSchema);

/* ---------------- locations, categories, tax rates ---------------- */

const locationSchema = new Schema(
  {
    orgId,
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["store", "warehouse"], default: "store" },
    address: { type: address, default: {} },
    isDefault: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  opts,
);
locationSchema.index({ orgId: 1, name: 1 }, { unique: true });
export const Location = model("Location", locationSchema);

const categorySchema = new Schema(
  { orgId, name: { type: String, required: true, trim: true }, parentId: { type: ObjectId, default: null } },
  opts,
);
categorySchema.index({ orgId: 1, parentId: 1, name: 1 }, { unique: true });
export const Category = model("Category", categorySchema);

const taxRateSchema = new Schema(
  {
    orgId,
    name: { type: String, required: true, trim: true },
    rateBp: { type: Number, required: true, min: 0, max: 10000 },
    cessBp: { type: Number, default: 0, min: 0, max: 10000 },
    isDefault: { type: Boolean, default: false },
  },
  opts,
);
taxRateSchema.index({ orgId: 1, name: 1 }, { unique: true });
export const TaxRate = model("TaxRate", taxRateSchema);

/* ---------------- products ---------------- */

const variantSchema = new Schema({
  name: { type: String, default: "" }, // "M / Red"; empty for single-variant products
  sku: { type: String, required: true, trim: true },
  barcodes: { type: [String], required: true, validate: (v: string[]) => v.length > 0 },
  attributes: { type: [{ name: String, value: String, _id: false }], default: [] },
  costPrice: { type: Number, default: 0, min: 0 },
  salePrice: { type: Number, required: true, min: 0 },
  mrp: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
});

const productSchema = new Schema(
  {
    orgId,
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    categoryId: { type: ObjectId, default: null },
    brand: { type: String, default: "" },
    unit: {
      code: { type: String, default: "pcs" },
      scale: { type: Number, default: 1, enum: [1, 1000] }, // 1000 = sold in kg/l with gram/ml precision
    },
    hsn: { type: String, default: "" },
    taxRateId: { type: ObjectId, default: null },
    priceIncludesTax: { type: Boolean, default: true },
    trackBatch: { type: Boolean, default: false },
    trackSerial: { type: Boolean, default: false },
    warrantyMonths: { type: Number, default: 0, min: 0, max: 600 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    images: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    variants: { type: [variantSchema], validate: (v: unknown[]) => v.length > 0 },
  },
  opts,
);
productSchema.index({ orgId: 1, "variants.barcodes": 1 }, { unique: true });
productSchema.index({ orgId: 1, "variants.sku": 1 }, { unique: true });
productSchema.index({ orgId: 1, name: "text", brand: "text", "variants.sku": "text" });
productSchema.index({ orgId: 1, active: 1, name: 1 });
export const Product = model("Product", productSchema);

const batchSchema = new Schema(
  {
    orgId,
    productId: { type: ObjectId, required: true },
    variantId: { type: ObjectId, required: true },
    batchNo: { type: String, required: true, trim: true },
    expiry: { type: Date, default: null },
    costPrice: { type: Number, default: 0 },
  },
  opts,
);
batchSchema.index({ orgId: 1, variantId: 1, batchNo: 1 }, { unique: true });
batchSchema.index({ orgId: 1, expiry: 1 });
export const Batch = model("Batch", batchSchema);

/* ---------------- stock ---------------- */

const stockLevelSchema = new Schema(
  {
    orgId,
    locationId: { type: ObjectId, required: true },
    productId: { type: ObjectId, required: true },
    variantId: { type: ObjectId, required: true },
    batchId: { type: ObjectId, default: null },
    qty: { type: Number, required: true, default: 0 },
  },
  opts,
);
stockLevelSchema.index({ orgId: 1, locationId: 1, variantId: 1, batchId: 1 }, { unique: true });
stockLevelSchema.index({ orgId: 1, variantId: 1 });
export const StockLevel = model("StockLevel", stockLevelSchema);

export const MOVE_TYPES = ["opening", "purchase", "purchase_return", "sale", "sale_return", "adjust", "transfer_out", "transfer_in", "count", "void"] as const;
export type MoveType = (typeof MOVE_TYPES)[number];

const stockMoveSchema = new Schema(
  {
    orgId,
    type: { type: String, enum: MOVE_TYPES, required: true },
    productId: { type: ObjectId, required: true },
    variantId: { type: ObjectId, required: true },
    locationId: { type: ObjectId, required: true },
    batchId: { type: ObjectId, default: null },
    qtyDelta: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    ref: { kind: String, id: ObjectId, number: String },
    reason: { type: String, default: "" },
    userId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
stockMoveSchema.index({ orgId: 1, createdAt: -1 });
stockMoveSchema.index({ orgId: 1, variantId: 1, createdAt: -1 });
export const StockMove = model("StockMove", stockMoveSchema);

/* ---------------- parties & payments ---------------- */

const partySchema = new Schema(
  {
    orgId,
    kind: { type: String, enum: ["customer", "supplier"], required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    taxId: { type: String, default: "", trim: true, uppercase: true },
    stateCode: { type: String, default: "" },
    address: { type: address, default: {} },
    creditLimit: { type: Number, default: 0, min: 0 }, // 0 = no limit
    openingBalance: { type: Number, default: 0 },
    balance: { type: Number, default: 0 }, // customers: they owe us; suppliers: we owe them
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  opts,
);
partySchema.index({ orgId: 1, kind: 1, name: 1 });
partySchema.index({ orgId: 1, kind: 1, phone: 1 });
export const Party = model("Party", partySchema);

const paymentSchema = new Schema(
  {
    orgId,
    partyId: { type: ObjectId, required: true },
    direction: { type: String, enum: ["in", "out"], required: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["cash", "card", "upi", "bank", "other"], required: true },
    allocations: { type: [{ docKind: String, docId: ObjectId, number: String, amount: Number, _id: false }], default: [] },
    reference: { type: String, default: "" },
    userId: { type: String, required: true },
  },
  opts,
);
paymentSchema.index({ orgId: 1, partyId: 1, createdAt: -1 });
export const Payment = model("Payment", paymentSchema);

/* ---------------- purchases ---------------- */

const poLineSchema = new Schema(
  {
    productId: { type: ObjectId, required: true },
    variantId: { type: ObjectId, required: true },
    name: String,
    sku: String,
    qtyOrdered: { type: Number, required: true, min: 1 },
    qtyReceived: { type: Number, default: 0 },
    qtyReturned: { type: Number, default: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    rateBp: { type: Number, default: 0 },
    scale: { type: Number, default: 1 },
  },
  { _id: true },
);

const purchaseOrderSchema = new Schema(
  {
    orgId,
    number: { type: String, required: true },
    supplierId: { type: ObjectId, required: true },
    supplierName: String,
    locationId: { type: ObjectId, required: true },
    status: { type: String, enum: ["draft", "ordered", "partial", "received", "cancelled"], default: "ordered" },
    expectedDate: { type: Date, default: null },
    supplierInvoiceNo: { type: String, default: "" },
    notes: { type: String, default: "" },
    lines: [poLineSchema],
    receivedValue: { type: Number, default: 0 }, // incl. tax, owed to supplier
    returnedValue: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    receipts: {
      type: [{ at: Date, userId: String, lines: [{ lineId: ObjectId, qty: Number, batchNo: String, expiry: Date, _id: false }] }],
      default: [],
    },
    createdBy: String,
  },
  opts,
);
purchaseOrderSchema.index({ orgId: 1, number: 1 }, { unique: true });
purchaseOrderSchema.index({ orgId: 1, createdAt: -1 });
purchaseOrderSchema.index({ orgId: 1, supplierId: 1 });
export const PurchaseOrder = model("PurchaseOrder", purchaseOrderSchema);

/* ---------------- sales ---------------- */

const saleLineSchema = new Schema(
  {
    productId: { type: ObjectId, required: true },
    variantId: { type: ObjectId, required: true },
    batchId: { type: ObjectId, default: null },
    batchNo: String,
    name: String,
    sku: String,
    hsn: String,
    unit: String,
    scale: { type: Number, default: 1 },
    qty: { type: Number, required: true },
    unitPrice: Number,
    mrp: Number,
    unitCost: Number,
    inclusive: Boolean,
    rateBp: Number,
    cessBp: Number,
    discount: Number,
    taxable: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    vat: Number,
    cess: Number,
    total: Number,
    returnedQty: { type: Number, default: 0 },
    serials: { type: [String], default: [] },
    sourceLine: { type: Number, default: null }, // index into original sale, for returns
  },
  { _id: false },
);

const salePaymentSchema = new Schema(
  { method: { type: String, enum: ["cash", "card", "upi", "credit", "other"], required: true }, amount: Number, reference: String },
  { _id: false },
);

const saleSchema = new Schema(
  {
    orgId,
    number: { type: String, default: null }, // null while held
    kind: { type: String, enum: ["receipt", "tax_invoice", "return"], required: true },
    status: { type: String, enum: ["held", "completed", "void"], required: true },
    locationId: { type: ObjectId, required: true },
    customerId: { type: ObjectId, default: null },
    customer: { name: String, phone: String, taxId: String, stateCode: String, address: String },
    interState: { type: Boolean, default: false },
    lines: [saleLineSchema],
    billDiscount: { type: Number, default: 0 },
    subtotal: Number,
    discountTotal: Number,
    taxableTotal: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    vat: Number,
    cess: Number,
    taxTotal: Number,
    roundOff: Number,
    grandTotal: Number,
    payments: { type: [salePaymentSchema], default: [] },
    amountPaid: { type: Number, default: 0 }, // tendered minus change, excl. credit
    change: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    returnOf: { type: ObjectId, default: null },
    returnOfNumber: String,
    cashierId: { type: String, required: true },
    cashierName: String,
    notes: { type: String, default: "" },
    voidReason: String,
    completedAt: Date,
    // Offline sales (synced from a till's own series)
    clientId: { type: String, default: null },
    deviceCode: { type: String, default: null },
    syncIssues: { type: [{ code: String, message: String, _id: false }], default: [] },
    // GST e-invoice / e-way bill
    einvoice: {
      status: { type: String, enum: ["none", "generated", "cancelled", "failed"], default: "none" },
      irn: String,
      ackNo: String,
      ackDt: String,
      signedQr: String,
      ewbNo: String,
      ewbDt: String,
      ewbValidTill: String,
      errors: { type: [String], default: [] },
      cancelledAt: Date,
    },
  },
  opts,
);
saleSchema.index({ orgId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: "string" } } });
saleSchema.index({ orgId: 1, "syncIssues.0": 1 }, { sparse: true });
saleSchema.index({ orgId: 1, number: 1 }, { unique: true, partialFilterExpression: { number: { $type: "string" } } });
saleSchema.index({ orgId: 1, status: 1, completedAt: -1 });
saleSchema.index({ orgId: 1, customerId: 1, completedAt: -1 });
saleSchema.index({ orgId: 1, returnOf: 1 });
export const Sale = model("Sale", saleSchema);

/* ---------------- serial numbers ---------------- */

const serialSchema = new Schema(
  {
    orgId,
    productId: { type: ObjectId, required: true },
    variantId: { type: ObjectId, required: true },
    serial: { type: String, required: true, trim: true },
    status: { type: String, enum: ["in_stock", "sold", "returned", "written_off"], default: "in_stock" },
    locationId: { type: ObjectId, required: true },
    purchaseId: { type: ObjectId, default: null },
    saleId: { type: ObjectId, default: null },
    saleNumber: { type: String, default: null },
    customerId: { type: ObjectId, default: null },
    soldAt: { type: Date, default: null },
    warrantyUntil: { type: Date, default: null },
    history: { type: [{ at: Date, event: String, ref: String, _id: false }], default: [] },
  },
  opts,
);
serialSchema.index({ orgId: 1, variantId: 1, serial: 1 }, { unique: true });
serialSchema.index({ orgId: 1, serial: 1 });
serialSchema.index({ orgId: 1, variantId: 1, locationId: 1, status: 1 });
export const SerialNumber = model("SerialNumber", serialSchema);

/* ---------------- devices (offline tills) ---------------- */

const deviceSchema = new Schema(
  {
    orgId,
    code: { type: String, required: true }, // T1, T2, ...
    name: { type: String, default: "" },
    tokenHash: { type: String, required: true },
    lastSeq: { type: Map, of: Number, default: {} }, // per "<docType>:<fy>" highest synced number
    registeredBy: String,
    lastSyncAt: Date,
  },
  opts,
);
deviceSchema.index({ orgId: 1, code: 1 }, { unique: true });
deviceSchema.index({ orgId: 1, tokenHash: 1 }, { unique: true });
export const Device = model("Device", deviceSchema);

/* ---------------- e-invoice credentials ---------------- */

const einvoiceConfigSchema = new Schema(
  {
    orgId: { type: ObjectId, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    environment: { type: String, enum: ["sandbox", "production"], default: "sandbox" },
    baseUrl: { type: String, default: "https://einv-apisandbox.nic.in" },
    paths: {
      auth: { type: String, default: "/eivital/v1.04/auth" },
      invoice: { type: String, default: "/eicore/v1.03/Invoice" },
      cancel: { type: String, default: "/eicore/v1.03/Invoice/Cancel" },
      ewb: { type: String, default: "/eiewb/v1.03/ewaybill" },
    },
    secrets: { type: String, default: "" }, // AES-256-GCM encrypted JSON {clientId, clientSecret, username, password, publicKey}
    token: { type: String, default: "" }, // encrypted {authToken, sek, expiresAt}
  },
  opts,
);
export const EinvoiceConfig = model("EinvoiceConfig", einvoiceConfigSchema);

/* ---------------- system ---------------- */

const counterSchema = new Schema({ orgId, key: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false });
counterSchema.index({ orgId: 1, key: 1 }, { unique: true });
export const Counter = model("Counter", counterSchema);

const auditSchema = new Schema(
  {
    orgId,
    userId: { type: String, required: true },
    userName: String,
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: "" },
    summary: { type: String, default: "" },
    diff: { type: Schema.Types.Mixed, default: null },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
auditSchema.index({ orgId: 1, createdAt: -1 });
export const AuditLog = model("AuditLog", auditSchema);

const scanSessionSchema = new Schema(
  {
    orgId,
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    seq: { type: Number, default: 0 },
    events: { type: [{ code: String, at: Date, _id: false }], default: [] },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);
export const ScanSession = model("ScanSession", scanSessionSchema);

const loginAttemptSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    firstAt: { type: Date, default: Date.now, expires: 15 * 60 },
  },
  { versionKey: false },
);
export const LoginAttempt = model("LoginAttempt", loginAttemptSchema, false);

const rateLimitSchema = new Schema(
  { key: { type: String, required: true, unique: true }, count: { type: Number, default: 0 }, expiresAt: { type: Date, required: true, expires: 0 } },
  { versionKey: false },
);
export const RateLimit = model("RateLimit", rateLimitSchema, false);

export { Types };
export type ProductDoc = InferSchemaType<typeof productSchema> & { _id: Types.ObjectId };
export type VariantDoc = InferSchemaType<typeof variantSchema> & { _id: Types.ObjectId };
export type SaleDoc = InferSchemaType<typeof saleSchema> & { _id: Types.ObjectId; createdAt: Date };
export type OrgSettingsDoc = InferSchemaType<typeof orgSettingsSchema> & { _id: Types.ObjectId };
