import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { loadCtx } from "@/server/context";
import { Logo } from "@/components/app/logo";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your business" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { new: addAnother } = await searchParams;
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect("/sign-in");
  if (!addAnother && (await loadCtx())) redirect("/dashboard");
  const invitations = (await auth.api.listUserInvitations({ headers: h }).catch(() => [])).filter((i) => i.status === "pending");

  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <OnboardingForm
          userName={session.user.name}
          invitations={invitations.map((i) => ({ id: i.id, organizationName: (i as { organizationName?: string }).organizationName ?? "a business", role: i.role }))}
        />
      </main>
    </div>
  );
}
