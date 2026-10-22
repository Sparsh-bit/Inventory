import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { requireCtx } from "@/server/context";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { MembersManager } from "@/components/settings/members-manager";

export const metadata: Metadata = { title: "Team & roles" };

export default async function MembersPage() {
  const ctx = await requireCtx("members:manage");
  const h = await headers();
  const [members, invitations] = await Promise.all([
    auth.api.listMembers({ headers: h, query: { organizationId: ctx.orgId } }),
    auth.api.listInvitations({ headers: h, query: { organizationId: ctx.orgId } }),
  ]);
  return (
    <PageBody className="max-w-4xl">
      <PageHeader title="Team & roles" description="Invite staff by email. Each role only sees what it needs." back={{ href: "/settings", label: "Settings" }} />
      <MembersManager
        currentUserId={ctx.userId}
        members={members.members.map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, role: m.role }))}
        invitations={invitations.filter((i) => i.status === "pending").map((i) => ({ id: i.id, email: i.email, role: i.role ?? "cashier", expiresAt: new Date(i.expiresAt).toISOString() }))}
      />
    </PageBody>
  );
}
