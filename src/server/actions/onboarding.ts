"use server";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { z } from "zod";
import { BUSINESS_TYPES } from "@/lib/schemas";
import { auth } from "../auth";
import { connectDb } from "../db";
import { initializeBusiness, slugify } from "../services/onboarding";
import { toSafeError, type ActionResult } from "../with-auth";

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your business name").max(120),
    businessType: z.enum(BUSINESS_TYPES),
    currency: z.string().regex(/^[A-Z]{3}$/),
    locale: z.string().max(20),
    timezone: z.string().max(60),
    taxMode: z.enum(["GST", "VAT", "NONE"]),
    taxId: z.string().trim().toUpperCase().max(20).default(""),
    stateCode: z.string().regex(/^(\d{2})?$/).default(""),
    locationName: z.string().trim().min(1, "Name your first location").max(80),
    sample: z.boolean(),
  })
  .strict();

export async function createBusiness(input: z.input<typeof schema>): Promise<ActionResult<{ orgId: string }>> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) return { ok: false, error: "Please sign in again." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (parsed.data.taxMode === "GST" && parsed.data.taxId && !/^\d{2}[A-Z0-9]{13}$/.test(parsed.data.taxId)) return { ok: false, error: "GSTIN must be 15 characters." };

  await connectDb();
  let orgId: string | null = null;
  try {
    const org = await auth.api.createOrganization({ headers: h, body: { name: parsed.data.name, slug: slugify(parsed.data.name) } });
    if (!org) return { ok: false, error: "Could not create the business." };
    orgId = org.id;
    await auth.api.setActiveOrganization({ headers: h, body: { organizationId: org.id } });
    await initializeBusiness(
      { userId: session.user.id, userName: session.user.name, userEmail: session.user.email, orgId: org.id, orgName: org.name, role: "owner" },
      parsed.data,
    );
    return { ok: true, data: { orgId: org.id } };
  } catch (err) {
    if (orgId) {
      // Roll back a half-created business so the user can simply retry.
      await Promise.all(Object.values(mongoose.models).filter((m) => m.schema.path("orgId")).map((m) => m.deleteMany({ orgId }).catch(() => undefined)));
      await auth.api.deleteOrganization({ headers: h, body: { organizationId: orgId } }).catch(() => undefined);
    }
    return { ok: false, ...toSafeError(err) };
  }
}

export async function switchBusiness(organizationId: string): Promise<ActionResult<null>> {
  if (!/^[a-f0-9]{24}$/.test(organizationId)) return { ok: false, error: "Invalid business" };
  try {
    await auth.api.setActiveOrganization({ headers: await headers(), body: { organizationId } });
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, ...toSafeError(err) };
  }
}
