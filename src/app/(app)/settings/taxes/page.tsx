import type { Metadata } from "next";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Product, TaxRate, Types } from "@/server/models";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { TaxRateEditor } from "@/components/settings/list-editors";

export const metadata: Metadata = { title: "Tax rates" };

export default async function TaxesPage() {
  const ctx = await requireCtx("settings:manage");
  const [s, rates, counts] = await Promise.all([
    getOrgSettings(ctx.orgId),
    TaxRate.find({ orgId: ctx.orgId }).sort({ rateBp: 1, cessBp: 1 }).lean(),
    Product.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { orgId: new Types.ObjectId(ctx.orgId), taxRateId: { $ne: null } } }, { $group: { _id: "$taxRateId", n: { $sum: 1 } } }]),
  ]);
  const n = new Map(counts.map((c) => [String(c._id), c.n]));
  return (
    <PageBody className="max-w-3xl">
      <PageHeader title="Tax rates" description={s.taxMode === "GST" ? "GST is split into CGST + SGST for sales within your state and IGST for other states automatically." : "Rates applied to products."} back={{ href: "/settings", label: "Settings" }} />
      <TaxRateEditor gst={s.taxMode === "GST"} rates={rates.map((r) => ({ id: String(r._id), name: r.name, rateBp: r.rateBp, cessBp: r.cessBp ?? 0, isDefault: r.isDefault, products: n.get(String(r._id)) ?? 0 }))} />
    </PageBody>
  );
}
