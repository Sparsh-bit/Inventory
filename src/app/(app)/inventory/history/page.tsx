import type { Metadata } from "next";
import Link from "next/link";
import { Download, History } from "lucide-react";
import { formatDate, formatQty, pageOf } from "@/lib/format";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Location, Product, StockMove } from "@/server/models";
import { parseRange } from "@/server/services/reports";
import { DateRange } from "@/components/app/date-range";
import { FilterSelect, Pagination } from "@/components/app/list-controls";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Stock movements" };
const PAGE = 50;
const LABEL: Record<string, string> = {
  opening: "Opening stock", purchase: "Purchase", purchase_return: "Purchase return", sale: "Sale", sale_return: "Sale return",
  adjust: "Adjustment", transfer_out: "Transfer out", transfer_in: "Transfer in", count: "Stock count", void: "Voided sale",
};
const REF_HREF: Record<string, string> = { sale: "/sales/", return: "/sales/", purchase: "/purchases/", product: "/products/" };

export default async function HistoryPage({ searchParams }: PageProps<"/inventory/history">) {
  const ctx = await requireCtx("stock:read");
  const sp = await searchParams;
  const s = await getOrgSettings(ctx.orgId);
  const range = parseRange(s.timezone, sp.from as string, sp.to as string);
  const page = pageOf(sp.page);
  const filter: Record<string, unknown> = { orgId: ctx.orgId, createdAt: { $gte: range.start, $lt: range.end } };
  if (typeof sp.type === "string" && sp.type in LABEL) filter.type = sp.type;
  if (typeof sp.product === "string" && /^[a-f0-9]{24}$/.test(sp.product)) {
    filter.productId = sp.product;
    delete filter.createdAt;
  }
  const [moves, total, locations] = await Promise.all([
    StockMove.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
    StockMove.countDocuments(filter),
    Location.find({ orgId: ctx.orgId }, { name: 1 }).lean(),
  ]);
  const products = await Product.find({ orgId: ctx.orgId, _id: { $in: [...new Set(moves.map((m) => String(m.productId)))] } }, { name: 1, unit: 1, variants: 1 }).lean();
  const prod = new Map(products.map((p) => [String(p._id), p]));
  const loc = new Map(locations.map((l) => [String(l._id), l.name]));

  return (
    <PageBody>
      <PageHeader
        title="Stock movements"
        description="Every change to stock, with who did it and why."
        back={{ href: "/inventory", label: "Inventory" }}
        actions={<Button asChild variant="outline"><a href={`/api/export/movements?from=${range.from}&to=${range.to}`} download><Download /> Export</a></Button>}
      />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <FilterSelect param="type" placeholder="All movement types" options={Object.entries(LABEL).map(([value, label]) => ({ value, label }))} />
        {!sp.product && <DateRange from={range.from} to={range.to} today={range.today} />}
        {sp.product && <Button asChild variant="ghost" size="sm"><Link href="/inventory/history">Show all products</Link></Button>}
      </div>
      {moves.length === 0 ? (
        <Card><Empty><EmptyHeader><EmptyMedia variant="icon"><History /></EmptyMedia><EmptyTitle>No movements in this period</EmptyTitle></EmptyHeader></Empty></Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">When</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="hidden lg:table-cell">Reference</TableHead>
                <TableHead className="pr-4 text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moves.map((m) => {
                const p = prod.get(String(m.productId));
                const v = p?.variants.find((x) => String(x._id) === String(m.variantId));
                const href = m.ref?.kind && m.ref.id ? REF_HREF[m.ref.kind] : undefined;
                return (
                  <TableRow key={String(m._id)}>
                    <TableCell className="pl-4 whitespace-nowrap text-muted-foreground">{formatDate(m.createdAt, s.timezone, s.locale, true)}</TableCell>
                    <TableCell>
                      {p ? <Link href={`/products/${p._id}`} className="hover:underline">{p.name}</Link> : "Deleted product"}
                      {v?.name && <span className="text-muted-foreground"> · {v.name}</span>}
                      <span className="block text-xs text-muted-foreground md:hidden">{LABEL[m.type]}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{LABEL[m.type]}{m.reason && <span className="block text-xs text-muted-foreground">{m.reason}</span>}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{loc.get(String(m.locationId))}</TableCell>
                    <TableCell className="hidden lg:table-cell">{href && m.ref?.number ? <Link className="hover:underline" href={`${href}${m.ref.id}`}>{m.ref.number}</Link> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className={`pr-4 text-right font-medium tabular-nums ${m.qtyDelta < 0 ? "text-destructive" : "text-success"}`}>
                      {m.qtyDelta > 0 ? "+" : ""}{formatQty(m.qtyDelta, p?.unit?.scale ?? 1)} {p?.unit?.code}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE} total={total} searchParams={sp} />
    </PageBody>
  );
}
