"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUpAction } from "@/server/actions/auth";
import { FormField } from "@/components/app/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | undefined>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 10) return setPwError("Use at least 10 characters.");
    if (password !== String(form.get("confirm"))) return setPwError("Passwords don't match.");
    setPwError(undefined);
    setPending(true);
    setError(null);
    const email = String(form.get("email"));
    const res = await signUpAction({ name: String(form.get("name")), email, password, next });
    setPending(false);
    if (!res.ok) return setError(res.error);
    router.push(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Set up your business in under two minutes. No card required.</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <FormField label="Your name">
            <Input name="name" autoComplete="name" required maxLength={100} autoFocus />
          </FormField>
          <FormField label="Work email">
            <Input name="email" type="email" autoComplete="email" required />
          </FormField>
          <FormField label="Password" description="At least 10 characters." error={pwError}>
            <PasswordInput name="password" autoComplete="new-password" required minLength={10} maxLength={128} />
          </FormField>
          <FormField label="Confirm password">
            <PasswordInput name="confirm" autoComplete="new-password" required />
          </FormField>
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending && <Spinner />} Create account
          </Button>
        </FieldGroup>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={next === "/onboarding" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`} className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
