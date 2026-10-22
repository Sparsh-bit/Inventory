import "server-only";
import type { Ctx } from "@/server/context";
import { getOrgSettings } from "@/server/context";
import { Category, Location, TaxRate } from "@/server/models";

export async function productFormData(ctx: Ctx) {
  const [categories, taxRates, locations, settings] = await Promise.all([
    Category.find({ orgId: ctx.orgId }).sort({ name: 1 }).lean(),
    TaxRate.find({ orgId: ctx.orgId }).sort({ rateBp: 1, cessBp: 1 }).lean(),
    Location.find({ orgId: ctx.orgId, active: true }).sort({ isDefault: -1, name: 1 }).lean(),
    getOrgSettings(ctx.orgId),
  ]);
  return {
    categories: categories.map((c) => ({ id: String(c._id), name: c.name })),
    taxRates: taxRates.map((t) => ({ id: String(t._id), name: t.name })),
    locations: locations.map((l) => ({ id: String(l._id), name: l.name, isDefault: l.isDefault })),
    defaults: { priceIncludesTax: settings.pricesIncludeTax, taxRateId: taxRates.find((t) => t.isDefault) ? String(taxRates.find((t) => t.isDefault)!._id) : null },
  };
}
