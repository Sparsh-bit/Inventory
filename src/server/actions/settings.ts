"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { objectId, receiptSettingsInput, settingsInput } from "@/lib/schemas";
import { auth } from "../auth";
import { AppError } from "../context";
import { OrgSettings, Product, TaxRate } from "../models";
import { audit } from "../services/system";
import { withAuth } from "../with-auth";

export const updateBusiness = withAuth("settings:manage", settingsInput.extend({ logoUrl: z.string().regex(/^(\/api\/files\/[a-f0-9]{32}\.(png|jpg|webp))?$/).default("") }), async (ctx, i) => {
  const { name, ...rest } = i;
  if (rest.taxMode === "GST" && rest.taxId && !/^\d{2}[A-Z0-9]{13}$/.test(rest.taxId)) throw new AppError("INVALID", "GSTIN must be 15 characters", { taxId: ["GSTIN must be 15 characters"] });
  if (name !== ctx.orgName) await auth.api.updateOrganization({ headers: await headers(), body: { organizationId: ctx.orgId, data: { name } } });
  await OrgSettings.updateOne({ orgId: ctx.orgId }, { $set: rest });
  await audit(ctx, "update", "settings", ctx.orgId, "Updated business settings");
  revalidatePath("/", "layout");
  return null;
});

export const updateReceipt = withAuth("settings:manage", receiptSettingsInput, async (ctx, i) => {
  await OrgSettings.updateOne({ orgId: ctx.orgId }, { $set: { receipt: { paperWidth: i.paperWidth, header: i.header, footer: i.footer, showHsn: i.showHsn, showUpiQr: i.showUpiQr, upiId: i.upiId }, prefixes: i.prefixes, scanner: i.scanner } });
  await audit(ctx, "update", "settings", ctx.orgId, "Updated receipt & numbering settings");
  revalidatePath("/", "layout");
  return null;
});

export const saveTaxRate = withAuth(
  "settings:manage",
  z.object({ id: objectId.nullable(), name: z.string().trim().min(1).max(60), rateBp: z.number().int().min(0).max(10000), cessBp: z.number().int().min(0).max(10000), isDefault: z.boolean() }).strict(),
  async (ctx, i) => {
    if (i.isDefault) await TaxRate.updateMany({ orgId: ctx.orgId }, { $set: { isDefault: false } });
    if (i.id) {
      const r = await TaxRate.updateOne({ orgId: ctx.orgId, _id: i.id }, { $set: { name: i.name, rateBp: i.rateBp, cessBp: i.cessBp, isDefault: i.isDefault } });
      if (!r.matchedCount) throw new AppError("NOT_FOUND", "Tax rate not found");
    } else await TaxRate.create({ orgId: ctx.orgId, name: i.name, rateBp: i.rateBp, cessBp: i.cessBp, isDefault: i.isDefault });
    await audit(ctx, i.id ? "update" : "create", "tax_rate", i.id ?? "", `Saved tax rate ${i.name}`);
    revalidatePath("/settings/taxes");
    return null;
  },
);

export const deleteTaxRate = withAuth("settings:manage", z.object({ id: objectId }).strict(), async (ctx, { id }) => {
  if (await Product.exists({ orgId: ctx.orgId, taxRateId: id })) throw new AppError("CONFLICT", "Products use this rate. Change them first.");
  await TaxRate.deleteOne({ orgId: ctx.orgId, _id: id });
  await audit(ctx, "delete", "tax_rate", id, "Deleted tax rate");
  revalidatePath("/settings/taxes");
  return null;
});
