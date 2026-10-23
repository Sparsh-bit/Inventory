import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Factory, Users } from "lucide-react";
import { formatDate, formatQty, pageOf } from "@/lib/format";
import { countryCodeFor, waLink } from "@/lib/whatsapp";
import { formatMoney } from "@/lib/money";
import { purchaseLineValue } from "@/lib/purchase";
import { can } from "@/lib/permissions";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Party, PurchaseOrder, Sale } from "@/server/models";
import { partyStatement } from "@/server/services/ledger";
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
import { UdhaarButton } from "./udhaar-button";
import { UndoEntryButton } from "./undo-entry";
import { HandCoins, MessageCircle, Paperclip, Receipt, ReceiptText, Wallet } from "lucide-react";

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
  const [docs, statement, stats] = await Promise.all([
    kind === "customer"
      ? Sale.find({ orgId: ctx.orgId, customerId: p._id, status: { $in: ["completed", "void"] } }, { number: 1, kind: 1, status: 1, grandTotal: 1, balanceDue: 1, completedAt: 1 }).sort({ completedAt: -1 }).limit(50).lean()
      : PurchaseOrder.find({ orgId: ctx.orgId, supplierId: p._id }, { number: 1, status: 1, supplierInvoiceNo: 1, receivedValue: 1, returnedValue: 1, amountPaid: 1, createdAt: 1, billDate: 1, lines: 1, attachments: 1 }).sort({ createdAt: -1 }).limit(50).lean(),
    partyStatement(ctx, String(p._id)),
    kind === "customer"
      ? Sale.aggregate<{ total: number; count: number }>([{ $match: { orgId: p.orgId, customerId: p._id, status: "completed", kind: { $ne: "return" } } }, { $group: { _id: null, total: { $sum: "$grandTotal" }, count: { $sum: 1 } } }])
      : PurchaseOrder.aggregate<{ total: number; count: number; paid?: number }>([{ $match: { orgId: p.orgId, supplierId: p._id } }, { $group: { _id: null, total: { $sum: { $subtract: ["$receivedValue", "$returnedValue"] } }, paid: { $sum: "$amountPaid" }, count: { $sum: 1 } } }]),
  ]);
  const a = p.address ?? {};
  const cc = countryCodeFor(s.currency);
  const reminder =
    kind === "customer" && p.phone && p.balance > 0
      ? waLink(p.phone, `Namaste ${p.name}, this is a reminder from ${ctx.orgName}. Your pending balance is ${money(p.balance)}. Please pay at your earliest convenience. Thank you!`, cc)
      : null;
  const labels = KIND_LABELS[kind];
  const canUndo = canWrite && can(ctx.role, "ledger:reverse");

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
              {reminder && (
                <Button asChild variant="outline">
                  <a href={reminder} target="_blank" rel="noopener noreferrer">
                    <MessageCircle /> Remind on WhatsApp
                  </a>
                </Button>
              )}
              {kind === "supplier" && (
                <Button asChild variant="outline">
                  <Link href={`/purchases/bill?supplier=${p._id}`}><ReceiptText /> Add purchase bill</Link>
                </Button>
              )}
              <UdhaarButton partyId={String(p._id)} partyName={p.name} kind={kind} />
              <PaymentButton partyId={String(p._id)} kind={kind} balance={p.balance} />
            </>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={kind === "customer" ? "Outstanding" : "Payable"} value={money(p.balance)} icon={Wallet} tone={p.balance > 0 ? "warning" : "default"} hint={kind === "customer" && p.creditLimit ? `Limit ${money(p.creditLimit)}` : undefined} />
        <StatCard label={kind === "customer" ? "Lifetime sales" : "Total purchased"} value={money(stats[0]?.total ?? 0)} icon={Receipt} />
        {kind === "customer" ? (
          <StatCard label="Bills" value={String(stats[0]?.count ?? 0)} icon={HandCoins} />
        ) : (
          <StatCard label="Total paid" value={money((stats[0] as { paid?: number } | undefined)?.paid ?? 0)} icon={HandCoins} hint={`${stats[0]?.count ?? 0} purchases`} />
        )}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Statement (khata)</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {statement.rows.length === 0 && !statement.broughtForward ? (
            <p className="px-6 text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <Table aria-label="Statement">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Date</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">{labels.plus}</TableHead>
                  <TableHead className="text-right">{labels.minus}</TableHead>
                  <TableHead className="pr-6 text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.broughtForward !== 0 && (
                  <TableRow>
                    <TableCell className="pl-6 text-muted-foreground">—</TableCell>
                    <TableCell>Balance brought forward</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="pr-6 text-right tabular-nums">{money(statement.broughtForward)}</TableCell>
                  </TableRow>
                )}
                {statement.rows.map((r) => (
                  <TableRow key={r.id} className={r.reversed ? "text-muted-foreground" : undefined}>
                    <TableCell className="whitespace-nowrap pl-6 align-top text-muted-foreground">{formatDate(r.date, s.timezone, s.locale)}</TableCell>
                    <TableCell className="min-w-48 whitespace-normal align-top">
                      <span className="font-medium">{labels[r.kind] ?? r.kind}</span>
                      {r.number &&
                        (r.docId && r.docKind !== "payment" ? (
                          <Link href={r.docKind === "sale" ? `/sales/${r.docId}` : `/purchases/${r.docId}`} className="ml-1 hover:underline">{r.number}</Link>
                        ) : (
                          <span className="ml-1 text-muted-foreground">{r.docKind === "payment" ? `against ${r.number}` : r.number}</span>
                        ))}
                      {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
                      {r.reversed ? (
                        <span className="mt-0.5 block text-xs">
                          <Badge variant="outline" className="mr-1">Reversed</Badge>
                          {r.reversed.reason} · {r.reversed.by}, {formatDate(r.reversed.at, s.timezone, s.locale)}
                        </span>
                      ) : (
                        canUndo && (r.kind === "udhaar" || r.kind === "payment") && <UndoEntryButton entryId={r.id} what={r.kind === "payment" ? "payment" : "udhaar entry"} amount={Math.abs(r.delta)} />
                      )}
                    </TableCell>
                    <TableCell className={`text-right align-top tabular-nums ${r.reversed ? "line-through" : ""}`}>{r.delta > 0 ? money(r.delta) : ""}</TableCell>
                    <TableCell className={`text-right align-top tabular-nums ${r.reversed ? "line-through" : "text-success"}`}>{r.delta < 0 ? money(-r.delta) : ""}</TableCell>
                    <TableCell className="pr-6 text-right align-top font-medium tabular-nums">{money(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{kind === "customer" ? "Bills" : "Purchases"}</CardTitle>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {docs.map((d) => {
                const isSale = "grandTotal" in d;
                const po = d as unknown as {
                  status: string; receivedValue: number; returnedValue: number; amountPaid: number; supplierInvoiceNo?: string; createdAt: Date; billDate?: Date | null;
                  lines: { name?: string; qtyOrdered: number; qtyReceived: number; unitCost: number; scale?: number; rateBp?: number }[];
                  attachments?: { url?: string; name?: string; type?: string }[];
                };
                const notReceived = !isSale && po.receivedValue === 0;
                const ordered = isSale ? 0 : po.lines.reduce((t, l) => t + purchaseLineValue(l.qtyOrdered, l.unitCost, l.scale ?? 1, l.rateBp ?? 0), 0);
                const amount = isSale ? (d.grandTotal ?? 0) : po.receivedValue - po.returnedValue;
                const paid = isSale ? amount - (d.balanceDue ?? 0) : po.amountPaid;
                const due = isSale ? (d.balanceDue ?? 0) : amount - po.amountPaid;
                return (
                  <li key={String(d._id)} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={isSale ? `/sales/${d._id}` : `/purchases/${d._id}`} className="min-w-0 hover:underline">
                        <span className="font-medium">{d.number}</span>
                        {!isSale && po.supplierInvoiceNo && <span className="text-muted-foreground"> · Bill {po.supplierInvoiceNo}</span>}
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(isSale ? (d as { completedAt: Date }).completedAt : (po.billDate ?? po.createdAt), s.timezone, s.locale)}
                          {"status" in d && d.status !== "completed" && d.status !== "received" && ` · ${d.status}`}
                        </span>
                      </Link>
                      <span className="shrink-0 text-right tabular-nums">
                        {notReceived ? (
                          <>
                            {money(ordered)}
                            <span className="block text-xs text-muted-foreground">{po.status === "cancelled" ? "cancelled" : "ordered, not received yet"}</span>
                          </>
                        ) : (
                          <>
                            <span className="font-medium">{money(amount)}</span>
                            {due > 0 ? (
                              <Badge variant="outline" className="ml-2 border-warning text-warning-foreground dark:text-warning">Due {money(due)}</Badge>
                            ) : (
                              amount > 0 && <Badge variant="outline" className="ml-2">Paid</Badge>
                            )}
                            <span className="block text-xs text-muted-foreground">Bill {money(amount)} · Paid {money(paid)} · Due {money(Math.max(0, due))}</span>
                          </>
                        )}
                      </span>
                    </div>
                    {!isSale && po.lines.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 rounded-md bg-muted/50 px-3 py-2 text-xs" aria-label={`Items on ${d.number}`}>
                        {po.lines.map((l, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span className="min-w-0 truncate">{l.name}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {formatQty(l.qtyReceived, l.scale ?? 1)} of {formatQty(l.qtyOrdered, l.scale ?? 1)} received × {money(l.unitCost)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!isSale && (po.attachments?.length ?? 0) > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {po.attachments!.map((f) => (
                          <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            <Paperclip className="size-3" /> {f.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageBody>
  );
}

const KIND_LABELS: Record<"customer" | "supplier", Record<string, string>> = {
  customer: { plus: "Udhaar / bills", minus: "Received", opening: "Opening balance", sale: "Bill on account", sale_void: "Bill voided", return: "Return credited", payment: "Payment received", udhaar: "Udhaar given", adjustment: "Adjustment", reversal: "Correction (undo)" },
  supplier: { plus: "Purchases", minus: "Paid", opening: "Opening balance", purchase: "Goods received", purchase_return: "Returned to supplier", payment: "Payment made", udhaar: "Udhaar taken", adjustment: "Adjustment", reversal: "Correction (undo)" },
};
