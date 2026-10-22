import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { formatDate, pageOf } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import { PurchaseOrder } from "@/server/models";
import { FilterSelect, Pagination, SearchInput } from "@/components/app/list-controls";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PoStatus } from "@/components/purchases/po-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Purchases" };
const PAGE = 30;

export default async function PurchasesPage({ searchParams }: PageProps<"/purchases">) {
  const ctx = await requireCtx("purchases:read");
  const sp = await searchParams;
  const s = await getOrgSettings(ctx.orgId);
  const money = (m: number) => formatMoney(m, s.currency, s.locale);
  const page = pageOf(sp.page);
  const filter: Record<string, unknown> = { orgId: ctx.orgId };
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ number: rx }, { supplierName: rx }, { supplierInvoiceNo: rx }];
  }
  if (typeof sp.status === "string" && ["ordered", "partial", "received", "cancelled"].includes(sp.status)) filter.status = sp.status;
  const [rows, total] = await Promise.all([PurchaseOrder.find(filter, { receipts: 0 }).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(), PurchaseOrder.countDocuments(filter)]);
  const canWrite = can(ctx.role, "purchases:write");

  return (
    <PageBody>
      <PageHeader
        title="Purchases"
        description="Order stock from suppliers and receive it into your locations."
        actions={canWrite && (
          <Button asChild>
            <Link href="/purchases/new"><Plus /> New purchase order</Link>
          </Button>
        )}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="PO no., supplier or bill no." />
        <FilterSelect param="status" placeholder="All statuses" options={[{ value: "ordered", label: "Ordered" }, { value: "partial", label: "Partly received" }, { value: "received", label: "Received" }, { value: "cancelled", label: "Cancelled" }]} />
      </div>
      {rows.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Truck /></EmptyMedia>
              <EmptyTitle>No purchase orders</EmptyTitle>
              <EmptyDescription>Create a purchase order, then receive the goods when they arrive.</EmptyDescription>
            </EmptyHeader>
            {canWrite && <EmptyContent><Button asChild><Link href="/purchases/new">New purchase order</Link></Button></EmptyContent>}
          </Empty>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Order</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((po) => {
                const ordered = po.lines.reduce((a, l) => a + Math.round((l.unitCost * l.qtyOrdered) / (l.scale ?? 1)), 0);
                return (
                  <TableRow key={String(po._id)} className="relative">
                    <TableCell className="pl-4 font-medium"><Link href={`/purchases/${po._id}`} className="after:absolute after:inset-0">{po.number}</Link></TableCell>
                    <TableCell className="max-w-48 truncate">{po.supplierName}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(po.createdAt, s.timezone, s.locale)}</TableCell>
                    <TableCell><PoStatus status={po.status} /></TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{money(po.receivedValue || ordered)}</TableCell>
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
