import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { getVariantHits } from "@/server/services/products";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { LabelDesigner } from "@/components/products/label-designer";

export const metadata: Metadata = { title: "Barcode labels" };

export default async function LabelsPage({ searchParams }: PageProps<"/products/labels">) {
  const ctx = await requireCtx("products:read");
  const { ids } = await searchParams;
  const list = typeof ids === "string" ? ids.split(",").filter((x) => /^[a-f0-9]{24}$/.test(x)).slice(0, 100) : [];
  const initial = list.length ? await getVariantHits(ctx, list) : [];
  return (
    <PageBody>
      <PageHeader title="Barcode labels" description="Print barcode stickers on A4 label sheets or a thermal label printer." back={{ href: "/products", label: "Products" }} />
      <LabelDesigner initial={initial.map((h) => ({ variantId: h.variantId, name: [h.name, h.variantName].filter(Boolean).join(" - "), barcode: h.barcode, price: h.salePrice, mrp: h.mrp, copies: 1 }))} />
    </PageBody>
  );
}
