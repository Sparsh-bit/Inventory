import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/server/auth";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { AcceptButton } from "./accept-button";

export default async function AcceptInvitePage({ params }: PageProps<"/accept-invite/[id]">) {
  const { id } = await params;
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const next = encodeURIComponent(`/accept-invite/${id}`);
  const invitation = session ? await auth.api.getInvitation({ headers: h, query: { id } }).catch(() => null) : null;

  return (
    <div className="grid min-h-dvh place-items-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-background p-8 text-center shadow-sm">
        <Logo className="justify-center" />
        {!session ? (
          <>
            <p className="text-muted-foreground">Sign in or create an account with the email address that received the invitation.</p>
            <div className="grid gap-2">
              <Button asChild>
                <Link href={`/sign-in?next=${next}`}>Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/sign-up?next=${next}`}>Create account</Link>
              </Button>
            </div>
          </>
        ) : invitation && invitation.status === "pending" ? (
          <>
            <p>
              Join <strong>{invitation.organizationName}</strong> as <strong>{invitation.role}</strong>?
            </p>
            <AcceptButton id={id} />
          </>
        ) : (
          <>
            <p className="text-muted-foreground">This invitation is invalid, expired, or was sent to a different email address.</p>
            <Button asChild variant="outline">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
