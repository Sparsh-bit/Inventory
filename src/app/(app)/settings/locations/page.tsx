import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { Location } from "@/server/models";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { LocationEditor } from "@/components/settings/list-editors";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsPage() {
  const ctx = await requireCtx("settings:manage");
  const locations = await Location.find({ orgId: ctx.orgId }).sort({ isDefault: -1, name: 1 }).lean();
  return (
    <PageBody className="max-w-3xl">
      <PageHeader title="Locations" description="Each location keeps its own stock. Sell from stores, receive into warehouses, and transfer between them." back={{ href: "/settings", label: "Settings" }} />
      <LocationEditor locations={locations.map((l) => ({ id: String(l._id), name: l.name, kind: l.kind as "store", isDefault: l.isDefault, active: l.active }))} />
    </PageBody>
  );
}
