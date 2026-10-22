import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, HandCoins, IndianRupee, Package, Receipt, TrendingUp } from "lucide-react";
import { formatQty, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Sale } from "@/server/models";
import { balances, expiringBatches, lowStock, salesByDay, salesByProduct, salesTotals, startOfDay } from "@/server/services/reports";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
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

  const [t, y, series, top, low, expiring, receivables, recent] = await Promise.all([
    salesTotals(ctx, today, tomorrow),
    salesTotals(ctx, yesterday, today),
    showMoney ? salesByDay(ctx, tz, monthAgo, tomorrow) : Promise.resolve([]),
    showMoney ? salesByProduct(ctx, monthAgo, tomorrow, 6) : Promise.resolve([]),
    lowStock(ctx, 8),
    expiringBatches(ctx, 30),
    showMoney ? balances(ctx, "customer") : Promise.resolve({ rows: [], total: 0 }),
    Sale.find({ orgId: ctx.orgId, status: "completed" }, { number: 1, grandTotal: 1, completedAt: 1, kind: 1, customer: 1, cashierName: 1 }).sort({ completedAt: -1 }).limit(6).lean(),
  ]);

  const change = y.revenue ? Math.round(((t.revenue - y.revenue) / y.revenue) * 100) : null;
  const greeting = (() => {
    const h = Number(new Date().toLocaleString("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }));
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();

  return (
    <PageBody>
      <PageHeader
        title={`${greeting}, ${ctx.userName.split(" ")[0]}`}
        description={`Here's how ${ctx.orgName} is doing today.`}
        actions={
          can(ctx.role, "products:write") && (
            <Button asChild variant="outline">
              <Link href="/products/new">
                <Package /> Add product
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's sales" value={money(t.revenue)} icon={s.currency === "INR" ? IndianRupee : TrendingUp} hint={change === null ? "No sales yesterday" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs yesterday`} />
        <StatCard label="Bills today" value={String(t.count)} icon={Receipt} hint={t.count ? `Avg. bill ${money(t.avgBill)}` : "No bills yet"} />
        {showMoney ? (
          <StatCard label="Gross profit today" value={money(t.grossProfit)} icon={TrendingUp} tone="success" hint={t.returns ? `After ${money(t.returns)} returns` : "Before expenses"} />
        ) : (
          <StatCard label="Returns today" value={String(t.returnCount)} icon={Receipt} />
        )}
        {showMoney ? (
          <StatCard label="To collect" value={money(receivables.total)} icon={HandCoins} tone={receivables.total ? "warning" : "default"} hint={`${receivables.rows.length} customer(s) with dues`} />
        ) : (
          <StatCard label="Low stock items" value={String(low.length)} icon={AlertTriangle} tone={low.length ? "warning" : "default"} />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {showMoney && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Sales, last 30 days</CardTitle>
              <CardDescription>{money(series.reduce((a, d) => a + d.revenue, 0))} from {series.reduce((a, d) => a + d.count, 0)} bills</CardDescription>
            </CardHeader>
            <CardContent>
              <SalesChart data={series} />
            </CardContent>
          </Card>
        )}

        <Card className={showMoney ? "" : "lg:col-span-2"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" /> Low stock
            </CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/inventory?filter=low">
                  View all <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {low.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Everything is above its reorder level. 🎉</p>
            ) : (
              <ul className="divide-y">
                {low.map((r) => (
                  <li key={String(r.variantId)} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/products/${r.productId}`} className="truncate hover:underline">
                      {r.name}
                      {r.variantName && <span className="text-muted-foreground"> · {r.variantName}</span>}
                    </Link>
                    <Badge variant={r.qty <= 0 ? "destructive" : "secondary"} className="tabular-nums">
                      {formatQty(r.qty, r.scale)} {r.unit}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {showMoney && (
          <Card>
            <CardHeader>
              <CardTitle>Top products</CardTitle>
              <CardDescription>Last 30 days by revenue</CardDescription>
            </CardHeader>
            <CardContent>
              {top.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sales will show up here.</p>
              ) : (
                <ul className="space-y-3">
                  {top.map((p) => {
                    const pct = Math.max(4, Math.round((p.revenue / top[0].revenue) * 100));
                    return (
                      <li key={String(p._id)} className="space-y-1 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{p.name}</span>
                          <span className="tabular-nums text-muted-foreground">{money(p.revenue)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent sales</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/sales">
                  All sales <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">No sales yet. Ring up your first bill!</p>
                <Button asChild>
                  <Link href="/pos">Open Point of Sale</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {recent.map((r) => (
                  <li key={String(r._id)}>
                    <Link href={`/sales/${r._id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-muted/40">
                      <span className="min-w-0">
                        <span className="font-medium">{r.number}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.customer?.name || "Walk-in"} · {formatDate(r.completedAt!, tz, s.locale, true)}
                        </span>
                      </span>
                      <span className={`tabular-nums ${r.kind === "return" ? "text-destructive" : ""}`}>
                        {r.kind === "return" ? "−" : ""}
                        {money(r.grandTotal ?? 0)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {expiring.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4 text-destructive" /> Expiring soon
              </CardTitle>
              <CardDescription>Within 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {expiring.slice(0, 8).map((b) => (
                  <li key={b.batchId} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {b.name} <span className="text-muted-foreground">#{b.batchNo}</span>
                    </span>
                    <Badge variant={b.expired ? "destructive" : "outline"}>{b.expired ? "Expired" : formatDate(b.expiry, tz, s.locale)}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </PageBody>
  );
}
