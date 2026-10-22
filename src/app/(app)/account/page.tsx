import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { requireCtx } from "@/server/context";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { AccountSettings } from "@/components/settings/account-settings";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  await requireCtx();
  const h = await headers();
  const [session, sessions] = await Promise.all([auth.api.getSession({ headers: h }), auth.api.listSessions({ headers: h })]);
  return (
    <PageBody className="max-w-3xl">
      <PageHeader title="My account" />
      <AccountSettings
        user={{ name: session!.user.name, email: session!.user.email, twoFactorEnabled: !!(session!.user as { twoFactorEnabled?: boolean }).twoFactorEnabled }}
        currentSessionId={session!.session.id}
        sessions={sessions.map((s) => ({ id: s.id, token: s.token, userAgent: s.userAgent ?? "", ip: s.ipAddress ?? "", createdAt: new Date(s.createdAt).toISOString() }))}
      />
    </PageBody>
  );
}
