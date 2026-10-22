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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    setPending(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({ email, password: String(form.get("password")) });
    setPending(false);
    if (error) {
      if (error.status === 403) {
        setUnverified(email);
        return;
      }
      setError(error.status === 429 ? (error.message ?? "Too many attempts. Please wait and try again.") : "Incorrect email or password.");
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      router.push("/two-factor");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function resend() {
    if (!unverified) return;
    await authClient.sendVerificationEmail({ email: unverified, callbackURL: "/dashboard" });
    toast.success("Verification email sent. Check your inbox.");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your StockPilot account.</p>
      </div>
      {unverified && (
        <Alert>
          <AlertDescription>
            Please verify your email first. We sent a link to <strong>{unverified}</strong>.{" "}
            <button type="button" onClick={resend} className="font-medium text-primary underline-offset-4 hover:underline">
              Resend link
            </button>
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <FormField label="Email">
            <Input name="email" type="email" autoComplete="email" required autoFocus />
          </FormField>
          <FormField label="Password">
            <PasswordInput name="password" autoComplete="current-password" required />
          </FormField>
          <div className="-mt-2 text-right">
            <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending && <Spinner />} Sign in
          </Button>
        </FieldGroup>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New to StockPilot?{" "}
        <Link href="/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
