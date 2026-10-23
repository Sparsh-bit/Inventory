import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { upiLink } from "@/lib/receipt";
import { requireCtx } from "@/server/context";
import { getReceiptData } from "@/server/services/receipt";
import { ReceiptView } from "@/components/print/receipt-view";
import { AutoPrint } from "../../auto-print";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPrintPage({ params, searchParams }: PageProps<"/print/receipt/[id]">) {
  const ctx = await requireCtx("sales:read");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const d = await getReceiptData(ctx, id).catch(() => null);
  if (!d) notFound();
  const width = sp.w === "58" ? 58 : sp.w === "80" ? 80 : d.org.paperWidth;
  const qr = d.org.showUpiQr && d.org.upiId && d.sale.kind !== "return" && d.sale.status !== "void" && d.sale.balanceDue > 0 ? await QRCode.toDataURL(upiLink(d, d.sale.balanceDue), { margin: 0, width: 160 }) : null;

  return (
    <div className="min-h-dvh bg-neutral-100 py-6 text-black print:bg-white print:py-0">
      <style>{`@media print { @page { size: ${width}mm auto; margin: 0 } html, body { background: #fff !important } }`}</style>
      <AutoPrint auto={sp.auto === "1"} />
      <ReceiptView d={d} width={width} qr={qr} />
    </div>
  );
}
