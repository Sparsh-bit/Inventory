import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { Location } from "@/server/models";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { StockEditor } from "@/components/inventory/stock-editor";

export const metadata: Metadata = { title: "Adjust stock" };

export default async function Page() {
  const ctx = await requireCtx("stock:write");
  const locations = await Location.find({ orgId: ctx.orgId, active: true }, { name: 1 }).sort({ isDefault: -1, name: 1 }).lean();
  return (
    <PageBody>
      <PageHeader title="Adjust stock" description="Correct stock for damage, loss, expiry or found items." back={{ href: "/inventory", label: "Inventory" }} />
      <StockEditor mode="adjust" locations={locations.map((l) => ({ id: String(l._id), name: l.name }))} />
    </PageBody>
  );
}
