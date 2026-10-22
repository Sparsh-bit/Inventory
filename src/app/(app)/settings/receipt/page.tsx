import type { Metadata } from "next";
import { getOrgSettings, requireCtx } from "@/server/context";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { ReceiptForm } from "@/components/settings/receipt-form";

export const metadata: Metadata = { title: "Receipts & numbering" };

export default async function ReceiptSettingsPage() {
  const ctx = await requireCtx("settings:manage");
  const s = await getOrgSettings(ctx.orgId);
  return (
    <PageBody className="max-w-3xl">
      <PageHeader title="Receipts & numbering" back={{ href: "/settings", label: "Settings" }} />
      <ReceiptForm
        initial={{
          paperWidth: (s.receipt?.paperWidth ?? 80) as 58 | 80, header: s.receipt?.header ?? "", footer: s.receipt?.footer ?? "", showHsn: !!s.receipt?.showHsn,
          showUpiQr: !!s.receipt?.showUpiQr, upiId: s.receipt?.upiId ?? "",
          prefixes: { sale: s.prefixes?.sale ?? "S", invoice: s.prefixes?.invoice ?? "INV", return: s.prefixes?.return ?? "CN", purchase: s.prefixes?.purchase ?? "PO" },
          scanner: { interKeyMs: s.scanner?.interKeyMs ?? 35, minLength: s.scanner?.minLength ?? 4 },
        }}
        gst={s.taxMode === "GST"}
      />
    </PageBody>
  );
}
