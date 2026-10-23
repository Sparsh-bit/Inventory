"use server";
// Auth flows run as server actions so failures come back as data (HTTP 200) instead of
// 4xx responses that browsers log as console errors. Better Auth hooks (account lockout)
// still run for auth.api calls; per-IP limits are enforced here.
import { headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { safePath } from "@/lib/safe-path";
import { isRole } from "@/lib/permissions";
import { auth } from "../auth";
import { connectDb } from "../db";
import { AppError } from "../context";
import { RateLimit } from "../models";
import { toSafeError, withAuth, type ActionResult } from "../with-auth";

const email = z.email().max(200).transform((e) => e.toLowerCase().trim());
const password = z.string().min(1).max(128);
const newPassword = z.string().min(10, "Use at least 10 characters.").max(128);
const safeNext = z.string().max(300).refine((p) => safePath(p) !== null, "Invalid redirect");

/** The address our own proxy (Railway's edge) saw: the LAST X-Forwarded-For hop. Earlier hops are client-supplied. */
async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
}

/** Fixed-window limiter stored in Mongo (works across server instances). */
async function limited(bucket: string, max: number, windowSec: number) {
  await connectDb();
  const key = `${bucket}:${await clientIp()}`;
  const r = await RateLimit.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + windowSec * 1000) } },
    { upsert: true, returnDocument: "after" },
  );
  return (r?.count ?? 0) > max;
}

const TOO_MANY = { ok: false as const, error: "Too many attempts. Please wait a few minutes and try again." };
const message = (e: unknown, fallback: string) => (isAPIError(e) && e.body?.message ? e.body.message : fallback);

export async function signInAction(input: { email: string; password: string }): Promise<ActionResult<{ twoFactor: boolean }>> {
  const p = z.object({ email, password }).safeParse(input);
  if (!p.success) return { ok: false, error: "Incorrect email or password." };
  if (await limited("signin", 30, 900)) return TOO_MANY;
  try {
    const r = await auth.api.signInEmail({ body: p.data, headers: await headers() });
    return { ok: true, data: { twoFactor: "twoFactorRedirect" in r && !!r.twoFactorRedirect } };
  } catch (e) {
    if (isAPIError(e)) {
      if (e.status === "FORBIDDEN") return { ok: false, error: "UNVERIFIED" };
      if (e.status === "TOO_MANY_REQUESTS") return { ok: false, error: message(e, TOO_MANY.error) };
      return { ok: false, error: "Incorrect email or password." };
    }
    return { ok: false, ...toSafeError(e) };
  }
}

export async function signUpAction(input: { name: string; email: string; password: string; next: string }): Promise<ActionResult<null>> {
  const p = z.object({ name: z.string().trim().min(1, "Enter your name").max(100), email, password: newPassword, next: safeNext }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Please check the form." };
  if (await limited("signup", 10, 3600)) return TOO_MANY;
  try {
    await auth.api.signUpEmail({ body: { name: p.data.name, email: p.data.email, password: p.data.password, callbackURL: p.data.next }, headers: await headers() });
    return { ok: true, data: null };
  } catch (e) {
    if (isAPIError(e) && (e.status === "UNPROCESSABLE_ENTITY" || /exist/i.test(e.body?.message ?? ""))) return { ok: false, error: "An account with this email already exists. Try signing in." };
    return { ok: false, error: message(e, "Could not create the account.") };
  }
}

export async function resendVerificationAction(input: { email: string }): Promise<ActionResult<null>> {
  const p = z.object({ email }).safeParse(input);
  if (!p.success) return { ok: false, error: "Enter a valid email" };
  if (await limited("verify", 5, 3600)) return TOO_MANY;
  await auth.api.sendVerificationEmail({ body: { email: p.data.email, callbackURL: "/dashboard" }, headers: await headers() }).catch(() => undefined);
  return { ok: true, data: null };
}

export async function requestResetAction(input: { email: string }): Promise<ActionResult<null>> {
  const p = z.object({ email }).safeParse(input);
  if (!p.success) return { ok: false, error: "Enter a valid email" };
  if (await limited("reset", 5, 3600)) return TOO_MANY;
  // Same response whether or not the account exists.
  await auth.api.requestPasswordReset({ body: { email: p.data.email, redirectTo: "/reset-password" }, headers: await headers() }).catch(() => undefined);
  return { ok: true, data: null };
}

export async function resetPasswordAction(input: { token: string; newPassword: string }): Promise<ActionResult<null>> {
  const p = z.object({ token: z.string().min(10).max(500), newPassword }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid request" };
  if (await limited("reset-confirm", 10, 3600)) return TOO_MANY;
  try {
    await auth.api.resetPassword({ body: p.data, headers: await headers() });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e, "This reset link is invalid or has expired.") };
  }
}

export async function verifyTwoFactorAction(input: { code: string; backup: boolean; trustDevice: boolean }): Promise<ActionResult<null>> {
  const p = z.object({ code: z.string().trim().min(6).max(20), backup: z.boolean(), trustDevice: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false, error: "That code didn't work. Try again." };
  if (await limited("2fa", 10, 300)) return TOO_MANY;
  try {
    const body = { code: p.data.code, trustDevice: p.data.trustDevice };
    if (p.data.backup) await auth.api.verifyBackupCode({ body, headers: await headers() });
    else await auth.api.verifyTOTP({ body, headers: await headers() });
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: "That code didn't work. Try again." };
  }
}

/* ---------- signed-in account actions ---------- */

async function signedIn<T>(fn: (h: Headers) => Promise<T>, fallback: string): Promise<ActionResult<T>> {
  const h = await headers();
  if (!(await auth.api.getSession({ headers: h }))) return { ok: false, error: "Your session has expired. Please sign in again." };
  try {
    return { ok: true, data: await fn(h) };
  } catch (e) {
    return { ok: false, error: message(e, fallback) };
  }
}

export async function changePasswordAction(input: { currentPassword: string; newPassword: string }): Promise<ActionResult<null>> {
  const p = z.object({ currentPassword: password, newPassword }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid input" };
  if (await limited("pw-change", 10, 900)) return TOO_MANY;
  const res = await signedIn(async (h) => {
    await auth.api.changePassword({ body: { ...p.data, revokeOtherSessions: true }, headers: h });
    return null;
  }, "Could not change password");
  return res.ok || !/password/i.test(res.error) ? res : { ok: false, error: "Current password is incorrect." };
}

export async function enableTwoFactorAction(input: { password: string }): Promise<ActionResult<{ totpURI: string; backupCodes: string[] }>> {
  const p = z.object({ password }).safeParse(input);
  if (!p.success) return { ok: false, error: "Enter your password" };
  if (await limited("2fa-setup", 10, 900)) return TOO_MANY;
  return signedIn(async (h) => {
    const r = await auth.api.enableTwoFactor({ body: { password: p.data.password }, headers: h });
    if (!("totpURI" in r)) throw new Error("Authenticator setup is not available");
    return { totpURI: r.totpURI, backupCodes: r.backupCodes };
  }, "Incorrect password");
}

export async function confirmTwoFactorAction(input: { code: string }): Promise<ActionResult<null>> {
  const p = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Enter the 6-digit code" };
  if (await limited("2fa", 10, 300)) return TOO_MANY;
  return signedIn(async (h) => {
    await auth.api.verifyTOTP({ body: { code: p.data.code }, headers: h });
    return null;
  }, "That code didn't match. Check your phone's time and try again.");
}

export async function disableTwoFactorAction(input: { password: string }): Promise<ActionResult<null>> {
  const p = z.object({ password }).safeParse(input);
  if (!p.success) return { ok: false, error: "Enter your password" };
  if (await limited("2fa-setup", 10, 900)) return TOO_MANY;
  return signedIn(async (h) => {
    await auth.api.disableTwoFactor({ body: { password: p.data.password }, headers: h });
    return null;
  }, "Incorrect password");
}

export async function acceptInviteAction(input: { invitationId: string }): Promise<ActionResult<null>> {
  const p = z.object({ invitationId: z.string().min(10).max(64) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid invitation" };
  return signedIn(async (h) => {
    const r = await auth.api.acceptInvitation({ body: { invitationId: p.data.invitationId }, headers: h });
    if (r?.invitation) await auth.api.setActiveOrganization({ body: { organizationId: r.invitation.organizationId }, headers: h });
    return null;
  }, "This invitation is invalid or has expired.");
}

/* ---------- team management (owner only) ---------- */

const memberRole = z.string().refine((r) => isRole(r) && r !== "owner", "Invalid role");

/** Better Auth errors carry user-safe messages ("already a member", …); surface them. */
async function orgCall(fn: (h: Headers) => Promise<unknown>, fallback: string) {
  try {
    await fn(await headers());
  } catch (e) {
    throw new AppError("CONFLICT", message(e, fallback));
  }
  return null;
}

export const inviteMemberAction = withAuth("members:manage", z.object({ email, role: memberRole }).strict(), (ctx, i) =>
  orgCall((h) => auth.api.createInvitation({ body: { email: i.email, role: i.role as "cashier", organizationId: ctx.orgId }, headers: h }), "Could not send the invitation."),
);

export const updateMemberRoleAction = withAuth("members:manage", z.object({ memberId: z.string().min(10).max(64), role: z.string().refine(isRole, "Invalid role") }).strict(), (ctx, i) =>
  orgCall((h) => auth.api.updateMemberRole({ body: { memberId: i.memberId, role: i.role as "cashier", organizationId: ctx.orgId }, headers: h }), "Could not change the role."),
);

export const removeMemberAction = withAuth("members:manage", z.object({ memberId: z.string().min(10).max(64) }).strict(), (ctx, i) =>
  orgCall((h) => auth.api.removeMember({ body: { memberIdOrEmail: i.memberId, organizationId: ctx.orgId }, headers: h }), "Could not remove the member."),
);

export const cancelInvitationAction = withAuth("members:manage", z.object({ invitationId: z.string().min(10).max(64) }).strict(), (_ctx, i) =>
  orgCall((h) => auth.api.cancelInvitation({ body: { invitationId: i.invitationId }, headers: h }), "Could not cancel the invitation."),
);
