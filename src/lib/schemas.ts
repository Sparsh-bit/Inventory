import { z } from "zod";

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
const money = z.number().int("Invalid amount").min(0, "Must be 0 or more").max(1e13);
const trimmed = (max: number) => z.string().trim().max(max);
const code = z.string().trim().max(64).regex(/^[\x21-\x7e]*$/, "Only letters, digits and symbols, no spaces");

export const addressSchema = z
  .object({
    line1: trimmed(200).optional(),
    line2: trimmed(200).optional(),
    city: trimmed(100).optional(),
    state: trimmed(100).optional(),
    postalCode: trimmed(20).optional(),
    country: trimmed(100).optional(),
  })
  .strict();

export const variantInput = z
  .object({
    id: objectId.optional(),
    name: trimmed(120).default(""),
    sku: code.default(""),
    barcodes: z.array(code.min(1)).max(10).default([]),
    attributes: z.array(z.object({ name: trimmed(40).min(1), value: trimmed(60).min(1) }).strict()).max(5).default([]),
    costPrice: money.default(0),
    salePrice: money,
    mrp: money.default(0),
    active: z.boolean().default(true),
    openingQty: z.number().int().min(0).max(1e9).default(0),
    // Batch-tracked products: the batch the opening stock belongs to.
    openingBatchNo: trimmed(64).optional(),
    openingExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").nullable().optional(),
  })
  .strict();

export const productInput = z
  .object({
    name: trimmed(200).min(1, "Name is required"),
    description: trimmed(2000).default(""),
    categoryId: objectId.nullable().default(null),
    brand: trimmed(100).default(""),
    unitCode: trimmed(10).min(1).default("pcs"),
    unitScale: z.union([z.literal(1), z.literal(1000)]).default(1),
    hsn: z.string().trim().regex(/^(\d{4}|\d{6}|\d{8})?$/, "HSN/SAC must be 4, 6 or 8 digits").default(""),
    taxRateId: objectId.nullable().default(null),
    priceIncludesTax: z.boolean().default(true),
    trackBatch: z.boolean().default(false),
    trackSerial: z.boolean().default(false),
    warrantyMonths: z.number().int().min(0).max(600).default(0),
    reorderLevel: z.number().int().min(0).max(1e9).default(0),
    images: z.array(z.string().regex(/^\/api\/files\/(?:[a-f0-9]{24}\/)?[a-f0-9]{32}\.(webp|png|jpg)$/)).max(6).default([]),
    active: z.boolean().default(true),
    variants: z.array(variantInput).min(1).max(100),
    openingLocationId: objectId.optional(),
  })
  .strict()
  .refine((p) => !(p.trackSerial && p.trackBatch), { message: "Choose either batch tracking or serial numbers, not both", path: ["trackSerial"] })
  .refine((p) => !(p.trackSerial && p.unitScale !== 1), { message: "Serial-numbered items must be counted in whole units", path: ["trackSerial"] });
export type ProductInput = z.input<typeof productInput>;

export const partyInput = z
  .object({
    kind: z.enum(["customer", "supplier"]),
    name: trimmed(200).min(1, "Name is required"),
    phone: z.string().trim().regex(/^[+\d][\d\s-]{5,19}$|^$/, "Invalid phone").default(""),
    email: z.union([z.email("Invalid email"), z.literal("")]).default(""),
    taxId: z.string().trim().toUpperCase().max(20).default(""),
    stateCode: z.string().regex(/^(\d{2})?$/).default(""),
    address: addressSchema.default({}),
    creditLimit: money.default(0),
    openingBalance: z.number().int().min(-1e13).max(1e13).default(0),
    notes: trimmed(1000).default(""),
  })
  .strict();
export type PartyInput = z.input<typeof partyInput>;

export const saleLineInput = z
  .object({
    variantId: objectId,
    qty: z.number().int().min(1, "Quantity must be positive").max(1e9),
    unitPrice: money.optional(), // honoured only with price:override
    discount: money.default(0),
    batchId: objectId.nullable().optional(),
    serials: z.array(z.string().trim().min(1).max(64)).max(500).optional(),
  })
  .strict();

export const PAYMENT_METHODS = ["cash", "card", "upi", "credit", "other"] as const;

export const saleInput = z
  .object({
    locationId: objectId,
    customerId: objectId.nullable().default(null),
    lines: z.array(saleLineInput).min(1, "Add at least one item").max(500),
    billDiscount: money.default(0),
    payments: z.array(z.object({ method: z.enum(PAYMENT_METHODS), amount: money, reference: trimmed(100).default("") }).strict()).max(10).default([]),
    kind: z.enum(["receipt", "tax_invoice"]).default("receipt"),
    notes: trimmed(500).default(""),
    heldId: objectId.optional(),
    clientId: z.uuid().optional(), // lets an offline retry recognise a bill the server already saved
  })
  .strict();
export type SaleInput = z.input<typeof saleInput>;

export const settingsInput = z
  .object({
    name: trimmed(120).min(2),
    businessType: trimmed(40),
    legalName: trimmed(200).default(""),
    taxId: z.string().trim().toUpperCase().max(20).default(""),
    stateCode: z.string().regex(/^(\d{2})?$/).default(""),
    address: addressSchema.default({}),
    phone: trimmed(20).default(""),
    email: z.union([z.email(), z.literal("")]).default(""),
    currency: z.string().regex(/^[A-Z]{3}$/),
    locale: trimmed(20),
    timezone: trimmed(60),
    taxMode: z.enum(["GST", "VAT", "NONE"]),
    pricesIncludeTax: z.boolean(),
    roundOff: z.boolean(),
    allowNegativeStock: z.boolean(),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    invoiceTerms: trimmed(2000).default(""),
  })
  .strict();
export type SettingsInput = z.input<typeof settingsInput>;

export const receiptSettingsInput = z
  .object({
    paperWidth: z.union([z.literal(58), z.literal(80)]),
    header: trimmed(300),
    footer: trimmed(300),
    showHsn: z.boolean(),
    showUpiQr: z.boolean(),
    upiId: z.string().trim().regex(/^([\w.-]{2,256}@[a-zA-Z]{2,64})?$/, "Invalid UPI ID"),
    prefixes: z
      .object({
        sale: z.string().regex(/^[A-Z0-9]{1,4}$/, "1-4 capital letters/digits"),
        invoice: z.string().regex(/^[A-Z0-9]{1,4}$/, "1-4 capital letters/digits"),
        return: z.string().regex(/^[A-Z0-9]{1,4}$/, "1-4 capital letters/digits"),
        purchase: z.string().regex(/^[A-Z0-9]{1,4}$/, "1-4 capital letters/digits"),
      })
      .strict()
      // Bills, invoices and credit notes share one number space, so their prefixes must differ.
      .refine((p) => new Set([p.sale, p.invoice, p.return]).size === 3, { message: "Receipt, invoice and return prefixes must all be different", path: ["invoice"] }),
    scanner: z.object({ interKeyMs: z.number().int().min(5).max(200), minLength: z.number().int().min(2).max(20) }).strict(),
  })
  .strict();

export const BUSINESS_TYPES = [
  "Retail store", "Grocery / Supermarket", "Pharmacy", "Restaurant / Café", "Apparel & Footwear", "Electronics",
  "Hardware", "Stationery & Books", "Wholesale / Distribution", "Warehouse", "Salon / Services", "Other",
] as const;

export const INDIAN_STATES: [string, string][] = [
  ["01", "Jammu & Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh"], ["05", "Uttarakhand"],
  ["06", "Haryana"], ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"], ["10", "Bihar"], ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"], ["13", "Nagaland"], ["14", "Manipur"], ["15", "Mizoram"], ["16", "Tripura"],
  ["17", "Meghalaya"], ["18", "Assam"], ["19", "West Bengal"], ["20", "Jharkhand"], ["21", "Odisha"],
  ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"], ["24", "Gujarat"], ["26", "Dadra & Nagar Haveli and Daman & Diu"],
  ["27", "Maharashtra"], ["29", "Karnataka"], ["30", "Goa"], ["31", "Lakshadweep"], ["32", "Kerala"],
  ["33", "Tamil Nadu"], ["34", "Puducherry"], ["35", "Andaman & Nicobar Islands"], ["36", "Telangana"],
  ["37", "Andhra Pradesh"], ["38", "Ladakh"], ["97", "Other Territory"],
];
