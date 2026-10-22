"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function ForgotPasswordPage() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    await authClient.requestPasswordReset({ email: String(new FormData(e.currentTarget).get("email")), redirectTo: "/reset-password" });
    setPending(false);
    setSent(true); // same message whether or not the account exists
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">We&apos;ll email you a link to choose a new one.</p>
      </div>
      {sent ? (
        <Alert>
          <AlertDescription>If an account exists for that email, a reset link is on its way.</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <FormField label="Email">
              <Input name="email" type="email" autoComplete="email" required autoFocus />
            </FormField>
            <Button type="submit" size="lg" disabled={pending} className="w-full">
              {pending && <Spinner />} Send reset link
            </Button>
          </FieldGroup>
        </form>
      )}
      <p className="text-center text-sm">
        <Link href="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
