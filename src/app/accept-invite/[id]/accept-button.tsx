"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function AcceptButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      className="w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await authClient.organization.acceptInvitation({ invitationId: id });
        if (res.error) {
          setPending(false);
          return toast.error(res.error.message ?? "Could not accept the invitation");
        }
        await authClient.organization.setActive({ organizationId: res.data.invitation.organizationId });
        router.replace("/dashboard");
        router.refresh();
      }}
    >
      {pending && <Spinner />} Accept invitation
    </Button>
  );
}
