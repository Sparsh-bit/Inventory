"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { objectId } from "@/lib/schemas";
import { cancelIrn, generateEwb, generateIrn, portalJson, saveEinvoiceSettings, testConnection } from "../services/einvoice";
import { withAuth } from "../with-auth";

const path = z.string().trim().regex(/^\/[A-Za-z0-9/._-]{1,120}$/, "Must start with / and contain only URL path characters");

export const saveEinvoice = withAuth(
  "settings:manage",
  z.object({
    enabled: z.boolean(),
    environment: z.enum(["sandbox", "production"]),
    baseUrl: z.string().trim().url().max(200),
    paths: z.object({ auth: path, invoice: path, cancel: path, ewb: path }).strict(),
    clientId: z.string().trim().max(200),
    username: z.string().trim().max(200),
    clientSecret: z.string().max(500).optional(),
    password: z.string().max(200).optional(),
    publicKey: z.string().trim().max(5000).refine((k) => !k || /-----BEGIN (RSA )?PUBLIC KEY-----/.test(k), "Paste the full public key including the BEGIN/END lines").optional(),
  }).strict(),
  async (ctx, input) => {
    await saveEinvoiceSettings(ctx, input);
    revalidatePath("/settings/einvoice");
    return null;
  },
);

export const testEinvoice = withAuth("settings:manage", z.object({}).strict(), async (ctx) => {
  await testConnection(ctx);
  return null;
});

export const createIrn = withAuth("sales:void", z.object({ saleId: objectId }).strict(), async (ctx, { saleId }) => {
  try {
    return await generateIrn(ctx, saleId);
  } finally {
    revalidatePath(`/sales/${saleId}`);
  }
});

export const voidIrn = withAuth("sales:void", z.object({ saleId: objectId, reason: z.enum(["1", "2", "3", "4"]), remark: z.string().trim().max(100) }).strict(), async (ctx, i) => {
  await cancelIrn(ctx, i.saleId, i.reason, i.remark);
  revalidatePath(`/sales/${i.saleId}`);
  return null;
});

const ewbDetails = z.object({
  transMode: z.enum(["1", "2", "3", "4"]),
  distance: z.number().int().min(0).max(4000),
  transId: z.string().trim().toUpperCase().regex(/^([0-9A-Z]{15})?$/, "Transporter ID is 15 characters").optional(),
  transName: z.string().trim().max(100).optional(),
  vehNo: z.string().trim().toUpperCase().regex(/^([A-Z0-9 ]{4,15})?$/, "Invalid vehicle number").optional(),
  vehType: z.enum(["R", "O"]).optional(),
  transDocNo: z.string().trim().max(15).optional(),
  transDocDt: z.string().regex(/^(\d{2}\/\d{2}\/\d{4})?$/).optional(),
}).strict();

export const createEwb = withAuth("sales:void", z.object({ saleId: objectId, details: ewbDetails }).strict(), async (ctx, { saleId, details }) => {
  const r = await generateEwb(ctx, saleId, details);
  revalidatePath(`/sales/${saleId}`);
  return r;
});

export const downloadGstJson = withAuth("sales:read", z.object({ saleId: objectId, type: z.enum(["einvoice", "ewaybill"]), details: ewbDetails.optional() }).strict(), async (ctx, i) => ({
  json: JSON.stringify(await portalJson(ctx, i.saleId, i.type, i.details), null, 2),
}));
