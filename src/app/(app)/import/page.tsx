import type { Metadata } from "next";
import { can } from "@/lib/permissions";
import { requireCtx } from "@/server/context";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { ImportWizard } from "@/components/import/import-wizard";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage() {
  const ctx = await requireCtx("import:run");
  const kinds = (
    [
      ["products", "Products", can(ctx.role, "products:write")],
      ["customers", "Customers", can(ctx.role, "parties:write")],
      ["suppliers", "Suppliers", can(ctx.role, "purchases:write")],
    ] as const
  ).filter(([, , ok]) => ok).map(([k, l]) => ({ value: k, label: l }));
  return (
    <PageBody className="max-w-4xl">
      <PageHeader title="Import data" description="Bring in products, customers or suppliers from Excel or CSV. Existing SKUs/phones are updated, new ones are created." />
      <ImportWizard kinds={kinds} />
    </PageBody>
  );
}
