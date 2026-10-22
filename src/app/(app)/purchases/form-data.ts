import "server-only";
import type { Ctx } from "@/server/context";
import { Location, Party } from "@/server/models";

export async function poFormData(ctx: Ctx) {
  const [suppliers, locations] = await Promise.all([
    Party.find({ orgId: ctx.orgId, kind: "supplier", active: true }, { name: 1 }).sort({ name: 1 }).lean(),
    Location.find({ orgId: ctx.orgId, active: true }, { name: 1 }).sort({ isDefault: -1, name: 1 }).lean(),
  ]);
  return {
    suppliers: suppliers.map((s) => ({ id: String(s._id), name: s.name })),
    locations: locations.map((l) => ({ id: String(l._id), name: l.name })),
  };
}
