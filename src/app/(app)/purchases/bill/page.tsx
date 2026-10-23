import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/server/context";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PoForm } from "@/components/purchases/po-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { poFormData } from "../form-data";

export const metadata: Metadata = { title: "Add purchase bill" };

export default async function PurchaseBillPage({ searchParams }: PageProps<"/purchases/bill">) {
  const ctx = await requireCtx("purchases:write");
  const { supplier } = await searchParams;
  const data = await poFormData(ctx);
  return (
    <PageBody>
      <PageHeader
        title="Add purchase bill"
        description="Goods already arrived? Enter the supplier's bill: stock goes up, the bill goes on the supplier's khata, and you can record what you paid and attach a photo of the bill."
        back={{ href: "/purchases", label: "Purchases" }}
      />
      {data.suppliers.length === 0 && (
        <Alert className="mb-4">
          <AlertDescription>
            You don&apos;t have any suppliers yet. <Link className="font-medium underline" href="/suppliers?new=1">Add a supplier</Link> first.
          </AlertDescription>
        </Alert>
      )}
      <PoForm {...data} mode="bill" defaultSupplierId={typeof supplier === "string" ? supplier : undefined} />
    </PageBody>
  );
}
