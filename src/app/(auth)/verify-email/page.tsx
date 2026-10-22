import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { email } = await searchParams;
  return (
    <div className="space-y-6 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <MailCheck className="size-6" />
      </span>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to {typeof email === "string" ? <strong className="text-foreground">{email}</strong> : "your email"}. Open it to
          activate your account.
        </p>
      </div>
      <Button asChild variant="outline" className="w-full">
        <Link href="/sign-in">Back to sign in</Link>
      </Button>
    </div>
  );
}
