import type { Metadata } from "next";
import { getOrgSettings, requireCtx } from "@/server/context";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { BusinessForm } from "@/components/settings/business-form";

export const metadata: Metadata = { title: "Business profile" };

export default async function BusinessPage() {
  const ctx = await requireCtx("settings:manage");
  const s = await getOrgSettings(ctx.orgId);
  return (
    <PageBody className="max-w-3xl">
      <PageHeader title="Business profile" back={{ href: "/settings", label: "Settings" }} />
      <BusinessForm
        initial={{
          name: ctx.orgName, businessType: s.businessType, legalName: s.legalName ?? "", taxId: s.taxId ?? "", stateCode: s.stateCode ?? "",
          address: { line1: s.address?.line1 ?? "", line2: s.address?.line2 ?? "", city: s.address?.city ?? "", state: s.address?.state ?? "", postalCode: s.address?.postalCode ?? "", country: s.address?.country ?? "" },
          phone: s.phone ?? "", email: s.email ?? "", currency: s.currency, locale: s.locale, timezone: s.timezone, taxMode: s.taxMode as "GST", pricesIncludeTax: s.pricesIncludeTax,
          roundOff: s.roundOff, allowNegativeStock: s.allowNegativeStock, fiscalYearStartMonth: s.fiscalYearStartMonth, invoiceTerms: s.invoiceTerms ?? "", logoUrl: s.logoUrl ?? "",
        }}
      />
    </PageBody>
  );
}
