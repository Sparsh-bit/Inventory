import type { Metadata } from "next";
import { getOrgSettings, requireCtx } from "@/server/context";
import { getEinvoiceSettings } from "@/server/services/einvoice";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { EinvoiceSettingsForm } from "@/components/einvoice/settings-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = { title: "E-invoice & e-way bill" };

export default async function EinvoiceSettingsPage() {
  const ctx = await requireCtx("settings:manage");
  const [s, cfg] = await Promise.all([getOrgSettings(ctx.orgId), getEinvoiceSettings(ctx)]);
  return (
    <PageBody className="max-w-3xl">
      <PageHeader
        title="E-invoice & e-way bill"
        description="Register B2B invoices with the GST Invoice Registration Portal (IRN + QR) and create e-way bills, straight from StockPilot."
        back={{ href: "/settings", label: "Settings" }}
      />
      {s.taxMode !== "GST" ? (
        <Alert><AlertDescription>E-invoicing applies to GST-registered businesses. Switch the tax system to GST in Business profile to use it.</AlertDescription></Alert>
      ) : (
        <EinvoiceSettingsForm initial={cfg} gstin={s.taxId ?? ""} />
      )}
    </PageBody>
  );
}
