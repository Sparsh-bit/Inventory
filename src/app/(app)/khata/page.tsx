import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, MessageCircle, NotebookPen } from "lucide-react";
import { pageOf } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { countryCodeFor, waLink } from "@/lib/whatsapp";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Party, Types } from "@/server/models";
import { Pagination, SearchInput } from "@/components/app/list-controls";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { NewPartyButton } from "@/components/parties/party-form";
import { PaymentButton } from "@/components/parties/payment-button";
import { UdhaarButton } from "@/components/parties/udhaar-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Khata (Udhaar)" };
const PAGE = 30;

export default async function KhataPage({ searchParams }: PageProps<"/khata">) {
  const ctx = await requireCtx("parties:read");
  const sp = await searchParams;
  const canSuppliers = can(ctx.role, "purchases:read");
  const kind = sp.tab === "suppliers" && canSuppliers ? "supplier" : "customer";
  const canWrite = kind === "customer" ? can(ctx.role, "parties:write") : can(ctx.role, "purchases:write");
  const s = await getOrgSettings(ctx.orgId);
  const money = (m: number) => formatMoney(m, s.currency, s.locale);
  const page = pageOf(sp.page);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const filter: Record<string, unknown> = { orgId: ctx.orgId, kind, active: true };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { phone: rx }];
  }
  const sum = (k: string) => Party.aggregate<{ t: number }>([{ $match: { orgId: new Types.ObjectId(ctx.orgId), kind: k, active: true, balance: { $gt: 0 } } }, { $group: { _id: null, t: { $sum: "$balance" } } }]);
  const [rows, total, get, give] = await Promise.all([
    Party.find(filter, { name: 1, phone: 1, balance: 1, kind: 1 }).sort({ balance: -1, name: 1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
    Party.countDocuments(filter),
    sum("customer"),
    canSuppliers ? sum("supplier") : Promise.resolve([]),
  ]);
  const cc = countryCodeFor(s.currency);
  const tab = (k: "customers" | "suppliers", label: string) => (
    <Button asChild size="sm" variant={(k === "suppliers") === (kind === "supplier") ? "secondary" : "ghost"}>
      <Link href={k === "suppliers" ? "/khata?tab=suppliers" : "/khata"} aria-current={(k === "suppliers") === (kind === "supplier") ? "page" : undefined}>{label}</Link>
    </Button>
  );

  return (
    <PageBody>
      <PageHeader
        title="Khata (Udhaar)"
        description="Who owes you and whom you owe. Add udhaar and payments with dates and details; every entry shows on the person's statement."
        actions={canWrite && <NewPartyButton kind={kind} />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="You'll get (customers)" value={money(get[0]?.t ?? 0)} icon={ArrowDownLeft} tone="warning" />
        {canSuppliers && <StatCard label="You'll give (suppliers)" value={money(give[0]?.t ?? 0)} icon={ArrowUpRight} />}
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-1">
          {tab("customers", "Customers")}
          {canSuppliers && tab("suppliers", "Suppliers")}
        </div>
        <SearchInput placeholder="Name or phone" />
      </div>
      {rows.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <NotebookPen />
              </EmptyMedia>
              <EmptyTitle>{q ? "No matches" : kind === "customer" ? "No customers yet" : "No suppliers yet"}</EmptyTitle>
              <EmptyDescription>Add a {kind} to start their khata.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {rows.map((p) => {
              const remind = kind === "customer" && p.phone && p.balance > 0 ? waLink(p.phone, `Namaste ${p.name}, this is a reminder from ${ctx.orgName}. Your pending balance is ${money(p.balance)}. Thank you!`, cc) : null;
              return (
                <li key={String(p._id)} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <Link href={`/${kind}s/${p._id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium">{p.name}</span>
                    {p.phone && <span className="block text-xs text-muted-foreground">{p.phone}</span>}
                  </Link>
                  <span className={`tabular-nums sm:w-36 sm:text-right ${p.balance > 0 ? "font-semibold" : "text-muted-foreground"}`}>
                    {p.balance < 0 ? `Advance ${money(-p.balance)}` : money(p.balance)}
                    <span className="block text-xs font-normal text-muted-foreground">{p.balance > 0 ? (kind === "customer" ? "you'll get" : "you'll give") : "settled"}</span>
                  </span>
                  {canWrite && (
                    <div className="flex flex-wrap gap-2">
                      <UdhaarButton partyId={String(p._id)} partyName={p.name} kind={kind} size="sm" />
                      <PaymentButton partyId={String(p._id)} kind={kind} balance={p.balance} size="sm" variant="outline" />
                      {remind && (
                        <Button asChild size="sm" variant="outline">
                          <a href={remind} target="_blank" rel="noopener noreferrer" aria-label={`Remind ${p.name} on WhatsApp`}>
                            <MessageCircle /> Remind
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE} total={total} searchParams={sp} />
    </PageBody>
  );
}
