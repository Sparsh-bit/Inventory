import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { formatDate, pageOf } from "@/lib/format";
import { getOrgSettings, requireCtx } from "@/server/context";
import { AuditLog } from "@/server/models";
import { FilterSelect, Pagination, SearchInput } from "@/components/app/list-controls";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Audit log" };
const PAGE = 50;
const ENTITIES = ["sale", "product", "purchase", "stock", "customer", "supplier", "settings", "category", "location", "tax_rate", "report", "products"];

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const ctx = await requireCtx("audit:read");
  const sp = await searchParams;
  const s = await getOrgSettings(ctx.orgId);
  const page = pageOf(sp.page);
  const filter: Record<string, unknown> = { orgId: ctx.orgId };
  if (typeof sp.entity === "string" && ENTITIES.includes(sp.entity)) filter.entity = sp.entity;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ summary: rx }, { userName: rx }];
  }
  const [rows, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(), AuditLog.countDocuments(filter)]);
  return (
    <PageBody>
      <PageHeader title="Audit log" description="A permanent record of every change made in this business." back={{ href: "/settings", label: "Settings" }} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search activity or person" />
        <FilterSelect param="entity" placeholder="All areas" options={ENTITIES.map((e) => ({ value: e, label: e.replace("_", " ") }))} />
      </div>
      {rows.length === 0 ? (
        <Card><Empty><EmptyHeader><EmptyMedia variant="icon"><ClipboardList /></EmptyMedia><EmptyTitle>No activity found</EmptyTitle></EmptyHeader></Empty></Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">When</TableHead><TableHead>Who</TableHead><TableHead>What</TableHead><TableHead className="hidden pr-4 lg:table-cell">From</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={String(r._id)}>
                  <TableCell className="whitespace-nowrap pl-4 text-muted-foreground">{formatDate(r.createdAt, s.timezone, s.locale, true)}</TableCell>
                  <TableCell>{r.userName}</TableCell>
                  <TableCell><Badge variant="outline" className="mr-2 capitalize">{r.action}</Badge>{r.summary}</TableCell>
                  <TableCell className="hidden max-w-56 truncate pr-4 font-mono text-xs text-muted-foreground lg:table-cell" title={r.userAgent ?? ""}>{r.ip ?? "—"}</TableCell>
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
