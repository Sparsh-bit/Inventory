import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, isRole, type Permission, type Role } from "@/lib/permissions";
import { auth } from "./auth";
import { connectDb } from "./db";
import { OrgSettings, type OrgSettingsDoc } from "./models";

export interface Ctx {
  userId: string;
  userName: string;
  userEmail: string;
  orgId: string;
  orgName: string;
  role: Role;
  ip?: string;
  ua?: string;
}

export class AppError extends Error {
  constructor(
    public code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT" | "INSUFFICIENT_STOCK" | "CREDIT_LIMIT" | "UNAUTHENTICATED",
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

/** Resolves the signed-in user + active business, or null. Memoized per request. */
export const loadCtx = cache(async (): Promise<Ctx | null> => {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) return null;
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return null;
  const org = await auth.api.getFullOrganization({ headers: h, query: { organizationId: orgId, membersLimit: 0 } }).catch(() => null);
  const member = await auth.api.getActiveMember({ headers: h }).catch(() => null);
  if (!org || !member || !isRole(member.role)) return null;
  return {
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    orgId,
    orgName: org.name,
    role: member.role,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    ua: h.get("user-agent") ?? undefined,
  };
});

/** For pages: redirects to sign-in / onboarding, 403s on missing permission. */
export async function requireCtx(permission?: Permission): Promise<Ctx> {
  const ctx = await loadCtx();
  if (!ctx) {
    const session = await auth.api.getSession({ headers: await headers() });
    redirect(session ? "/onboarding" : "/sign-in");
  }
  if (permission && !can(ctx.role, permission)) redirect("/forbidden");
  return ctx;
}

export const getOrgSettings = cache(async (orgId: string): Promise<OrgSettingsDoc> => {
  await connectDb();
  const s = await OrgSettings.findOne({ orgId }).lean<OrgSettingsDoc>();
  if (!s) throw new AppError("NOT_FOUND", "Business settings missing");
  return s;
});
