"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { FormField } from "@/components/app/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!token || invalid) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>This reset link is invalid or has expired.</AlertDescription>
        </Alert>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword.length < 10) return setError("Use at least 10 characters.");
    if (newPassword !== String(form.get("confirm"))) return setError("Passwords don't match.");
    setPending(true);
    const res = await authClient.resetPassword({ newPassword, token: token! });
    setPending(false);
    if (res.error) return setError(res.error.message ?? "Could not reset password.");
    toast.success("Password updated. Please sign in.");
    router.replace("/sign-in");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <FormField label="New password" description="At least 10 characters." error={error}>
            <PasswordInput name="password" autoComplete="new-password" required autoFocus />
          </FormField>
          <FormField label="Confirm password">
            <PasswordInput name="confirm" autoComplete="new-password" required />
          </FormField>
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending && <Spinner />} Update password
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
