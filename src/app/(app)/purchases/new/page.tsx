import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/server/context";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PoForm } from "@/components/purchases/po-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { poFormData } from "../form-data";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPurchasePage() {
  const ctx = await requireCtx("purchases:write");
  const data = await poFormData(ctx);
  return (
    <PageBody>
      <PageHeader title="New purchase order" back={{ href: "/purchases", label: "Purchases" }} />
      {data.suppliers.length === 0 && (
        <Alert className="mb-4">
          <AlertDescription>
            You don&apos;t have any suppliers yet. <Link className="font-medium underline" href="/suppliers?new=1">Add a supplier</Link> first.
          </AlertDescription>
        </Alert>
      )}
      <PoForm {...data} />
    </PageBody>
  );
}
