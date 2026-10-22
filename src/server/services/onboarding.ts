import "server-only";
import { randomBytes } from "node:crypto";
import type { Ctx } from "../context";
import { Category, Location, OrgSettings, TaxRate } from "../models";
import { createProduct } from "./products";
import { saveParty } from "./parties";

export interface OnboardingInput {
  name: string;
  businessType: string;
  currency: string;
  locale: string;
  timezone: string;
  taxMode: "GST" | "VAT" | "NONE";
  taxId: string;
  stateCode: string;
  locationName: string;
  sample: boolean;
}

export const slugify = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "business"}-${randomBytes(3).toString("hex")}`;

const TAX_PRESETS = {
  GST: [
    ["GST 0%", 0, 0], ["GST 5%", 500, 0], ["GST 12%", 1200, 0], ["GST 18%", 1800, 0], ["GST 28%", 2800, 0], ["GST 28% + Cess 12%", 2800, 1200],
  ],
  VAT: [["Zero rated", 0, 0], ["5%", 500, 0], ["10%", 1000, 0], ["15%", 1500, 0], ["20%", 2000, 0]],
  NONE: [["No tax", 0, 0]],
} as const;

/** Called after Better Auth created the organization (ctx.orgId is the new org). */
export async function initializeBusiness(ctx: Ctx, input: OnboardingInput) {
  await OrgSettings.create({
    orgId: ctx.orgId, businessType: input.businessType, currency: input.currency, locale: input.locale, timezone: input.timezone,
    taxMode: input.taxMode, taxId: input.taxId, stateCode: input.stateCode, pricesIncludeTax: input.taxMode !== "VAT",
    fiscalYearStartMonth: input.currency === "INR" ? 4 : 1,
  });
  const [loc] = await Location.create([{ orgId: ctx.orgId, name: input.locationName, kind: "store", isDefault: true }]);
  const rates = await TaxRate.insertMany(
    TAX_PRESETS[input.taxMode].map(([name, rateBp, cessBp], i) => ({ orgId: ctx.orgId, name, rateBp, cessBp, isDefault: input.taxMode === "GST" ? i === 3 : i === 0 })),
  );
  if (input.sample) await seedSample(ctx, String(loc._id), rates.map((r) => String(r._id)));
}

async function seedSample(ctx: Ctx, locationId: string, rateIds: string[]) {
  const [general, beverages] = await Category.insertMany([
    { orgId: ctx.orgId, name: "General" },
    { orgId: ctx.orgId, name: "Beverages" },
  ]);
  const rate = (i: number) => rateIds[Math.min(i, rateIds.length - 1)];
  const items: [string, string, number, number, number, string, string | null][] = [
    ["Mineral Water 1L", "8901234567892", 1500, 2000, 120, String(beverages._id), rate(2)],
    ["Cold Coffee 250ml", "8901234567908", 3500, 4500, 48, String(beverages._id), rate(2)],
    ["Notebook A5 (100 pages)", "8901234567915", 4000, 6000, 60, String(general._id), rate(2)],
    ["Ball Pen Blue", "8901234567922", 600, 1000, 200, String(general._id), rate(2)],
    ["Hand Sanitizer 100ml", "8901234567939", 4500, 7500, 35, String(general._id), rate(3)],
  ];
  for (const [name, barcode, cost, price, qty, categoryId, taxRateId] of items) {
    await createProduct(ctx, {
      name, description: "", categoryId, brand: "", unitCode: "pcs", unitScale: 1, hsn: "", taxRateId, priceIncludesTax: true, trackBatch: false,
      reorderLevel: 10, images: [], active: true, openingLocationId: locationId,
      variants: [{ name: "", sku: "", barcodes: [barcode], attributes: [], costPrice: cost, salePrice: price, mrp: price, active: true, openingQty: qty }],
    });
  }
  await createProduct(ctx, {
    name: "Cotton T-Shirt", description: "", categoryId: String(general._id), brand: "StockPilot", unitCode: "pcs", unitScale: 1, hsn: "6109", taxRateId: rate(1),
    priceIncludesTax: true, trackBatch: false, reorderLevel: 5, images: [], active: true, openingLocationId: locationId,
    variants: ["S", "M", "L"].map((size) => ({ name: size, sku: "", barcodes: [], attributes: [{ name: "Size", value: size }], costPrice: 25000, salePrice: 49900, mrp: 59900, active: true, openingQty: 20 })),
  });
  await saveParty(ctx, null, { kind: "customer", name: "Walk-in Regular", phone: "9876543210", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 500000, openingBalance: 0, notes: "" });
  await saveParty(ctx, null, { kind: "supplier", name: "Acme Distributors", phone: "9123456780", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 0, openingBalance: 0, notes: "" });
}
