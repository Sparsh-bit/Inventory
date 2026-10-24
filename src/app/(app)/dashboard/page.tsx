import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  HandCoins,
  IndianRupee,
  Package,
  Plus,
  ReceiptText,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { formatQty, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Sale } from "@/server/models";
import { balances, expiringBatches, lowStock, salesByDay, salesByProduct, salesTotals, startOfDay } from "@/server/services/reports";
import { PageBody } from "@/components/app/page-header";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireCtx();
  const s = await getOrgSettings(ctx.orgId);
  const tz = s.timezone;
  const money = (m: number) => formatMoney(m, s.currency, s.locale);
  const today = startOfDay(tz);
  const tomorrow = new Date(today.getTime() + 86400e3);
  const monthAgo = new Date(today.getTime() - 29 * 86400e3);
  const yesterday = new Date(today.getTime() - 86400e3);
  const showMoney = can(ctx.role, "reports:read");
  const todayLabel = new Intl.DateTimeFormat(s.locale, { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date());

  const [t, y, series, top, low, expiring, receivables, recent] = await Promise.all([
    salesTotals(ctx, today, tomorrow),
    salesTotals(ctx, yesterday, today),
    showMoney ? salesByDay(ctx, tz, monthAgo, tomorrow) : Promise.resolve([]),
    showMoney ? salesByProduct(ctx, monthAgo, tomorrow, 5) : Promise.resolve([]),
    lowStock(ctx, 8),
    expiringBatches(ctx, 30),
    showMoney ? balances(ctx, "customer") : Promise.resolve({ rows: [], total: 0 }),
    Sale.find({ orgId: ctx.orgId, status: "completed" }, { number: 1, grandTotal: 1, completedAt: 1, kind: 1, customer: 1, cashierName: 1 }).sort({ completedAt: -1 }).limit(6).lean(),
  ]);

  const change = y.revenue ? Math.round(((t.revenue - y.revenue) / y.revenue) * 100) : null;
  const totalRevenue = series.reduce((a, d) => a + d.revenue, 0);
  const totalBills = series.reduce((a, d) => a + d.count, 0);
  const greeting = (() => {
    const h = Number(new Date().toLocaleString("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }));
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();
  const attentionCount = low.length + expiring.length;

  return (
    <PageBody className="dashboard-page space-y-7 sm:space-y-8">
      <header className="dashboard-welcome flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">Store overview</span>
            <span className="inline-flex items-center gap-1.5 normal-case tracking-normal"><CalendarDays className="size-3.5" />{todayLabel}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{greeting}, {ctx.userName.split(" ")[0]}</h1>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-base">Here’s the latest from <span className="font-medium text-foreground">{ctx.orgName}</span>.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(ctx.role, "products:write") && (
            <Button asChild size="lg" variant="outline" className="rounded-xl bg-card">
              <Link href="/products/new"><Plus /> Add product</Link>
            </Button>
          )}
        </div>
      </header>

      <section aria-label="Today's key figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Sales today" value={money(t.revenue)} icon={IndianRupee} accent="blue" detail={change === null ? "No sales yesterday to compare" : `${Math.abs(change)}% ${change >= 0 ? "up" : "down"} from yesterday`} trend={change === null ? null : change >= 0 ? "up" : "down"} />
        <MetricCard label="Bills today" value={String(t.count)} icon={ReceiptText} accent="violet" detail={t.count ? `Average bill ${money(t.avgBill)}` : "Your first sale starts here"} />
        {showMoney ? (
          <MetricCard label="Gross profit today" value={money(t.grossProfit)} icon={ShoppingBag} accent="green" detail={t.returns ? `${money(t.returns)} in returns today` : "Before expenses"} />
        ) : (
          <MetricCard label="Returns today" value={String(t.returnCount)} icon={ReceiptText} accent="green" detail="Bills returned today" />
        )}
        {showMoney ? (
          <MetricCard label="Customer dues" value={money(receivables.total)} icon={HandCoins} accent={receivables.total ? "amber" : "green"} detail={`${receivables.rows.length} customer${receivables.rows.length === 1 ? "" : "s"} with balance`} />
        ) : (
          <MetricCard label="Low stock" value={String(low.length)} icon={Package} accent={low.length ? "amber" : "green"} detail={low.length ? "Needs a stock check" : "Stock levels look good"} />
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.85fr)]">
        {showMoney && (
          <Card className="dashboard-chart overflow-hidden rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border/70">
            <CardHeader className="gap-4 border-b border-border/60 bg-gradient-to-r from-primary/[0.06] via-card to-card px-5 pb-4 pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-6">
              <div className="min-w-0 space-y-1">
                <CardDescription className="font-medium">Sales performance · last 30 days</CardDescription>
                <CardTitle className="text-3xl tracking-[-0.04em] sm:text-4xl">{money(totalRevenue)}</CardTitle>
                <p className="text-xs text-muted-foreground">{totalBills} bills across the last 30 days</p>
              </div>
              <Badge variant="secondary" className="w-fit gap-1.5 rounded-full px-3 py-1 font-medium"><Sparkles className="size-3.5 text-primary" /> Your business at a glance</Badge>
            </CardHeader>
            <CardContent className="px-3 pb-4 pt-4 sm:px-5">
              <SalesChart data={series} />
              <div className="mx-2 mt-1 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/60 px-2 pt-3 text-xs text-muted-foreground sm:mx-3">
                <span><span className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" />Daily sales</span>
                <span>Today <strong className="ml-1 font-semibold text-foreground">{money(t.revenue)}</strong></span>
                <span>Average bill <strong className="ml-1 font-semibold text-foreground">{money(t.avgBill)}</strong></span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className={`${showMoney ? "" : "xl:col-span-2"} dashboard-attention overflow-hidden rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border/70`}>
          <CardHeader className="border-b border-border/60 px-5 pb-4 pt-5 sm:px-6">
            <div className="flex items-start gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${attentionCount ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"}`}>
                {attentionCount ? <AlertTriangle className="size-5" /> : <Check className="size-5" />}
              </span>
              <div className="space-y-1">
                <CardTitle className="text-base">Store attention</CardTitle>
                <CardDescription>{attentionCount ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} to review` : "Nothing needs attention right now"}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-5 py-4 sm:px-6">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Low stock</h3>
                <Button asChild variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-xs text-muted-foreground">
                  <Link href="/inventory?filter=low">Inventory <ArrowRight /></Link>
                </Button>
              </div>
              {low.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/[0.07] px-3 py-3 text-sm text-emerald-800 dark:text-emerald-200"><Check className="size-4 shrink-0" />Everything is above its reorder level.</div>
              ) : (
                <ul className="space-y-1">
                  {low.slice(0, 4).map((r) => (
                    <li key={String(r.variantId)} className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/70">
                      <Link href={`/products/${r.productId}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                        {r.name}{r.variantName && <span className="font-normal text-muted-foreground"> · {r.variantName}</span>}
                      </Link>
                      <Badge variant={r.qty <= 0 ? "destructive" : "secondary"} className="shrink-0 rounded-md tabular-nums">{formatQty(r.qty, r.scale)} {r.unit}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-border/60 pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-muted-foreground" />Expiring within 30 days</h3>
                <Badge variant={expiring.length ? "outline" : "secondary"} className="rounded-full">{expiring.length}</Badge>
              </div>
              {expiring.length ? (
                <ul className="space-y-1">
                  {expiring.slice(0, 3).map((b) => (
                    <li key={b.batchId} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/70">
                      <span className="min-w-0 truncate font-medium">{b.name} <span className="font-normal text-muted-foreground">#{b.batchNo}</span></span>
                      <Badge variant={b.expired ? "destructive" : "outline"} className="shrink-0 rounded-md">{b.expired ? "Expired" : formatDate(b.expiry, tz, s.locale)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-2 py-1 text-sm text-muted-foreground">No batches expiring soon.</p>}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <Card className="overflow-hidden rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border/70">
          <CardHeader className="flex-row items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
            <div className="space-y-1"><CardTitle className="text-base">Recent sales</CardTitle><CardDescription>Your latest completed bills</CardDescription></div>
            <CardAction><Button asChild variant="ghost" size="sm" className="rounded-lg text-muted-foreground"><Link href="/sales">All sales <ArrowRight /></Link></Button></CardAction>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4">
            {recent.length === 0 ? (
              <div className="m-2 flex flex-col items-center rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <span className="mb-3 grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><ReceiptText className="size-5" /></span>
                <p className="font-medium">Your first sale will appear here</p>
                <p className="mt-1 text-sm text-muted-foreground">Create a bill to start tracking your day.</p>
                <Button asChild size="sm" className="mt-4 rounded-lg"><Link href="/pos">Open point of sale</Link></Button>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {recent.map((r) => (
                  <li key={String(r._id)}>
                    <Link href={`/sales/${r._id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted/60 sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.5fr)_auto]">
                      <span className="truncate text-sm font-semibold">{r.number}</span>
                      <span className="hidden min-w-0 sm:block">
                        <span className="block truncate text-sm">{r.customer?.name || "Walk-in customer"}</span>
                        <span className="block truncate text-xs text-muted-foreground">{formatDate(r.completedAt!, tz, s.locale, true)}</span>
                      </span>
                      <span className={`text-right text-sm font-semibold tabular-nums ${r.kind === "return" ? "text-destructive" : ""}`}>
                        {r.kind === "return" ? "−" : ""}{money(r.grandTotal ?? 0)}
                        <span className="block text-xs font-normal text-muted-foreground sm:hidden">{r.customer?.name || "Walk-in"}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {showMoney && (
          <Card className="overflow-hidden rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border/70">
            <CardHeader className="px-5 pb-3 pt-5 sm:px-6">
              <CardTitle className="text-base">Best sellers</CardTitle>
              <CardDescription>Top products by sales · last 30 days</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5 sm:px-6">
              {top.length === 0 ? (
                <div className="flex min-h-44 flex-col items-center justify-center rounded-xl bg-muted/45 px-4 text-center">
                  <span className="mb-3 grid size-10 place-items-center rounded-xl bg-card text-muted-foreground shadow-sm"><Package className="size-5" /></span>
                  <p className="text-sm font-medium">Product rankings will show here</p>
                  <p className="mt-1 text-xs text-muted-foreground">Complete a sale to see what customers love.</p>
                </div>
              ) : (
                <ol className="space-y-4">
                  {top.map((p, index) => {
                    const pct = Math.max(5, Math.round((p.revenue / Math.max(top[0].revenue, 1)) * 100));
                    return (
                      <li key={String(p._id)} className="space-y-1.5">
                        <div className="flex items-center gap-3 text-sm">
                          <span className={`grid size-6 shrink-0 place-items-center rounded-lg text-[11px] font-semibold ${index === 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{money(p.revenue)}</span>
                        </div>
                        <div className="ml-9 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/75" style={{ width: `${pct}%` }} /></div>
                      </li>
                    );
                  })}
                </ol>
              )}
              <Button asChild variant="outline" size="sm" className="mt-5 w-full rounded-lg">
                <Link href="/products"><Package /> Browse products <ArrowRight /></Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </PageBody>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  trend,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof IndianRupee;
  accent: "blue" | "violet" | "green" | "amber";
  trend?: "up" | "down" | null;
}) {
  const colors = {
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  }[accent];
  return (
    <Card className="group relative overflow-hidden rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border/70 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex min-h-32 items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-semibold tracking-[-0.04em] tabular-nums">{value}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {trend === "up" ? <ArrowUpRight className="size-3.5 text-emerald-600" /> : trend === "down" ? <ArrowDownRight className="size-3.5 text-rose-600" /> : null}
            <span className="truncate">{detail}</span>
          </p>
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${colors}`}><Icon className="size-[18px]" /></span>
      </CardContent>
    </Card>
  );
}
