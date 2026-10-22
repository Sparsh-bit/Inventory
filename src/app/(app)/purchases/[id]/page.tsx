import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { formatDate, formatQty } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Location, Product, PurchaseOrder } from "@/server/models";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PoActions } from "@/components/purchases/po-actions";
import { PoStatus } from "@/components/purchases/po-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PurchasePage({ params }: PageProps<"/purchases/[id]">) {
  const ctx = await requireCtx("purchases:read");
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const po = await PurchaseOrder.findOne({ orgId: ctx.orgId, _id: id }).lean();
  if (!po) notFound();
  const s = await getOrgSettings(ctx.orgId);
  const money = (m: number) => formatMoney(m, s.currency, s.locale);
  const [loc, products] = await Promise.all([
    Location.findOne({ orgId: ctx.orgId, _id: po.locationId }, { name: 1 }).lean(),
    Product.find({ orgId: ctx.orgId, _id: { $in: po.lines.map((l) => l.productId) } }, { trackBatch: 1, trackSerial: 1, unit: 1, variants: 1 }).lean(),
  ]);
  const prod = (pid: unknown) => products.find((p) => String(p._id) === String(pid));
  const canWrite = can(ctx.role, "purchases:write");
  const ordered = po.lines.reduce((a, l) => a + Math.round((l.unitCost * l.qtyOrdered) / (l.scale ?? 1)), 0);
  const net = po.receivedValue - po.returnedValue;

  return (
    <PageBody className="max-w-5xl">
      <PageHeader
        back={{ href: "/purchases", label: "Purchases" }}
        title={<span className="flex items-center gap-2">{po.number} <PoStatus status={po.status} /></span>}
        description={`${po.supplierName} · deliver to ${loc?.name ?? "—"} · created ${formatDate(po.createdAt, s.timezone, s.locale)}`}
        actions={canWrite && (
          <>
            {(po.status === "ordered" || po.status === "draft") && (
              <Button asChild variant="outline"><Link href={`/purchases/${id}/edit`}><Pencil /> Edit</Link></Button>
            )}
            <PoActions
              id={id}
              status={po.status}
              lines={po.lines.map((l) => {
                const p = prod(l.productId);
                const v = p?.variants.find((x) => String(x._id) === String(l.variantId));
                return { id: String(l._id), name: l.name ?? "", sku: l.sku ?? "", barcodes: v?.barcodes ?? [], scale: l.scale ?? 1, unit: p?.unit?.code ?? "", ordered: l.qtyOrdered, received: l.qtyReceived, returned: l.qtyReturned, unitCost: l.unitCost, trackBatch: !!p?.trackBatch, trackSerial: !!p?.trackSerial };
              })}
            />
          </>
        )}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Item</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Unit cost</TableHead>
                <TableHead className="pr-4 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.lines.map((l) => (
                <TableRow key={String(l._id)}>
                  <TableCell className="pl-4">
                    <span className="block">{l.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{l.sku}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(l.qtyOrdered, l.scale ?? 1)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${l.qtyReceived >= l.qtyOrdered ? "text-success" : ""}`}>
                    {formatQty(l.qtyReceived, l.scale ?? 1)}
                    {l.qtyReturned > 0 && <span className="block text-xs text-destructive">−{formatQty(l.qtyReturned, l.scale ?? 1)} returned</span>}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{money(l.unitCost)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{money(Math.round((l.unitCost * l.qtyOrdered) / (l.scale ?? 1)))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Ordered value</span><span className="tabular-nums text-foreground">{money(ordered)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Received (incl. tax)</span><span className="tabular-nums text-foreground">{money(po.receivedValue)}</span></div>
              {po.returnedValue > 0 && <div className="flex justify-between text-muted-foreground"><span>Returned</span><span className="tabular-nums text-foreground">−{money(po.returnedValue)}</span></div>}
              <div className="flex justify-between text-muted-foreground"><span>Paid</span><span className="tabular-nums text-foreground">{money(po.amountPaid)}</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold"><span>Balance</span><span className="tabular-nums">{money(Math.max(0, net - po.amountPaid))}</span></div>
              <p className="pt-2 text-xs text-muted-foreground">Pay the supplier from the <Link className="underline" href={`/suppliers/${po.supplierId}`}>supplier page</Link>.</p>
            </CardContent>
          </Card>
          {(po.supplierInvoiceNo || po.notes || po.expectedDate) && (
            <Card>
              <CardHeader><CardTitle>Details</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {po.supplierInvoiceNo && <p>Supplier bill: {po.supplierInvoiceNo}</p>}
                {po.expectedDate && <p>Expected: {formatDate(po.expectedDate, s.timezone, s.locale)}</p>}
                {po.notes && <p className="whitespace-pre-line text-muted-foreground">{po.notes}</p>}
              </CardContent>
            </Card>
          )}
          {po.receipts.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Deliveries</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {po.receipts.map((r, i) => (
                  <div key={i}>
                    <p className="font-medium">{formatDate(r.at!, s.timezone, s.locale, true)}</p>
                    <ul className="text-xs text-muted-foreground">
                      {r.lines.map((rl, j) => {
                        const line = po.lines.find((l) => String(l._id) === String(rl.lineId));
                        return <li key={j}>{line?.name} × {formatQty(rl.qty ?? 0, line?.scale ?? 1)}{rl.batchNo && ` · batch ${rl.batchNo}`}</li>;
                      })}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageBody>
  );
}
