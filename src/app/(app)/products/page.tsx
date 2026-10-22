import type { Metadata } from "next";
import Link from "next/link";
import { FolderTree, Package, Plus, Tags } from "lucide-react";
import { formatQty, pageOf } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Category, Product, type ProductDoc } from "@/server/models";
import { stockByVariant } from "@/server/services/stock";
import { FilterSelect, Pagination, SearchInput } from "@/components/app/list-controls";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Products" };
const PAGE_SIZE = 25;

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const ctx = await requireCtx("products:read");
  const sp = await searchParams;
  const settings = await getOrgSettings(ctx.orgId);
  const money = (m: number) => formatMoney(m, settings.currency, settings.locale);
  const page = pageOf(sp.page);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const status = sp.status === "archived" ? false : true;

  const filter: Record<string, unknown> = { orgId: ctx.orgId, active: status };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { brand: rx }, { "variants.sku": rx }, { "variants.barcodes": q }];
  }
  if (typeof sp.category === "string" && /^[a-f0-9]{24}$/.test(sp.category)) filter.categoryId = sp.category;

  const [products, total, categories] = await Promise.all([
    Product.find(filter).sort({ name: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean<ProductDoc[]>(),
    Product.countDocuments(filter),
    Category.find({ orgId: ctx.orgId }).sort({ name: 1 }).lean(),
  ]);
  const stock = await stockByVariant(ctx, products.flatMap((p) => p.variants.map((v) => String(v._id))));
  const catName = new Map(categories.map((c) => [String(c._id), c.name]));
  const canWrite = can(ctx.role, "products:write");

  return (
    <PageBody>
      <PageHeader
        title="Products"
        description="Everything you buy and sell."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/products/labels">
                <Tags /> Print labels
              </Link>
            </Button>
            {canWrite && (
              <>
                <Button asChild variant="outline">
                  <Link href="/products/categories">
                    <FolderTree /> Categories
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/products/new">
                    <Plus /> New product
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search name, SKU or barcode" />
        <FilterSelect param="category" placeholder="All categories" options={categories.map((c) => ({ value: String(c._id), label: c.name }))} />
        <FilterSelect param="status" placeholder="Active" options={[{ value: "archived", label: "Archived" }]} />
      </div>

      {products.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Package />
              </EmptyMedia>
              <EmptyTitle>{q || sp.category ? "No matching products" : "No products yet"}</EmptyTitle>
              <EmptyDescription>{q || sp.category ? "Try a different search or filter." : "Add products one by one, or import a spreadsheet."}</EmptyDescription>
            </EmptyHeader>
            {canWrite && !q && (
              <EmptyContent className="flex-row justify-center">
                <Button asChild>
                  <Link href="/products/new">Add product</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/import">Import CSV / Excel</Link>
                </Button>
              </EmptyContent>
            )}
          </Empty>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead className="hidden md:table-cell">SKU / Barcode</TableHead>
                <TableHead className="hidden lg:table-cell">Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="pr-4 text-right">In stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const qty = p.variants.reduce((a, v) => a + (stock.get(String(v._id)) ?? 0), 0);
                const prices = p.variants.map((v) => v.salePrice);
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                const low = p.reorderLevel > 0 && qty <= p.reorderLevel * (p.unit?.scale ?? 1);
                return (
                  <TableRow key={String(p._id)} className="relative">
                    <TableCell className="pl-4">
                      <Link href={`/products/${p._id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
                          {p.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.images[0]} alt="" className="size-full object-cover" />
                          ) : (
                            <Package className="size-4 text-muted-foreground" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.variants.length > 1 ? `${p.variants.length} variants` : p.brand || p.unit?.code}
                            {p.trackBatch && " · Batch tracked"}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                      {p.variants[0].sku}
                      <br />
                      {p.variants[0].barcodes[0]}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{p.categoryId ? catName.get(String(p.categoryId)) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{min === max ? money(min) : `${money(min)} – ${money(max)}`}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Badge variant={qty <= 0 ? "destructive" : low ? "outline" : "secondary"} className={`tabular-nums ${low && qty > 0 ? "border-warning text-warning-foreground dark:text-warning" : ""}`}>
                        {formatQty(qty, p.unit?.scale)} {p.unit?.code}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} />
    </PageBody>
  );
}
