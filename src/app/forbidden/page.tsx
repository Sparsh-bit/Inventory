import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function ForbiddenPage() {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlert />
          </EmptyMedia>
          <EmptyTitle>You don&apos;t have access to this page</EmptyTitle>
          <EmptyDescription>Ask the business owner to change your role if you need it.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
