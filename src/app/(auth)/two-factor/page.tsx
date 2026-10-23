"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { safePath } from "@/lib/safe-path";
import { verifyTwoFactorAction } from "@/server/actions/auth";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export default function TwoFactorPage() {
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [trust, setTrust] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    setPending(true);
    setError(null);
    const res = await verifyTwoFactorAction({ code, backup, trustDevice: trust });
    setPending(false);
    if (!res.ok) return setError(res.error);
    router.replace(safePath(new URLSearchParams(window.location.search).get("next")) ?? "/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Two-step verification</h1>
        <p className="text-sm text-muted-foreground">{backup ? "Enter one of your backup codes." : "Enter the 6-digit code from your authenticator app."}</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <FormField label={backup ? "Backup code" : "Authentication code"}>
            <Input name="code" inputMode={backup ? "text" : "numeric"} autoComplete="one-time-code" required autoFocus className="text-center font-mono text-lg tracking-[0.3em]" />
          </FormField>
          <div className="flex items-center gap-2">
            <Checkbox id="trust" checked={trust} onCheckedChange={(v) => setTrust(v === true)} />
            <Label htmlFor="trust" className="font-normal">Trust this device for 30 days</Label>
          </div>
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending && <Spinner />} Verify
          </Button>
        </FieldGroup>
      </form>
      <button type="button" onClick={() => setBackup((b) => !b)} className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        {backup ? "Use authenticator app instead" : "Use a backup code"}
      </button>
    </div>
  );
}
