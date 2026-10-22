import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Boxes, ClipboardCheck, Download, SlidersHorizontal } from "lucide-react";
import { formatQty, pageOf } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Location, Product, StockLevel, Types, type ProductDoc } from "@/server/models";
import { lowStock } from "@/server/services/reports";
import { FilterSelect, Pagination, SearchInput } from "@/components/app/list-controls";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Wallet } from "lucide-react";

export const metadata: Metadata = { title: "Inventory" };
const PAGE = 40;

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const ctx = await requireCtx("stock:read");
  const sp = await searchParams;
  const s = await getOrgSettings(ctx.orgId);
  const money = (m: number) => formatMoney(m, s.currency, s.locale);
  const page = pageOf(sp.page);
  const locations = await Location.find({ orgId: ctx.orgId }, { name: 1 }).sort({ isDefault: -1, name: 1 }).lean();
  const locationId = typeof sp.location === "string" && locations.some((l) => String(l._id) === sp.location) ? sp.location : null;
  const showCost = can(ctx.role, "cost:read");
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const low = sp.filter === "low";

  let variantFilter: Set<string> | null = null;
  if (low) variantFilter = new Set((await lowStock(ctx, 2000)).map((r) => String(r.variantId)));

  const pFilter: Record<string, unknown> = { orgId: ctx.orgId, active: true };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    pFilter.$or = [{ name: rx }, { "variants.sku": rx }, { "variants.barcodes": q }];
  }
  if (variantFilter) pFilter["variants._id"] = { $in: [...variantFilter] };
  const [products, total] = await Promise.all([
    Product.find(pFilter, { name: 1, unit: 1, reorderLevel: 1, variants: 1, trackBatch: 1 }).sort({ name: 1 }).skip((page - 1) * PAGE).limit(PAGE).lean<ProductDoc[]>(),
    Product.countDocuments(pFilter),
  ]);
  const variantIds = products.flatMap((p) => p.variants.map((v) => v._id));
  const levelMatch: Record<string, unknown> = { orgId: new Types.ObjectId(ctx.orgId), variantId: { $in: variantIds } };
  if (locationId) levelMatch.locationId = new Types.ObjectId(locationId);
  const levels = await StockLevel.aggregate<{ _id: { v: Types.ObjectId; l: Types.ObjectId }; qty: number }>([{ $match: levelMatch }, { $group: { _id: { v: "$variantId", l: "$locationId" }, qty: { $sum: "$qty" } } }]);
  const qtyOf = (v: string, l?: string) => levels.filter((x) => String(x._id.v) === v && (!l || String(x._id.l) === l)).reduce((a, x) => a + x.qty, 0);
  const shownLocations = locationId ? locations.filter((l) => String(l._id) === locationId) : locations;

  // Totals across the whole catalogue (not just this page).
  const allMatch: Record<string, unknown> = { orgId: new Types.ObjectId(ctx.orgId) };
  if (locationId) allMatch.locationId = new Types.ObjectId(locationId);
  const totals = await StockLevel.aggregate<{ _id: Types.ObjectId; qty: number }>([{ $match: allMatch }, { $group: { _id: "$variantId", qty: { $sum: "$qty" } } }]);
  const allProducts = showCost ? await Product.find({ orgId: ctx.orgId }, { variants: 1, unit: 1 }).lean<ProductDoc[]>() : [];
  const cost = new Map(allProducts.flatMap((p) => p.variants.map((v) => [String(v._id), { c: v.costPrice ?? 0, s: p.unit?.scale ?? 1 }] as const)));
  const stockValue = totals.reduce((a, t) => a + (t.qty > 0 ? Math.round(((cost.get(String(t._id))?.c ?? 0) * t.qty) / (cost.get(String(t._id))?.s ?? 1)) : 0), 0);
  const lowCount = (await lowStock(ctx, 2000)).length;
  const canWrite = can(ctx.role, "stock:write");

  return (
    <PageBody>
      <PageHeader
        title="Inventory"
        description="Stock on hand across your locations."
        actions={
          <>
            <Button asChild variant="outline"><a href={`/api/export/stock${locationId ? `?location=${locationId}` : ""}`} download><Download /> Export</a></Button>
            {canWrite && (
              <>
                <Button asChild variant="outline"><Link href="/inventory/count"><ClipboardCheck /> Count</Link></Button>
                <Button asChild variant="outline"><Link href="/inventory/transfer"><ArrowLeftRight /> Transfer</Link></Button>
                <Button asChild><Link href="/inventory/adjust"><SlidersHorizontal /> Adjust</Link></Button>
              </>
            )}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Items in stock" value={String(totals.filter((t) => t.qty > 0).length)} icon={Boxes} />
        {showCost && <StatCard label="Stock value (cost)" value={money(stockValue)} icon={Wallet} />}
        <StatCard label="Low / out of stock" value={String(lowCount)} icon={AlertTriangle} tone={lowCount ? "warning" : "default"} />
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search name, SKU or barcode" />
        {locations.length > 1 && <FilterSelect param="location" placeholder="All locations" options={locations.map((l) => ({ value: String(l._id), label: l.name }))} />}
        <FilterSelect param="filter" placeholder="All items" options={[{ value: "low", label: "Low stock only" }]} />
      </div>
      {products.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Boxes /></EmptyMedia>
              <EmptyTitle>{low ? "Nothing is running low" : "No products found"}</EmptyTitle>
              <EmptyDescription>{low ? "All items are above their reorder level." : "Add products to start tracking stock."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        <Card className="overflow-x-auto py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Item</TableHead>
                {shownLocations.length > 1 && shownLocations.map((l) => <TableHead key={String(l._id)} className="hidden text-right md:table-cell">{l.name}</TableHead>)}
                <TableHead className="pr-4 text-right">{locationId ? "In stock" : "Total"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.flatMap((p) =>
                p.variants.filter((v) => !variantFilter || variantFilter.has(String(v._id))).map((v) => {
                  const total = qtyOf(String(v._id), locationId ?? undefined);
                  const scale = p.unit?.scale ?? 1;
                  const isLow = p.reorderLevel > 0 && total <= p.reorderLevel * scale;
                  return (
                    <TableRow key={String(v._id)}>
                      <TableCell className="pl-4">
                        <Link href={`/products/${p._id}`} className="font-medium hover:underline">{p.name}</Link>
                        {v.name && <span className="text-muted-foreground"> · {v.name}</span>}
                        <span className="block font-mono text-xs text-muted-foreground">{v.sku}{p.trackBatch && " · batches"}</span>
                      </TableCell>
                      {shownLocations.length > 1 && shownLocations.map((l) => <TableCell key={String(l._id)} className="hidden text-right tabular-nums md:table-cell">{formatQty(qtyOf(String(v._id), String(l._id)), scale)}</TableCell>)}
                      <TableCell className="pr-4 text-right">
                        <Badge variant={total <= 0 ? "destructive" : isLow ? "outline" : "secondary"} className={`tabular-nums ${isLow && total > 0 ? "border-warning text-warning-foreground dark:text-warning" : ""}`}>
                          {formatQty(total, scale)} {p.unit?.code}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                }),
              )}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE} total={total} searchParams={sp} />
    </PageBody>
  );
}
