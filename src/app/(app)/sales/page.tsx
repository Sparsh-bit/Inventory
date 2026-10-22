import type { Metadata } from "next";
import Link from "next/link";
import { Download, Receipt } from "lucide-react";
import { formatDate, pageOf } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Sale } from "@/server/models";
import { parseRange } from "@/server/services/reports";
import { FilterSelect, Pagination, SearchInput } from "@/components/app/list-controls";
import { DateRange } from "@/components/app/date-range";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Sales" };
const PAGE = 30;

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  const ctx = await requireCtx("sales:read");
  const sp = await searchParams;
  const s = await getOrgSettings(ctx.orgId);
  const money = (m: number) => formatMoney(m, s.currency, s.locale);
  const range = parseRange(s.timezone, sp.from as string, sp.to as string);
  const page = pageOf(sp.page);

  const filter: Record<string, unknown> = { orgId: ctx.orgId, status: { $in: ["completed", "void"] }, completedAt: { $gte: range.start, $lt: range.end } };
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ number: rx }, { "customer.name": rx }, { "customer.phone": rx }];
  }
  if (sp.type === "return") filter.kind = "return";
  else if (sp.type === "credit") filter.balanceDue = { $gt: 0 };
  else if (sp.type === "void") filter.status = "void";
  else if (sp.type === "invoice") filter.kind = "tax_invoice";
  else if (sp.type === "review") filter["syncIssues.0"] = { $exists: true };

  const [rows, total] = await Promise.all([
    Sale.find(filter, { number: 1, kind: 1, status: 1, completedAt: 1, customer: 1, grandTotal: 1, balanceDue: 1, payments: 1, cashierName: 1, deviceCode: 1, syncIssues: 1, lines: { $slice: 0 } }).sort({ completedAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
    Sale.countDocuments(filter),
  ]);
  const exportHref = `/api/export/sales?from=${range.from}&to=${range.to}`;

  return (
    <PageBody>
      <PageHeader
        title="Sales & invoices"
        description="Every bill, invoice and return."
        actions={
          <Button asChild variant="outline">
            <a href={exportHref} download>
              <Download /> Export
            </a>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <SearchInput placeholder="Bill no., customer or phone" />
        <FilterSelect
          param="type"
          placeholder="All documents"
          options={[
            { value: "invoice", label: "Tax invoices" },
            { value: "return", label: "Returns" },
            { value: "credit", label: "Unpaid (credit)" },
            { value: "void", label: "Voided" },
            { value: "review", label: "Needs review (offline)" },
          ]}
        />
        <DateRange from={range.from} to={range.to} today={range.today} />
      </div>
      {rows.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Receipt />
              </EmptyMedia>
              <EmptyTitle>No sales in this period</EmptyTitle>
              <EmptyDescription>Change the dates or filters, or ring up a sale from the POS.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Bill</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="hidden lg:table-cell">Payment</TableHead>
                <TableHead className="pr-4 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={String(r._id)} className="relative">
                  <TableCell className="pl-4">
                    <Link href={`/sales/${r._id}`} className="font-medium after:absolute after:inset-0">
                      {r.number}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {r.kind === "return" && <Badge variant="secondary">Return</Badge>}
                      {r.kind === "tax_invoice" && <Badge variant="outline">Tax invoice</Badge>}
                      {r.status === "void" && <Badge variant="destructive">Void</Badge>}
                      {r.deviceCode && <Badge variant="outline">Offline · {r.deviceCode}</Badge>}
                      {(r.syncIssues?.length ?? 0) > 0 && <Badge variant="destructive">Needs review</Badge>}
                      {(r.balanceDue ?? 0) > 0 && <Badge variant="outline" className="border-warning text-warning-foreground dark:text-warning">Due {money(r.balanceDue ?? 0)}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-48 truncate">{r.customer?.name || <span className="text-muted-foreground">Walk-in</span>}</span>
                    <span className="text-xs text-muted-foreground md:hidden">{formatDate(r.completedAt!, s.timezone, s.locale, true)}</span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(r.completedAt!, s.timezone, s.locale, true)}</TableCell>
                  <TableCell className="hidden text-muted-foreground capitalize lg:table-cell">{[...new Set(r.payments.map((p) => (p.method === "credit" ? "on account" : p.method)))].join(", ")}</TableCell>
                  <TableCell className={`pr-4 text-right font-medium tabular-nums ${r.kind === "return" ? "text-destructive" : ""} ${r.status === "void" ? "line-through opacity-60" : ""}`}>
                    {r.kind === "return" ? "−" : ""}
                    {money(r.grandTotal ?? 0)}
                  </TableCell>
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
