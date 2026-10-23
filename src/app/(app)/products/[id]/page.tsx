import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { History, Tags } from "lucide-react";
import { formatDate, formatQty } from "@/lib/format";
import { can, seesCost } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Location, Product, StockLevel, StockMove, type ProductDoc } from "@/server/models";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { ArchiveButton } from "@/components/products/archive-button";
import { ProductForm } from "@/components/products/product-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { productFormData } from "../form-data";

export const metadata: Metadata = { title: "Product" };

const MOVE_LABEL: Record<string, string> = {
  opening: "Opening stock", purchase: "Purchase", purchase_return: "Purchase return", sale: "Sale", sale_return: "Sale return",
  adjust: "Adjustment", transfer_out: "Transfer out", transfer_in: "Transfer in", count: "Stock count", void: "Void",
};

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const ctx = await requireCtx("products:read");
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const p = await Product.findOne({ orgId: ctx.orgId, _id: id }).lean<ProductDoc>();
  if (!p) notFound();
  const settings = await getOrgSettings(ctx.orgId);
  const [formData, levels, locations, moves] = await Promise.all([
    productFormData(ctx),
    StockLevel.find({ orgId: ctx.orgId, productId: p._id }).lean(),
    Location.find({ orgId: ctx.orgId }).lean(),
    StockMove.find({ orgId: ctx.orgId, productId: p._id }).sort({ createdAt: -1 }).limit(12).lean(),
  ]);
  const locName = new Map(locations.map((l) => [String(l._id), l.name]));
  const scale = p.unit?.scale ?? 1;
  const byLocation = new Map<string, number>();
  for (const l of levels) byLocation.set(String(l.locationId), (byLocation.get(String(l.locationId)) ?? 0) + l.qty);
  const variantName = new Map(p.variants.map((v) => [String(v._id), v.name]));
  const canWrite = can(ctx.role, "products:write");

  const product = {
    id: String(p._id), name: p.name, description: p.description ?? "", categoryId: p.categoryId ? String(p.categoryId) : null, brand: p.brand ?? "",
    unitCode: p.unit?.code ?? "pcs", unitScale: (scale === 1000 ? 1000 : 1) as 1 | 1000, hsn: p.hsn ?? "", taxRateId: p.taxRateId ? String(p.taxRateId) : null,
    priceIncludesTax: p.priceIncludesTax, trackBatch: p.trackBatch, trackSerial: !!p.trackSerial, warrantyMonths: p.warrantyMonths ?? 0, reorderLevel: p.reorderLevel, images: p.images ?? [], active: p.active,
    variants: p.variants.map((v) => ({ id: String(v._id), name: v.name ?? "", sku: v.sku, barcodes: v.barcodes, attributes: (v.attributes ?? []).map((a) => ({ name: a.name ?? "", value: a.value ?? "" })), costPrice: seesCost(ctx.role) ? (v.costPrice ?? 0) : 0, salePrice: v.salePrice, mrp: v.mrp ?? 0, active: v.active, openingQty: 0 })),
  };

  return (
    <PageBody>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {p.name} {!p.active && <Badge variant="secondary">Archived</Badge>}
          </span>
        }
        back={{ href: "/products", label: "Products" }}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/products/labels?ids=${p.variants.map((v) => v._id).join(",")}`}>
                <Tags /> Labels
              </Link>
            </Button>
            {canWrite && <ArchiveButton id={String(p._id)} active={p.active} />}
          </>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stock by location</CardTitle>
          </CardHeader>
          <CardContent>
            {byLocation.size === 0 ? (
              <p className="text-sm text-muted-foreground">No stock recorded yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {[...byLocation].map(([loc, qty]) => (
                  <li key={loc} className="flex justify-between py-2">
                    <span>{locName.get(loc) ?? "Unknown"}</span>
                    <span className="tabular-nums font-medium">
                      {formatQty(qty, scale)} {p.unit?.code}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4" /> Recent movements
            </CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/inventory/history?product=${p._id}`}>View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {moves.length === 0 ? (
              <p className="text-sm text-muted-foreground">No movements yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {moves.map((m) => (
                  <li key={String(m._id)} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">
                      {MOVE_LABEL[m.type]}
                      {variantName.get(String(m.variantId)) && <span className="text-muted-foreground"> · {variantName.get(String(m.variantId))}</span>}
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(m.createdAt, settings.timezone, settings.locale, true)} {m.ref?.number && `· ${m.ref.number}`}
                      </span>
                    </span>
                    <span className={`tabular-nums font-medium ${m.qtyDelta < 0 ? "text-destructive" : "text-success"}`}>
                      {m.qtyDelta > 0 ? "+" : ""}
                      {formatQty(m.qtyDelta, scale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canWrite ? (
        <ProductForm product={product} {...formData} />
      ) : (
        <Card>
          <CardContent className="grid gap-2 pt-6 text-sm">
            {p.variants.map((v) => (
              <div key={String(v._id)} className="flex justify-between">
                <span>{v.name || p.name}</span>
                <span className="font-mono text-muted-foreground">{v.barcodes[0]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </PageBody>
  );
}
