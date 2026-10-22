"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { KeyRound, Laptop, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { changePasswordAction, confirmTwoFactorAction, disableTwoFactorAction, enableTwoFactorAction } from "@/server/actions/auth";
import { FormField } from "@/components/app/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  user: { name: string; email: string; twoFactorEnabled: boolean };
  currentSessionId: string;
  sessions: { id: string; token: string; userAgent: string; ip: string; createdAt: string }[];
}

const device = (ua: string) => {
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return { label: `${br} on ${os}`, mobile: /Android|iPhone|iPad/.test(ua) };
};

export function AccountSettings({ user, currentSessionId, sessions }: Props) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | undefined>();
  const [twoFa, setTwoFa] = useState<{ step: "password" | "verify" | "codes"; qr?: string; codes?: string[]; enabling: boolean } | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy("name");
    const r = await authClient.updateUser({ name: name.trim() });
    setBusy(null);
    if (r.error) return toast.error(r.error.message ?? "Could not update");
    toast.success("Name updated");
    router.refresh();
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next = String(f.get("new"));
    if (next.length < 10) return setPwErr("Use at least 10 characters.");
    if (next !== String(f.get("confirm"))) return setPwErr("Passwords don't match.");
    setPwErr(undefined);
    setBusy("pw");
    const r = await changePasswordAction({ currentPassword: String(f.get("current")), newPassword: next });
    setBusy(null);
    if (!r.ok) return setPwErr(r.error);
    toast.success("Password changed. Other devices were signed out.");
    e.currentTarget.reset();
    router.refresh();
  }

  async function twoFactorPassword() {
    setBusy("2fa");
    if (twoFa?.enabling) {
      const r = await enableTwoFactorAction({ password });
      setBusy(null);
      if (!r.ok) return toast.error(r.error);
      setTwoFa({ step: "verify", enabling: true, qr: await QRCode.toDataURL(r.data.totpURI, { margin: 1, width: 200 }), codes: r.data.backupCodes });
    } else {
      const r = await disableTwoFactorAction({ password });
      setBusy(null);
      if (!r.ok) return toast.error(r.error);
      toast.success("Two-step verification turned off");
      setTwoFa(null);
      router.refresh();
    }
    setPassword("");
  }

  async function verify() {
    setBusy("2fa");
    const r = await confirmTwoFactorAction({ code: code.replace(/\s/g, "") });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setTwoFa((t) => (t ? { ...t, step: "codes" } : t));
    setCode("");
  }

  async function revoke(token: string) {
    const r = await authClient.revokeSession({ token });
    if (r.error) return toast.error(r.error.message ?? "Could not sign out that device");
    toast.success("Device signed out");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle><CardDescription>{user.email}</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={saveName} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <FormField label="Your name" className="flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></FormField>
            <Button type="submit" disabled={busy === "name" || name.trim() === user.name}>{busy === "name" && <Spinner />} Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> Password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={changePassword}>
            <FieldGroup>
              <FormField label="Current password"><PasswordInput name="current" autoComplete="current-password" required /></FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="New password" error={pwErr}><PasswordInput name="new" autoComplete="new-password" required minLength={10} /></FormField>
                <FormField label="Confirm new password"><PasswordInput name="confirm" autoComplete="new-password" required /></FormField>
              </div>
              <div><Button type="submit" disabled={busy === "pw"}>{busy === "pw" && <Spinner />} Change password</Button></div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> Two-step verification {user.twoFactorEnabled ? <Badge>On</Badge> : <Badge variant="outline">Off</Badge>}</CardTitle>
          <CardDescription>Ask for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) when signing in.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant={user.twoFactorEnabled ? "outline" : "default"} onClick={() => setTwoFa({ step: "password", enabling: !user.twoFactorEnabled })}>
            {user.twoFactorEnabled ? "Turn off" : "Turn on two-step verification"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Signed-in devices</CardTitle><CardDescription>Sign out anything you don&apos;t recognise.</CardDescription></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {sessions.map((s) => {
              const d = device(s.userAgent);
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  {d.mobile ? <Smartphone className="size-4 text-muted-foreground" /> : <Laptop className="size-4 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block">{d.label} {s.id === currentSessionId && <Badge variant="secondary">This device</Badge>}</span>
                    <span className="text-xs text-muted-foreground">{s.ip || "Unknown IP"} · since {new Date(s.createdAt).toLocaleDateString()}</span>
                  </span>
                  {s.id !== currentSessionId && <Button variant="ghost" size="sm" onClick={() => revoke(s.token)}><LogOut /> Sign out</Button>}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={!!twoFa} onOpenChange={(o) => { if (!o) { setTwoFa(null); router.refresh(); } }}>
        <DialogContent>
          {twoFa?.step === "password" && (
            <>
              <DialogHeader><DialogTitle>Confirm your password</DialogTitle></DialogHeader>
              <PasswordInput aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
              <DialogFooter><Button onClick={twoFactorPassword} disabled={!password || busy === "2fa"}>{busy === "2fa" && <Spinner />} Continue</Button></DialogFooter>
            </>
          )}
          {twoFa?.step === "verify" && (
            <>
              <DialogHeader><DialogTitle>Scan with your authenticator app</DialogTitle><DialogDescription>Then enter the 6-digit code it shows.</DialogDescription></DialogHeader>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {twoFa.qr && <img src={twoFa.qr} alt="Authenticator QR code" className="mx-auto size-48 rounded-lg border bg-white p-2" />}
              <Input aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="text-center font-mono text-lg tracking-[0.3em]" maxLength={7} />
              <DialogFooter><Button onClick={verify} disabled={code.replace(/\s/g, "").length !== 6 || busy === "2fa"}>{busy === "2fa" && <Spinner />} Verify & turn on</Button></DialogFooter>
            </>
          )}
          {twoFa?.step === "codes" && (
            <>
              <DialogHeader><DialogTitle>Save your backup codes</DialogTitle><DialogDescription>Each code works once if you lose your phone. Store them somewhere safe.</DialogDescription></DialogHeader>
              <ul className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 font-mono text-sm">{twoFa.codes?.map((c) => <li key={c}>{c}</li>)}</ul>
              <DialogFooter>
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(twoFa.codes?.join("\n") ?? "").then(() => toast.success("Copied"))}>Copy</Button>
                <Button onClick={() => { setTwoFa(null); toast.success("Two-step verification is on"); router.refresh(); }}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
