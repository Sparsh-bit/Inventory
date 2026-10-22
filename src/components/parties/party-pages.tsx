import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Factory, Users } from "lucide-react";
import { formatDate, pageOf, PAYMENT_LABELS } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Party, Payment, PurchaseOrder, Sale } from "@/server/models";
import { Pagination, SearchInput } from "@/components/app/list-controls";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditPartyButton, NewPartyButton } from "./party-form";
import { PaymentButton } from "./payment-button";
import { HandCoins, Receipt, Wallet } from "lucide-react";

const PAGE = 30;

export async function PartyListPage({ kind, searchParams }: { kind: "customer" | "supplier"; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await requireCtx(kind === "customer" ? "parties:read" : "purchases:read");
  const s = await getOrgSettings(ctx.orgId);
  const money = (m: number) => formatMoney(m, s.currency, s.locale);
  const page = pageOf(searchParams.page);
  const q = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 60) : "";
  const filter: Record<string, unknown> = { orgId: ctx.orgId, kind, active: true };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { phone: rx }, { taxId: rx }, { email: rx }];
  }
  if (searchParams.due === "1") filter.balance = { $gt: 0 };
  const [rows, total] = await Promise.all([Party.find(filter).sort({ name: 1 }).skip((page - 1) * PAGE).limit(PAGE).lean(), Party.countDocuments(filter)]);
  const canWrite = kind === "customer" ? can(ctx.role, "parties:write") : can(ctx.role, "purchases:write");
  const title = kind === "customer" ? "Customers" : "Suppliers";
  const Icon = kind === "customer" ? Users : Factory;

  return (
    <PageBody>
      <PageHeader
        title={title}
        description={kind === "customer" ? "People and businesses you sell to." : "Vendors you buy stock from."}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/export/${kind}s`} download>
                <Download /> Export
              </a>
            </Button>
            {canWrite && <NewPartyButton kind={kind} autoOpen={searchParams.new === "1"} />}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput placeholder="Name, phone, GSTIN or email" />
        <Button asChild variant={searchParams.due === "1" ? "secondary" : "ghost"} size="sm">
          <Link href={searchParams.due === "1" ? `/${kind}s` : `/${kind}s?due=1`}>{kind === "customer" ? "With dues only" : "Unpaid only"}</Link>
        </Button>
      </div>
      {rows.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon />
              </EmptyMedia>
              <EmptyTitle>{q ? "No matches" : `No ${title.toLowerCase()} yet`}</EmptyTitle>
              <EmptyDescription>{kind === "customer" ? "Customers can also be added right from the POS." : "Add the suppliers you purchase from."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">{s.taxMode === "GST" ? "GSTIN" : "Tax ID"}</TableHead>
                <TableHead className="pr-4 text-right">{kind === "customer" ? "They owe you" : "You owe them"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={String(p._id)} className="relative">
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/${kind}s/${p._id}`} className="after:absolute after:inset-0">{p.name}</Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{p.phone || "—"}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{p.taxId || "—"}</TableCell>
                  <TableCell className={`pr-4 text-right tabular-nums ${p.balance > 0 ? "font-semibold" : "text-muted-foreground"}`}>{money(p.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE} total={total} searchParams={searchParams} />
    </PageBody>
  );
}

export async function PartyDetailPage({ kind, id }: { kind: "customer" | "supplier"; id: string }) {
  const ctx = await requireCtx(kind === "customer" ? "parties:read" : "purchases:read");
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const p = await Party.findOne({ orgId: ctx.orgId, _id: id, kind }).lean();
  if (!p) notFound();
  const s = await getOrgSettings(ctx.orgId);
  const money = (m: number) => formatMoney(m, s.currency, s.locale);
  const canWrite = kind === "customer" ? can(ctx.role, "parties:write") : can(ctx.role, "purchases:write");
  const [docs, payments, stats] = await Promise.all([
    kind === "customer"
      ? Sale.find({ orgId: ctx.orgId, customerId: p._id, status: { $in: ["completed", "void"] } }, { number: 1, kind: 1, status: 1, grandTotal: 1, balanceDue: 1, completedAt: 1 }).sort({ completedAt: -1 }).limit(50).lean()
      : PurchaseOrder.find({ orgId: ctx.orgId, supplierId: p._id }, { number: 1, status: 1, receivedValue: 1, returnedValue: 1, amountPaid: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(50).lean(),
    Payment.find({ orgId: ctx.orgId, partyId: p._id }).sort({ createdAt: -1 }).limit(30).lean(),
    kind === "customer"
      ? Sale.aggregate<{ total: number; count: number }>([{ $match: { orgId: p.orgId, customerId: p._id, status: "completed", kind: { $ne: "return" } } }, { $group: { _id: null, total: { $sum: "$grandTotal" }, count: { $sum: 1 } } }])
      : PurchaseOrder.aggregate<{ total: number; count: number }>([{ $match: { orgId: p.orgId, supplierId: p._id } }, { $group: { _id: null, total: { $sum: "$receivedValue" }, count: { $sum: 1 } } }]),
  ]);
  const a = p.address ?? {};

  return (
    <PageBody className="max-w-5xl">
      <PageHeader
        back={{ href: `/${kind}s`, label: kind === "customer" ? "Customers" : "Suppliers" }}
        title={p.name}
        description={[p.phone, p.email, p.taxId && `${s.taxMode === "GST" ? "GSTIN" : "Tax ID"} ${p.taxId}`].filter(Boolean).join(" · ") || undefined}
        actions={
          canWrite && (
            <>
              <EditPartyButton
                kind={kind}
                party={{ id: String(p._id), kind, name: p.name, phone: p.phone, email: p.email, taxId: p.taxId, stateCode: p.stateCode, address: { line1: a.line1 ?? "", city: a.city ?? "", state: a.state ?? "", postalCode: a.postalCode ?? "" }, creditLimit: p.creditLimit, openingBalance: p.openingBalance, notes: p.notes }}
              />
              <PaymentButton partyId={String(p._id)} kind={kind} balance={p.balance} />
            </>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={kind === "customer" ? "Outstanding" : "Payable"} value={money(p.balance)} icon={Wallet} tone={p.balance > 0 ? "warning" : "default"} hint={kind === "customer" && p.creditLimit ? `Limit ${money(p.creditLimit)}` : undefined} />
        <StatCard label={kind === "customer" ? "Lifetime sales" : "Total purchased"} value={money(stats[0]?.total ?? 0)} icon={Receipt} />
        <StatCard label={kind === "customer" ? "Bills" : "Orders"} value={String(stats[0]?.count ?? 0)} icon={HandCoins} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{kind === "customer" ? "Bills" : "Purchase orders"}</CardTitle>
          </CardHeader>
          <CardContent>
            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {docs.map((d) => {
                  const isSale = "grandTotal" in d;
                  const amount = isSale ? (d.grandTotal ?? 0) : (d as { receivedValue: number; returnedValue: number }).receivedValue - (d as { returnedValue: number }).returnedValue;
                  const due = isSale ? (d.balanceDue ?? 0) : amount - (d as { amountPaid: number }).amountPaid;
                  return (
                    <li key={String(d._id)} className="flex items-center justify-between gap-2 py-2">
                      <Link href={isSale ? `/sales/${d._id}` : `/purchases/${d._id}`} className="min-w-0 hover:underline">
                        <span className="font-medium">{d.number}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(isSale ? (d as { completedAt: Date }).completedAt : (d as { createdAt: Date }).createdAt, s.timezone, s.locale)}
                          {"status" in d && d.status !== "completed" && ` · ${d.status}`}
                        </span>
                      </Link>
                      <span className="text-right tabular-nums">
                        {money(amount)}
                        {due > 0 && <Badge variant="outline" className="ml-2 border-warning text-warning-foreground dark:text-warning">Due {money(due)}</Badge>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded.</p>
            ) : (
              <ul className="divide-y text-sm">
                {payments.map((pay) => (
                  <li key={String(pay._id)} className="flex justify-between gap-2 py-2">
                    <span>
                      {PAYMENT_LABELS[pay.method]} {pay.reference && <span className="text-muted-foreground">· {pay.reference}</span>}
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(pay.createdAt, s.timezone, s.locale, true)}
                        {pay.allocations.length > 0 && ` · ${pay.allocations.map((x) => x.number).join(", ")}`}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums text-success">{money(pay.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
