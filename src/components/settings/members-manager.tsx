"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MailPlus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cancelInvitationAction, inviteMemberAction, removeMemberAction, updateMemberRoleAction } from "@/server/actions/auth";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { SelectField } from "@/components/app/select-field";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including settings, team and billing.",
  manager: "Sell, returns, stock, purchases, reports and costs. No settings or team changes.",
  cashier: "POS billing, customers and collecting dues. Can't see costs or reports.",
  stockkeeper: "Products, stock adjustments, transfers, counts and purchases. No billing.",
};
const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((r) => [r, ROLE_LABELS[r]] as const);

export function MembersManager({ currentUserId, members, invitations }: { currentUserId: string; members: { id: string; userId: string; name: string; email: string; role: string }[]; invitations: { id: string; email: string; role: string; expiresAt: string }[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "Something went wrong");
    toast.success(ok);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MailPlus className="size-4" /> Invite someone</CardTitle>
          <CardDescription>{ROLE_HELP[role]}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); act(() => inviteMemberAction({ email: email.trim(), role }), `Invitation sent to ${email}`).then(() => setEmail("")); }}>
            <Input type="email" required placeholder="name@example.com" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
            <SelectField aria-label="Role" className="w-full sm:w-44" value={role} onValueChange={(v) => setRole(v as Role)} options={ROLE_OPTIONS.filter(([r]) => r !== "owner")} />
            <Button type="submit" disabled={busy}>{busy && <Spinner />} Send invite</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <Table>
          <TableHeader><TableRow><TableHead className="pl-4">Member</TableHead><TableHead>Role</TableHead><TableHead className="w-12 pr-4" /></TableRow></TableHeader>
          <TableBody>
            {members.map((m) => {
              const self = m.userId === currentUserId;
              return (
                <TableRow key={m.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8"><AvatarFallback className="bg-primary/10 text-xs text-primary">{m.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <span><span className="block font-medium">{m.name} {self && <Badge variant="secondary">You</Badge>}</span><span className="text-xs text-muted-foreground">{m.email}</span></span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {self ? <span className="text-sm">{ROLE_LABELS[m.role as Role] ?? m.role}</span> : (
                      <SelectField aria-label={`Role for ${m.name}`} className="w-40" value={m.role} onValueChange={(v) => act(() => updateMemberRoleAction({ memberId: m.id, role: v }), "Role updated")} options={ROLE_OPTIONS} />
                    )}
                  </TableCell>
                  <TableCell className="pr-4">
                    {!self && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => confirm(`Remove ${m.name} from this business?`) && act(() => removeMemberAction({ memberId: m.id }), "Member removed")}><Trash2 /></Button>}
                  </TableCell>
                </TableRow>
              );
            })}
            {invitations.map((i) => (
              <TableRow key={i.id} className="text-muted-foreground">
                <TableCell className="pl-4">{i.email} <Badge variant="outline">Invited</Badge></TableCell>
                <TableCell>{ROLE_LABELS[i.role as Role] ?? i.role}</TableCell>
                <TableCell className="pr-4"><Button variant="ghost" size="icon-sm" aria-label={`Cancel invitation for ${i.email}`} onClick={() => act(() => cancelInvitationAction({ invitationId: i.id }), "Invitation cancelled")}><X /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader><CardTitle>What each role can do</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
            <div key={r} className="rounded-lg border p-3"><p className="font-medium">{ROLE_LABELS[r]}</p><p className="text-sm text-muted-foreground">{ROLE_HELP[r]}</p></div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
