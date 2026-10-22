"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acceptInviteAction } from "@/server/actions/auth";
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
        const res = await acceptInviteAction({ invitationId: id });
        if (!res.ok) {
          setPending(false);
          return toast.error(res.error);
        }
        router.replace("/dashboard");
        router.refresh();
      }}
    >
      {pending && <Spinner />} Accept invitation
    </Button>
  );
}
