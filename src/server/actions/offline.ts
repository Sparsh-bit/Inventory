"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { objectId } from "@/lib/schemas";
import { deviceFromToken, markReviewed, offlineSaleInput, posSnapshot, registerDevice, syncOfflineSale, type SyncResult } from "../services/offline";
import { withAuth } from "../with-auth";

export const registerTill = withAuth("pos:sell", z.object({ name: z.string().trim().min(1).max(60) }).strict(), (ctx, { name }) => registerDevice(ctx, name));

export const getPosSnapshot = withAuth("pos:sell", z.object({ locationId: objectId }).strict(), (ctx, { locationId }) => posSnapshot(ctx, locationId));

export const syncOfflineSales = withAuth(
  "pos:sell",
  z.object({ deviceToken: z.string().min(20).max(100), sales: z.array(offlineSaleInput).min(1).max(50) }).strict(),
  async (ctx, { deviceToken, sales }) => {
    const device = await deviceFromToken(ctx, deviceToken);
    const results: SyncResult[] = [];
    // In order: device numbers are sequential and each bill is its own transaction.
    for (const sale of sales) results.push(await syncOfflineSale(ctx, device.code, String(device._id), sale));
    revalidatePath("/sales");
    return results;
  },
);

export const markSaleReviewed = withAuth("sales:return", z.object({ saleId: objectId }).strict(), async (ctx, { saleId }) => {
  await markReviewed(ctx, saleId);
  revalidatePath(`/sales/${saleId}`);
  return null;
});
