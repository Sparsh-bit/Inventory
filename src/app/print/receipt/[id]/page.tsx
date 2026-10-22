import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { formatMoney } from "@/lib/money";
import { pct, qtyText, receiptTitle, upiLink } from "@/lib/receipt";
import { requireCtx } from "@/server/context";
import { getReceiptData } from "@/server/services/receipt";
import { AutoPrint } from "../../auto-print";

export const metadata: Metadata = { title: "Receipt" };
const METHOD: Record<string, string> = { cash: "Cash", card: "Card", upi: "UPI", credit: "On account", other: "Other" };

export default async function ReceiptPrintPage({ params, searchParams }: PageProps<"/print/receipt/[id]">) {
  const ctx = await requireCtx("sales:read");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const d = await getReceiptData(ctx, id).catch(() => null);
  if (!d) notFound();
  const width = sp.w === "58" ? 58 : sp.w === "80" ? 80 : d.org.paperWidth;
  const m = (v: number) => formatMoney(v, d.org.currency, d.org.locale);
  const qr = d.org.showUpiQr && d.org.upiId && d.sale.kind !== "return" ? await QRCode.toDataURL(upiLink(d, d.sale.balanceDue || d.sale.grandTotal), { margin: 0, width: 160 }) : null;

  return (
    <div className="min-h-dvh bg-neutral-100 py-6 text-black print:bg-white print:py-0">
      <style>{`@media print { @page { size: ${width}mm auto; margin: 0 } html, body { background: #fff !important } }`}</style>
      <AutoPrint auto={sp.auto === "1"} />
      <article className="mx-auto bg-white px-[3mm] py-[4mm] font-mono text-[11px] leading-snug shadow print:shadow-none" style={{ width: `${width}mm` }}>
        <header className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {d.org.logoUrl && <img src={d.org.logoUrl} alt="" className="mx-auto mb-1 max-h-14 grayscale" />}
          <h1 className="text-[15px] font-bold leading-tight">{d.org.name}</h1>
          {d.org.legalName && d.org.legalName !== d.org.name && <p>{d.org.legalName}</p>}
          {d.org.address && <p>{d.org.address}</p>}
          {d.org.phone && <p>Ph: {d.org.phone}</p>}
          {d.org.taxId && <p>{d.org.taxMode === "GST" ? "GSTIN" : "Tax No"}: {d.org.taxId}</p>}
          {d.org.header && <p>{d.org.header}</p>}
          <p className="mt-1 font-bold">{receiptTitle(d)}</p>
          {d.sale.status === "void" && <p className="font-bold">*** VOID ***</p>}
        </header>
        <hr className="my-1.5 border-dashed border-black" />
        <div className="flex justify-between gap-2">
          <span>No: {d.sale.number}</span>
          <span>{d.sale.date}</span>
        </div>
        {d.sale.returnOfNumber && <p>Against: {d.sale.returnOfNumber}</p>}
        <p>Cashier: {d.sale.cashier}</p>
        {d.sale.customer && (
          <p>
            Customer: {d.sale.customer.name} {d.sale.customer.phone && `(${d.sale.customer.phone})`}
            {d.sale.customer.taxId && <><br />GSTIN: {d.sale.customer.taxId}</>}
          </p>
        )}
        <hr className="my-1.5 border-dashed border-black" />
        <table className="w-full">
          <thead>
            <tr className="border-b border-dashed border-black text-left">
              <th className="font-bold">Item</th>
              <th className="text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {d.sale.lines.map((l, i) => (
              <tr key={i} className="align-top">
                <td className="py-0.5 pr-1">
                  {l.name}
                  {d.org.showHsn && l.hsn && <span> [{l.hsn}]</span>}
                  <br />
                  <span className="text-neutral-700">
                    {qtyText(l.qty, l.scale)} {l.unit} × {m(l.unitPrice)}
                    {l.discount > 0 && ` (−${m(l.discount)})`}
                  </span>
                </td>
                <td className="py-0.5 text-right tabular-nums">{m(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-1.5 border-dashed border-black" />
        <dl className="space-y-0.5 [&>div]:flex [&>div]:justify-between">
          <div><dt>Subtotal</dt><dd>{m(d.sale.subtotal)}</dd></div>
          {d.sale.discountTotal > 0 && <div><dt>Discount</dt><dd>−{m(d.sale.discountTotal)}</dd></div>}
          {d.sale.taxSummary.map((t) => (
            <div key={t.rateBp} className="flex-col">
              {t.cgst > 0 && (
                <>
                  <span className="flex justify-between"><span>CGST {pct(t.rateBp / 2)}</span><span>{m(t.cgst)}</span></span>
                  <span className="flex justify-between"><span>SGST {pct(t.rateBp / 2)}</span><span>{m(t.sgst)}</span></span>
                </>
              )}
              {t.igst > 0 && <span className="flex justify-between"><span>IGST {pct(t.rateBp)}</span><span>{m(t.igst)}</span></span>}
              {t.vat > 0 && <span className="flex justify-between"><span>Tax {pct(t.rateBp)}</span><span>{m(t.vat)}</span></span>}
              {t.cess > 0 && <span className="flex justify-between"><span>Cess</span><span>{m(t.cess)}</span></span>}
            </div>
          ))}
          {d.sale.roundOff !== 0 && <div><dt>Round off</dt><dd>{m(d.sale.roundOff)}</dd></div>}
          <div className="border-t border-dashed border-black pt-1 text-[14px] font-bold"><dt>TOTAL</dt><dd>{m(d.sale.grandTotal)}</dd></div>
          {d.sale.payments.map((p, i) => <div key={i}><dt>{METHOD[p.method] ?? p.method}</dt><dd>{m(p.amount)}</dd></div>)}
          {d.sale.change > 0 && <div><dt>Change</dt><dd>{m(d.sale.change)}</dd></div>}
          {d.sale.balanceDue > 0 && <div className="font-bold"><dt>Balance due</dt><dd>{m(d.sale.balanceDue)}</dd></div>}
        </dl>
        {qr && (
          <div className="mt-2 text-center">
            <p>Scan to pay with UPI</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="UPI payment QR code" className="mx-auto size-28" />
          </div>
        )}
        {d.org.footer && <p className="mt-2 text-center">{d.org.footer}</p>}
      </article>
    </div>
  );
}
