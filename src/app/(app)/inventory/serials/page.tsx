import type { Metadata } from "next";
import Link from "next/link";
import { ScanBarcode, ShieldCheck, ShieldX } from "lucide-react";
import { formatDate, pageOf } from "@/lib/format";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Location, Party, Product, SerialNumber } from "@/server/models";
import { FilterSelect, Pagination, SearchInput } from "@/components/app/list-controls";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Serial numbers" };
const PAGE = 40;
const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  in_stock: { label: "In stock", variant: "default" },
  sold: { label: "Sold", variant: "secondary" },
  returned: { label: "Returned to supplier", variant: "outline" },
  written_off: { label: "Written off", variant: "destructive" },
};

export default async function SerialsPage({ searchParams }: PageProps<"/inventory/serials">) {
  const ctx = await requireCtx("stock:read");
  const sp = await searchParams;
  const s = await getOrgSettings(ctx.orgId);
  const page = pageOf(sp.page);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 64) : "";
  const filter: Record<string, unknown> = { orgId: ctx.orgId };
  if (q) filter.serial = new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  if (typeof sp.status === "string" && sp.status in STATUS) filter.status = sp.status;
  const [rows, total, locations] = await Promise.all([
    SerialNumber.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
    SerialNumber.countDocuments(filter),
    Location.find({ orgId: ctx.orgId }, { name: 1 }).lean(),
  ]);
  const [products, customers] = await Promise.all([
    Product.find({ orgId: ctx.orgId, _id: { $in: [...new Set(rows.map((r) => String(r.productId)))] } }, { name: 1, variants: 1 }).lean(),
    Party.find({ orgId: ctx.orgId, _id: { $in: rows.map((r) => r.customerId).filter(Boolean) } }, { name: 1 }).lean(),
  ]);
  const loc = new Map(locations.map((l) => [String(l._id), l.name]));
  const cust = new Map(customers.map((c) => [String(c._id), c.name]));
  const name = (r: (typeof rows)[number]) => {
    const p = products.find((x) => String(x._id) === String(r.productId));
    const v = p?.variants.find((x) => String(x._id) === String(r.variantId));
    return [p?.name, v?.name].filter(Boolean).join(" · ") || "Deleted product";
  };
  const exact = q && rows.length === 1 && rows[0].serial.toLowerCase() === q.toLowerCase() ? rows[0] : null;

  return (
    <PageBody>
      <PageHeader title="Serial numbers" description="Look up any serial number or IMEI to see where it is, who bought it and its warranty." back={{ href: "/inventory", label: "Inventory" }} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Scan or type a serial / IMEI" />
        <FilterSelect param="status" placeholder="Any status" options={Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label }))} />
      </div>

      {exact && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 font-mono">{exact.serial} <Badge variant={STATUS[exact.status].variant}>{STATUS[exact.status].label}</Badge></CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Product</dt><dd><Link className="hover:underline" href={`/products/${exact.productId}`}>{name(exact)}</Link></dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Location</dt><dd>{loc.get(String(exact.locationId)) ?? "—"}</dd></div>
              {exact.saleId && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Sold on</dt><dd><Link className="hover:underline" href={`/sales/${exact.saleId}`}>{exact.saleNumber}</Link> · {formatDate(exact.soldAt!, s.timezone, s.locale)}</dd></div>}
              {exact.customerId && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Customer</dt><dd><Link className="hover:underline" href={`/customers/${exact.customerId}`}>{cust.get(String(exact.customerId))}</Link></dd></div>}
              {exact.purchaseId && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Purchased via</dt><dd><Link className="hover:underline" href={`/purchases/${exact.purchaseId}`}>Purchase order</Link></dd></div>}
              {exact.warrantyUntil && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Warranty</dt>
                  <dd className={`flex items-center gap-1 ${exact.warrantyUntil > new Date() ? "text-success" : "text-destructive"}`}>
                    {exact.warrantyUntil > new Date() ? <ShieldCheck className="size-4" /> : <ShieldX className="size-4" />}
                    {exact.warrantyUntil > new Date() ? "Valid until" : "Expired on"} {formatDate(exact.warrantyUntil, s.timezone, s.locale)}
                  </dd>
                </div>
              )}
            </dl>
            <ol className="space-y-2 border-l pl-4 text-sm">
              {[...exact.history].reverse().map((h, i) => (
                <li key={i}>
                  <span className="font-medium capitalize">{h.event}</span> {h.ref && <span className="text-muted-foreground">· {h.ref}</span>}
                  <span className="block text-xs text-muted-foreground">{formatDate(h.at!, s.timezone, s.locale, true)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><ScanBarcode /></EmptyMedia>
              <EmptyTitle>{q ? "No serial found" : "No serial numbers yet"}</EmptyTitle>
              <EmptyDescription>Turn on “Track serial numbers / IMEI” for a product, then receive it through a purchase or a stock adjustment.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">Serial</TableHead><TableHead>Product</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Where / who</TableHead><TableHead className="hidden pr-4 lg:table-cell">Warranty</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={String(r._id)}>
                  <TableCell className="pl-4 font-mono"><Link className="hover:underline" href={`/inventory/serials?q=${encodeURIComponent(r.serial)}`}>{r.serial}</Link></TableCell>
                  <TableCell>{name(r)}</TableCell>
                  <TableCell><Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge></TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{r.status === "sold" ? (r.customerId ? cust.get(String(r.customerId)) : `Bill ${r.saleNumber}`) : loc.get(String(r.locationId))}</TableCell>
                  <TableCell className="hidden pr-4 text-muted-foreground lg:table-cell">{r.warrantyUntil ? formatDate(r.warrantyUntil, s.timezone, s.locale) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE} total={total} searchParams={sp} />
    </PageBody>
  );
}
