import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { Location } from "@/server/models";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { StockEditor } from "@/components/inventory/stock-editor";

export const metadata: Metadata = { title: "Stock count" };

export default async function Page() {
  const ctx = await requireCtx("stock:write");
  const locations = await Location.find({ orgId: ctx.orgId, active: true }, { name: 1 }).sort({ isDefault: -1, name: 1 }).lean();
  return (
    <PageBody>
      <PageHeader title="Stock count" description="Count what's on the shelf and fix any differences." back={{ href: "/inventory", label: "Inventory" }} />
      <StockEditor mode="count" locations={locations.map((l) => ({ id: String(l._id), name: l.name }))} />
    </PageBody>
  );
}
