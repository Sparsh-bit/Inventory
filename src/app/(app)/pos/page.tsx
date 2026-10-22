import type { Metadata } from "next";
import { getOrgSettings, requireCtx } from "@/server/context";
import { Location } from "@/server/models";
import { searchVariants } from "@/server/services/products";
import { PosScreen } from "@/components/pos/pos-screen";

export const metadata: Metadata = { title: "Point of Sale" };

export default async function PosPage() {
  const ctx = await requireCtx("pos:sell");
  const [settings, locations] = await Promise.all([getOrgSettings(ctx.orgId), Location.find({ orgId: ctx.orgId, active: true }).sort({ isDefault: -1, name: 1 }).lean()]);
  const defaultLoc = String(locations[0]?._id ?? "");
  const quick = defaultLoc ? await searchVariants(ctx, "", defaultLoc, 40) : [];
  return (
    <PosScreen
      locations={locations.map((l) => ({ id: String(l._id), name: l.name }))}
      quick={quick}
      config={{
        orgStateCode: settings.stateCode ?? "",
        roundOff: settings.roundOff,
        allowNegativeStock: settings.allowNegativeStock,
        upiId: settings.receipt?.upiId ?? "",
        orgName: ctx.orgName,
      }}
    />
  );
}
