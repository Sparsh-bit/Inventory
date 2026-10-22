import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatQty, PAYMENT_LABELS } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Location, Sale, type SaleDoc } from "@/server/models";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { MarkReviewedButton, SaleActions } from "@/components/sales/sale-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Sale" };

export default async function SalePage({ params }: PageProps<"/sales/[id]">) {
  const ctx = await requireCtx("sales:read");
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const sale = await Sale.findOne({ orgId: ctx.orgId, _id: id, status: { $ne: "held" } }).lean<SaleDoc>();
  if (!sale) notFound();
  const s = await getOrgSettings(ctx.orgId);
  const money = (m: number) => formatMoney(m, s.currency, s.locale);
  const [loc, returns, original] = await Promise.all([
    Location.findOne({ orgId: ctx.orgId, _id: sale.locationId }, { name: 1 }).lean(),
    Sale.find({ orgId: ctx.orgId, returnOf: sale._id }, { number: 1, grandTotal: 1, completedAt: 1 }).lean(),
    sale.returnOf ? Sale.findOne({ orgId: ctx.orgId, _id: sale.returnOf }, { number: 1 }).lean() : null,
  ]);
  const isReturn = sale.kind === "return";
  const returnable = !isReturn && sale.status === "completed" && sale.lines.some((l) => l.qty - (l.returnedQty ?? 0) > 0);

  return (
    <PageBody className="max-w-5xl">
      <PageHeader
        back={{ href: "/sales", label: "Sales" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {sale.number}
            {isReturn && <Badge variant="secondary">Return</Badge>}
            {sale.kind === "tax_invoice" && <Badge variant="outline">Tax invoice</Badge>}
            {sale.status === "void" && <Badge variant="destructive">Void</Badge>}
          </span>
        }
        description={`${formatDate(sale.completedAt!, s.timezone, s.locale, true)} · ${loc?.name ?? ""} · by ${sale.cashierName}${sale.deviceCode ? ` · offline on till ${sale.deviceCode}` : ""}`}
        actions={
          <SaleActions
            saleId={id}
            canReturn={returnable && can(ctx.role, "sales:return")}
            canVoid={!isReturn && sale.status === "completed" && can(ctx.role, "sales:void")}
            hasCustomer={!!sale.customerId}
            lines={sale.lines.map((l, i) => ({ index: i, name: l.name ?? "", sold: l.qty, returned: l.returnedQty ?? 0, scale: l.scale ?? 1, unit: l.unit ?? "", total: l.total ?? 0, serials: l.serials ?? [] }))}
          />
        }
      />

      {sale.syncIssues.length > 0 && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle />
          <AlertTitle>This offline bill needs review</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">{sale.syncIssues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>
            {can(ctx.role, "sales:return") && <div className="mt-3"><MarkReviewedButton saleId={id} /></div>}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Price</TableHead>
                <TableHead className="hidden text-right md:table-cell">Tax</TableHead>
                <TableHead className="pr-4 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-4">
                    <span className="block">{l.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.sku}
                      {l.batchNo && ` · Batch ${l.batchNo}`}
                      {(l.returnedQty ?? 0) > 0 && <span className="text-destructive"> · {formatQty(l.returnedQty ?? 0, l.scale ?? 1)} returned</span>}
                    </span>
                    {(l.serials?.length ?? 0) > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {l.serials.map((sn) => <Link key={sn} href={`/inventory/serials?q=${encodeURIComponent(sn)}`} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] hover:underline">{sn}</Link>)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(l.qty, l.scale ?? 1)} {l.unit}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {money(l.unitPrice ?? 0)}
                    {(l.discount ?? 0) > 0 && <span className="block text-xs text-success">−{money(l.discount ?? 0)}</span>}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{(l.rateBp ?? 0) / 100}%</TableCell>
                  <TableCell className="pr-4 text-right font-medium tabular-nums">{money(l.total ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row k="Subtotal" v={money(sale.subtotal ?? 0)} />
              {(sale.discountTotal ?? 0) > 0 && <Row k="Discount" v={`−${money(sale.discountTotal ?? 0)}`} />}
              {(sale.cgst ?? 0) > 0 && <Row k="CGST" v={money(sale.cgst ?? 0)} />}
              {(sale.sgst ?? 0) > 0 && <Row k="SGST" v={money(sale.sgst ?? 0)} />}
              {(sale.igst ?? 0) > 0 && <Row k="IGST" v={money(sale.igst ?? 0)} />}
              {(sale.vat ?? 0) > 0 && <Row k="Tax" v={money(sale.vat ?? 0)} />}
              {(sale.cess ?? 0) > 0 && <Row k="Cess" v={money(sale.cess ?? 0)} />}
              {(sale.roundOff ?? 0) !== 0 && <Row k="Round off" v={money(sale.roundOff ?? 0)} />}
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(sale.grandTotal ?? 0)}</span>
              </div>
              {sale.payments.map((p, i) => <Row key={i} k={`${PAYMENT_LABELS[p.method] ?? p.method}${p.reference ? ` (${p.reference})` : ""}`} v={money(p.amount ?? 0)} />)}
              {(sale.change ?? 0) > 0 && <Row k="Change given" v={money(sale.change ?? 0)} />}
              {(sale.balanceDue ?? 0) > 0 && <Row k="Balance due" v={money(sale.balanceDue ?? 0)} strong />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {sale.customer?.name ? (
                <>
                  {sale.customerId ? <Link href={`/customers/${sale.customerId}`} className="font-medium hover:underline">{sale.customer.name}</Link> : <p className="font-medium">{sale.customer.name}</p>}
                  {sale.customer.phone && <p className="text-muted-foreground">{sale.customer.phone}</p>}
                  {sale.customer.taxId && <p className="text-muted-foreground">GSTIN {sale.customer.taxId}</p>}
                </>
              ) : (
                <p className="text-muted-foreground">Walk-in customer</p>
              )}
            </CardContent>
          </Card>
          {(original || returns.length > 0 || sale.voidReason || sale.notes) && (
            <Card>
              <CardHeader>
                <CardTitle>Related</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {original && <p>Return against <Link className="font-medium hover:underline" href={`/sales/${sale.returnOf}`}>{original.number}</Link></p>}
                {returns.map((r) => (
                  <p key={String(r._id)}>
                    Return <Link className="font-medium hover:underline" href={`/sales/${r._id}`}>{r.number}</Link> · {money(r.grandTotal ?? 0)}
                  </p>
                ))}
                {sale.voidReason && <p className="text-destructive">Voided: {sale.voidReason}</p>}
                {sale.notes && <p className="text-muted-foreground">Note: {sale.notes}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageBody>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "font-semibold text-warning-foreground dark:text-warning" : "text-muted-foreground"}`}>
      <span>{k}</span>
      <span className="tabular-nums text-foreground">{v}</span>
    </div>
  );
}
