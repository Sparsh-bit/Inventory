"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { objectId } from "@/lib/schemas";
import { AppError } from "../context";
import { Location } from "../models";
import { adjustStock, batchesFor, postStockCount, transferStock } from "../services/inventory";
import { audit } from "../services/system";
import { withAuth } from "../with-auth";

const qtyInt = z.number().int().min(-1e9).max(1e9);

export const adjust = withAuth(
  "stock:write",
  z.object({ locationId: objectId, reason: z.string().trim().min(2, "Give a reason").max(200), lines: z.array(z.object({ variantId: objectId, batchId: objectId.nullable(), qtyDelta: qtyInt.refine((n) => n !== 0, "Quantity can't be zero") }).strict()).min(1).max(500) }).strict(),
  async (ctx, input) => {
    await adjustStock(ctx, input);
    revalidatePath("/inventory");
    return null;
  },
);

export const transfer = withAuth(
  "stock:write",
  z.object({ fromId: objectId, toId: objectId, note: z.string().trim().max(200).default(""), lines: z.array(z.object({ variantId: objectId, batchId: objectId.nullable(), qty: z.number().int().min(1).max(1e9) }).strict()).min(1).max(500) }).strict(),
  async (ctx, input) => {
    await transferStock(ctx, input);
    revalidatePath("/inventory");
    return null;
  },
);

export const count = withAuth(
  "stock:write",
  z.object({ locationId: objectId, lines: z.array(z.object({ variantId: objectId, batchId: objectId.nullable(), counted: z.number().int().min(0).max(1e9) }).strict()).min(1).max(2000) }).strict(),
  async (ctx, input) => {
    const r = await postStockCount(ctx, input);
    revalidatePath("/inventory");
    return r;
  },
);

export const variantBatches = withAuth("stock:read", z.object({ variantId: objectId, locationId: objectId }).strict(), (ctx, i) => batchesFor(ctx, i.variantId, i.locationId));

const locationInput = z.object({ id: objectId.nullable(), name: z.string().trim().min(1).max(80), kind: z.enum(["store", "warehouse"]), isDefault: z.boolean(), active: z.boolean() }).strict();

export const saveLocation = withAuth("settings:manage", locationInput, async (ctx, i) => {
  if (i.isDefault && !i.active) throw new AppError("INVALID", "The default location must be active.");
  if (i.isDefault) await Location.updateMany({ orgId: ctx.orgId }, { $set: { isDefault: false } });
  if (i.id) {
    const cur = await Location.findOne({ orgId: ctx.orgId, _id: i.id });
    if (!cur) throw new AppError("NOT_FOUND", "Location not found");
    if (cur.isDefault && !i.isDefault) throw new AppError("INVALID", "Choose another default location first.");
    cur.set({ name: i.name, kind: i.kind, isDefault: i.isDefault, active: i.active });
    await cur.save();
  } else {
    await Location.create({ orgId: ctx.orgId, name: i.name, kind: i.kind, isDefault: i.isDefault, active: true });
  }
  await audit(ctx, i.id ? "update" : "create", "location", i.id ?? "", `Saved location ${i.name}`);
  revalidatePath("/settings/locations");
  return null;
});
