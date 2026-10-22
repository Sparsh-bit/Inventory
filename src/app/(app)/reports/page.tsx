import type { Metadata } from "next";
import Link from "next/link";
import { Download, IndianRupee, Percent, Receipt, RotateCcw, TrendingUp, Wallet } from "lucide-react";
import { formatDate, formatQty, PAYMENT_LABELS } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import {
  balances, expiringBatches, gstSummary, parseRange, purchaseTotals, salesByCashier, salesByCategory, salesByDay, salesByPayment, salesByProduct, salesTotals, stockValuation,
} from "@/server/services/reports";
import { DateRange } from "@/components/app/date-range";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Reports" };
const TABS = [
  ["sales", "Sales"], ["gst", "Tax / GST"], ["stock", "Stock"], ["expiry", "Expiry"], ["dues", "Dues"],
] as const;

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const ctx = await requireCtx("reports:read");
  const sp = await searchParams;
  const s = await getOrgSettings(ctx.orgId);
  const money = (m: number) => formatMoney(m, s.currency, s.locale);
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "sales";
  const range = parseRange(s.timezone, sp.from as string, sp.to as string);
  const qs = (t: string) => `?tab=${t}&from=${range.from}&to=${range.to}`;
  const exp = (r: string, fmt = "xlsx") => `/api/export/${r}?from=${range.from}&to=${range.to}&format=${fmt}`;

  return (
    <PageBody>
      <PageHeader title="Reports" description={`${formatDate(range.start, s.timezone, s.locale)} – ${formatDate(new Date(range.end.getTime() - 1), s.timezone, s.locale)}`} />
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1" aria-label="Report type">
          {TABS.map(([k, label]) => (
            <Link key={k} href={qs(k)} aria-current={tab === k ? "page" : undefined} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </Link>
          ))}
        </nav>
        {["sales", "gst"].includes(tab) && <DateRange from={range.from} to={range.to} today={range.today} />}
      </div>

      {tab === "sales" && <SalesReport ctx={ctx} range={range} money={money} tz={s.timezone} exportHref={exp("sales")} />}
      {tab === "gst" && <GstReport ctx={ctx} range={range} money={money} gst={s.taxMode === "GST"} exportHref={exp("gst")} salesHref={exp("sales")} />}
      {tab === "stock" && <StockReport ctx={ctx} money={money} showCost={can(ctx.role, "cost:read")} />}
      {tab === "expiry" && <ExpiryReport ctx={ctx} tz={s.timezone} locale={s.locale} />}
      {tab === "dues" && <DuesReport ctx={ctx} money={money} />}
    </PageBody>
  );
}

type Ctx = Awaited<ReturnType<typeof requireCtx>>;
type Range = ReturnType<typeof parseRange>;

async function SalesReport({ ctx, range, money, tz, exportHref }: { ctx: Ctx; range: Range; money: (n: number) => string; tz: string; exportHref: string }) {
  const [t, days, products, payments, cashiers, categories, purchases] = await Promise.all([
    salesTotals(ctx, range.start, range.end), salesByDay(ctx, tz, range.start, range.end), salesByProduct(ctx, range.start, range.end, 25),
    salesByPayment(ctx, range.start, range.end), salesByCashier(ctx, range.start, range.end), salesByCategory(ctx, range.start, range.end), purchaseTotals(ctx, range.start, range.end),
  ]);
  const margin = t.net ? Math.round((t.grossProfit / (t.net - t.tax || 1)) * 100) : 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net sales" value={money(t.net)} icon={IndianRupee} hint={`${t.count} bills · avg ${money(t.avgBill)}`} />
        <StatCard label="Gross profit" value={money(t.grossProfit)} icon={TrendingUp} tone="success" hint={`${margin}% margin (before tax)`} />
        <StatCard label="Returns" value={money(t.returns)} icon={RotateCcw} tone={t.returns ? "warning" : "default"} hint={`${t.returnCount} credit notes`} />
        <StatCard label="Purchases received" value={money(purchases.received - purchases.returned)} icon={Wallet} hint={`${purchases.count} orders`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Daily sales</CardTitle>
          <CardAction><Button asChild variant="outline" size="sm"><a href={exportHref} download><Download /> Excel</a></Button></CardAction>
        </CardHeader>
        <CardContent><SalesChart data={days} /></CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Top products</CardTitle></CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="pr-6 text-right">Profit</TableHead></TableRow></TableHeader>
              <TableBody>
                {products.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No sales in this period.</TableCell></TableRow>}
                {products.map((p) => (
                  <TableRow key={String(p._id)}>
                    <TableCell className="pl-6">{p.name}<span className="block font-mono text-xs text-muted-foreground">{p.sku}</span></TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(p.qty, p.scale ?? 1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.revenue)}</TableCell>
                    <TableCell className={`pr-6 text-right tabular-nums ${p.profit < 0 ? "text-destructive" : ""}`}>{money(p.profit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <BreakdownCard title="By payment method" rows={payments.map((p) => ({ label: PAYMENT_LABELS[p._id] ?? p._id, value: p.amount, sub: `${p.count} payments` }))} money={money} />
        <BreakdownCard title="By category" rows={categories.map((c) => ({ label: c.name ?? "Uncategorised", value: c.revenue }))} money={money} />
        <BreakdownCard title="By cashier" rows={cashiers.map((c) => ({ label: c.name, value: c.revenue, sub: `${c.count} bills` }))} money={money} />
      </div>
    </div>
  );
}

function BreakdownCard({ title, rows, money }: { title: string; rows: { label: string; value: number; sub?: string }[]; money: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No data.</p> : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.label} className="space-y-1 text-sm">
                <div className="flex justify-between gap-2"><span className="truncate">{r.label} {r.sub && <span className="text-xs text-muted-foreground">· {r.sub}</span>}</span><span className="tabular-nums">{money(r.value)}</span></div>
                <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-chart-2" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function GstReport({ ctx, range, money, gst, exportHref, salesHref }: { ctx: Ctx; range: Range; money: (n: number) => string; gst: boolean; exportHref: string; salesHref: string }) {
  const g = await gstSummary(ctx, range.start, range.end);
  const sum = (rows: { taxable: number; cgst: number; sgst: number; igst: number; cess: number; total: number }[]) =>
    rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, igst: a.igst + r.igst, cess: a.cess + r.cess, total: a.total + r.total }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 });
  const tot = sum(g.byRate);
  const b2b = g.byType.find((t) => t._id === true);
  const b2c = g.byType.find((t) => t._id === false);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Taxable value" value={money(tot.taxable)} icon={Receipt} />
        <StatCard label={gst ? "Output GST" : "Output tax"} value={money(tot.cgst + tot.sgst + tot.igst + tot.cess)} icon={Percent} />
        {gst && <StatCard label="B2B (registered)" value={money(b2b?.taxable ?? 0)} icon={Receipt} hint={`${b2b?.invoices ?? 0} invoices`} />}
        {gst && <StatCard label="B2C (consumers)" value={money(b2c?.taxable ?? 0)} icon={Receipt} hint={`${b2c?.invoices ?? 0} bills`} />}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Rate-wise summary</CardTitle>
          <CardDescription>Net of returns (credit notes).</CardDescription>
        </CardHeader>
        <CardContent className="px-0"><TaxTable rows={g.byRate.map((r) => ({ key: String(r._id), label: `${(r._id ?? 0) / 100}%`, ...r }))} total={tot} money={money} gst={gst} /></CardContent>
      </Card>
      {gst && (
        <Card>
          <CardHeader>
            <CardTitle>HSN-wise summary</CardTitle>
            <CardDescription>For GSTR-1 Table 12.</CardDescription>
            <CardAction className="flex gap-2">
              <Button asChild variant="outline" size="sm"><a href={exportHref} download><Download /> HSN Excel</a></Button>
              <Button asChild variant="outline" size="sm"><a href={salesHref} download><Download /> Invoice register</a></Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0"><TaxTable rows={g.byHsn.map((r) => ({ key: `${r._id.hsn}-${r._id.rate}`, label: `${r._id.hsn || "No HSN"} · ${(r._id.rate ?? 0) / 100}%`, ...r }))} total={tot} money={money} gst={gst} /></CardContent>
        </Card>
      )}
    </div>
  );
}

function TaxTable({ rows, total, money, gst }: { rows: { key: string; label: string; taxable: number; cgst: number; sgst: number; igst: number; cess: number; total: number }[]; total: { taxable: number; cgst: number; sgst: number; igst: number; cess: number; total: number }; money: (n: number) => string; gst: boolean }) {
  const cols = gst ? (["taxable", "cgst", "sgst", "igst", "cess", "total"] as const) : (["taxable", "total"] as const);
  const head: Record<string, string> = { taxable: "Taxable", cgst: "CGST", sgst: "SGST", igst: "IGST", cess: "Cess", total: "Total" };
  return (
    <Table>
      <TableHeader><TableRow><TableHead className="pl-6">Rate</TableHead>{cols.map((c) => <TableHead key={c} className="text-right last:pr-6">{head[c]}</TableHead>)}</TableRow></TableHeader>
      <TableBody>
        {rows.length === 0 && <TableRow><TableCell colSpan={cols.length + 1} className="py-8 text-center text-muted-foreground">No taxable sales in this period.</TableCell></TableRow>}
        {rows.map((r) => <TableRow key={r.key}><TableCell className="pl-6">{r.label}</TableCell>{cols.map((c) => <TableCell key={c} className="text-right tabular-nums last:pr-6">{money(r[c])}</TableCell>)}</TableRow>)}
      </TableBody>
      {rows.length > 0 && <TableFooter><TableRow><TableCell className="pl-6 font-semibold">Total</TableCell>{cols.map((c) => <TableCell key={c} className="text-right font-semibold tabular-nums last:pr-6">{money(total[c])}</TableCell>)}</TableRow></TableFooter>}
    </Table>
  );
}

async function StockReport({ ctx, money, showCost }: { ctx: Ctx; money: (n: number) => string; showCost: boolean }) {
  const v = await stockValuation(ctx);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Items in stock" value={String(v.items.filter((i) => i.qty > 0).length)} icon={Receipt} />
        {showCost && <StatCard label="Value at cost" value={money(v.costTotal)} icon={Wallet} />}
        <StatCard label="Value at selling price" value={money(v.saleTotal)} icon={TrendingUp} tone="success" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Stock valuation</CardTitle>
          <CardAction><Button asChild variant="outline" size="sm"><a href="/api/export/stock?format=xlsx" download><Download /> Excel</a></Button></CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-6">Item</TableHead><TableHead className="text-right">Qty</TableHead>{showCost && <TableHead className="text-right">Cost value</TableHead>}<TableHead className="pr-6 text-right">Sale value</TableHead></TableRow></TableHeader>
            <TableBody>
              {v.items.slice(0, 200).map((i) => (
                <TableRow key={i.variantId}>
                  <TableCell className="pl-6">{i.name}<span className="block font-mono text-xs text-muted-foreground">{i.sku}</span></TableCell>
                  <TableCell className={`text-right tabular-nums ${i.qty < 0 ? "text-destructive" : ""}`}>{formatQty(i.qty, i.scale)} {i.unit}</TableCell>
                  {showCost && <TableCell className="text-right tabular-nums">{money(i.costValue)}</TableCell>}
                  <TableCell className="pr-6 text-right tabular-nums">{money(i.saleValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

async function ExpiryReport({ ctx, tz, locale }: { ctx: Ctx; tz: string; locale: string }) {
  const rows = await expiringBatches(ctx, 90);
  return (
    <Card>
      <CardHeader><CardTitle>Batches expiring within 90 days</CardTitle><CardDescription>Including already expired stock still on hand.</CardDescription></CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader><TableRow><TableHead className="pl-6">Item</TableHead><TableHead>Batch</TableHead><TableHead>Expiry</TableHead><TableHead className="pr-6 text-right">Qty</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nothing expiring soon.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.batchId}>
                <TableCell className="pl-6">{r.name}</TableCell>
                <TableCell className="font-mono text-xs">{r.batchNo}</TableCell>
                <TableCell><Badge variant={r.expired ? "destructive" : "outline"}>{r.expired ? "Expired " : ""}{formatDate(r.expiry, tz, locale)}</Badge></TableCell>
                <TableCell className="pr-6 text-right tabular-nums">{formatQty(r.qty, r.scale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

async function DuesReport({ ctx, money }: { ctx: Ctx; money: (n: number) => string }) {
  const [rec, pay] = await Promise.all([balances(ctx, "customer"), balances(ctx, "supplier")]);
  const list = (title: string, kind: string, data: typeof rec) => (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>Total {money(data.total)}</CardDescription></CardHeader>
      <CardContent>
        {data.rows.length === 0 ? <p className="text-sm text-muted-foreground">All settled.</p> : (
          <ul className="divide-y text-sm">
            {data.rows.map((r) => (
              <li key={String(r._id)} className="flex justify-between gap-2 py-2">
                <Link href={`/${kind}/${r._id}`} className="truncate hover:underline">{r.name}<span className="block text-xs text-muted-foreground">{r.phone}</span></Link>
                <span className="font-medium tabular-nums">{money(r.balance)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {list("Receivables (customers owe you)", "customers", rec)}
      {list("Payables (you owe suppliers)", "suppliers", pay)}
    </div>
  );
}
