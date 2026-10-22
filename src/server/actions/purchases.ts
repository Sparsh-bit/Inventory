"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { objectId } from "@/lib/schemas";
import { cancelPurchase, receivePurchase, returnPurchase, savePurchaseOrder } from "../services/purchases";
import { withAuth } from "../with-auth";

const poInput = z
  .object({
    supplierId: objectId,
    locationId: objectId,
    expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    supplierInvoiceNo: z.string().trim().max(60).default(""),
    notes: z.string().trim().max(1000).default(""),
    lines: z.array(z.object({ variantId: objectId, qty: z.number().int().min(1).max(1e9), unitCost: z.number().int().min(0).max(1e13) }).strict()).min(1, "Add at least one item").max(500),
  })
  .strict();

export const savePO = withAuth("purchases:write", z.object({ id: objectId.nullable(), data: poInput }).strict(), async (ctx, { id, data }) => {
  const r = await savePurchaseOrder(ctx, id, data);
  revalidatePath("/purchases");
  return r;
});

export const receivePO = withAuth(
  "purchases:write",
  z.object({
    id: objectId,
    lines: z.array(z.object({ lineId: objectId, qty: z.number().int().min(0).max(1e9), batchNo: z.string().trim().max(40).optional(), expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), unitCost: z.number().int().min(0).max(1e13).optional(), serials: z.array(z.string().trim().min(1).max(64)).max(2000).optional() }).strict()).min(1).max(500),
  }).strict(),
  async (ctx, { id, lines }) => {
    const r = await receivePurchase(ctx, id, lines);
    revalidatePath(`/purchases/${id}`);
    return r;
  },
);

export const returnPO = withAuth(
  "purchases:write",
  z.object({ id: objectId, lines: z.array(z.object({ lineId: objectId, qty: z.number().int().min(0).max(1e9), batchNo: z.string().trim().max(40).optional(), serials: z.array(z.string().trim().min(1).max(64)).max(2000).optional() }).strict()).min(1).max(500) }).strict(),
  async (ctx, { id, lines }) => {
    await returnPurchase(ctx, id, lines);
    revalidatePath(`/purchases/${id}`);
    return null;
  },
);

export const cancelPO = withAuth("purchases:write", z.object({ id: objectId }).strict(), async (ctx, { id }) => {
  await cancelPurchase(ctx, id);
  revalidatePath(`/purchases/${id}`);
  return null;
});
