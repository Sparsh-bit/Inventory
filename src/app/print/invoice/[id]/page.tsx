import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { formatMoney } from "@/lib/money";
import { pct, qtyText, receiptTitle, upiLink } from "@/lib/receipt";
import { INDIAN_STATES } from "@/lib/schemas";
import { requireCtx } from "@/server/context";
import { getReceiptData } from "@/server/services/receipt";
import { AutoPrint } from "../../auto-print";

export const metadata: Metadata = { title: "Invoice" };
const stateName = (code: string) => INDIAN_STATES.find(([c]) => c === code)?.[1] ?? code;

/** Spells an amount in words (Indian numbering for INR, international otherwise). */
function inWords(minor: number, currency: string): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`);
  const three = (n: number) => [n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred` : "", two(n % 100)].filter(Boolean).join(" ");
  const words = (n: number): string => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const units: [number, string][] = currency === "INR" ? [[1e7, "Crore"], [1e5, "Lakh"], [1e3, "Thousand"]] : [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]];
    for (const [v, name] of units) {
      if (n >= v) {
        parts.push(`${words(Math.floor(n / v))} ${name}`);
        n %= v;
      }
    }
    if (n) parts.push(three(n));
    return parts.join(" ");
  };
  const major = Math.floor(Math.abs(minor) / 100);
  const cents = Math.abs(minor) % 100;
  const [big, small] = currency === "INR" ? ["Rupees", "Paise"] : [currency, "cents"];
  return `${big} ${words(major)}${cents ? ` and ${two(cents)} ${small}` : ""} Only`;
}

export default async function InvoicePrintPage({ params, searchParams }: PageProps<"/print/invoice/[id]">) {
  const ctx = await requireCtx("sales:read");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const d = await getReceiptData(ctx, id).catch(() => null);
  if (!d) notFound();
  const m = (v: number) => formatMoney(v, d.org.currency, d.org.locale);
  const gst = d.org.taxMode === "GST";
  const qr = d.org.upiId && d.sale.kind !== "return" && d.sale.balanceDue > 0 ? await QRCode.toDataURL(upiLink(d, d.sale.balanceDue), { margin: 0, width: 140 }) : null;

  return (
    <div className="min-h-dvh bg-neutral-100 py-8 text-black print:bg-white print:py-0">
      <style>{`@media print { @page { size: A4; margin: 12mm } html, body { background: #fff !important } }`}</style>
      <AutoPrint auto={sp.auto === "1"} />
      <article className="mx-auto w-[210mm] max-w-full bg-white p-[12mm] text-[12px] leading-relaxed shadow print:w-auto print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b pb-4">
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {d.org.logoUrl && <img src={d.org.logoUrl} alt="" className="size-16 object-contain" />}
            <div>
              <h1 className="text-xl font-bold">{d.org.legalName || d.org.name}</h1>
              {d.org.address && <p>{d.org.address}</p>}
              <p>{[d.org.phone, d.org.email].filter(Boolean).join(" · ")}</p>
              {d.org.taxId && <p className="font-medium">{gst ? "GSTIN" : "Tax No"}: {d.org.taxId}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tracking-wide">{receiptTitle(d)}</p>
            {d.sale.status === "void" && <p className="font-bold text-red-600">VOID</p>}
            <p>No: <strong>{d.sale.number}</strong></p>
            <p>Date: {d.sale.date}</p>
            {d.sale.returnOfNumber && <p>Against invoice: {d.sale.returnOfNumber}</p>}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Bill to</p>
            {d.sale.customer ? (
              <>
                <p className="font-semibold">{d.sale.customer.name}</p>
                {d.sale.customer.address && <p>{d.sale.customer.address}</p>}
                {d.sale.customer.phone && <p>{d.sale.customer.phone}</p>}
                {d.sale.customer.taxId && <p>GSTIN: {d.sale.customer.taxId}</p>}
              </>
            ) : (
              <p>Cash customer</p>
            )}
          </div>
          {gst && (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Place of supply</p>
              <p>{d.sale.placeOfSupply ? `${stateName(d.sale.placeOfSupply)} (${d.sale.placeOfSupply})` : "—"}</p>
              <p className="text-neutral-500">{d.sale.interState ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}</p>
            </div>
          )}
        </section>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-y bg-neutral-50 text-left">
              <th className="p-1.5">#</th>
              <th className="p-1.5">Item</th>
              {gst && <th className="p-1.5">HSN/SAC</th>}
              <th className="p-1.5 text-right">Qty</th>
              <th className="p-1.5 text-right">Rate</th>
              <th className="p-1.5 text-right">Disc.</th>
              <th className="p-1.5 text-right">Taxable</th>
              <th className="p-1.5 text-right">Tax</th>
              <th className="p-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {d.sale.lines.map((l, i) => (
              <tr key={i} className="border-b align-top">
                <td className="p-1.5">{i + 1}</td>
                <td className="p-1.5">
                  {l.name}
                  {l.batchNo && <span className="block text-neutral-500">Batch {l.batchNo}</span>}
                </td>
                {gst && <td className="p-1.5">{l.hsn || "—"}</td>}
                <td className="p-1.5 text-right tabular-nums">{qtyText(l.qty, l.scale)} {l.unit}</td>
                <td className="p-1.5 text-right tabular-nums">{m(l.unitPrice)}</td>
                <td className="p-1.5 text-right tabular-nums">{l.discount ? m(l.discount) : "—"}</td>
                <td className="p-1.5 text-right tabular-nums">{m(l.taxable)}</td>
                <td className="p-1.5 text-right tabular-nums">{l.rateBp ? `${m(l.tax)} (${pct(l.rateBp)})` : "—"}</td>
                <td className="p-1.5 text-right font-medium tabular-nums">{m(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 grid grid-cols-[1fr_260px] gap-8">
          <div className="space-y-3">
            {d.sale.taxSummary.length > 0 && (
              <table className="w-full text-[10.5px]">
                <thead>
                  <tr className="border-b text-left text-neutral-500">
                    <th className="py-1">Rate</th>
                    <th className="py-1 text-right">Taxable</th>
                    {gst ? (
                      d.sale.interState ? <th className="py-1 text-right">IGST</th> : <><th className="py-1 text-right">CGST</th><th className="py-1 text-right">SGST</th></>
                    ) : (
                      <th className="py-1 text-right">Tax</th>
                    )}
                    {d.sale.cess > 0 && <th className="py-1 text-right">Cess</th>}
                  </tr>
                </thead>
                <tbody>
                  {d.sale.taxSummary.map((t) => (
                    <tr key={t.rateBp} className="border-b">
                      <td className="py-1">{pct(t.rateBp)}</td>
                      <td className="py-1 text-right tabular-nums">{m(t.taxable)}</td>
                      {gst ? (
                        d.sale.interState ? <td className="py-1 text-right tabular-nums">{m(t.igst)}</td> : <><td className="py-1 text-right tabular-nums">{m(t.cgst)}</td><td className="py-1 text-right tabular-nums">{m(t.sgst)}</td></>
                      ) : (
                        <td className="py-1 text-right tabular-nums">{m(t.vat)}</td>
                      )}
                      {d.sale.cess > 0 && <td className="py-1 text-right tabular-nums">{m(t.cess)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p><span className="text-neutral-500">Amount in words:</span> {inWords(d.sale.grandTotal, d.org.currency)}</p>
            {d.org.terms && <div className="whitespace-pre-line text-[10.5px] text-neutral-600"><p className="font-semibold text-black">Terms & conditions</p>{d.org.terms}</div>}
            {qr && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="UPI payment QR code" className="size-24" />
                <p className="text-[10.5px] text-neutral-600">Scan with any UPI app to pay {m(d.sale.balanceDue)}<br />UPI ID: {d.org.upiId}</p>
              </div>
            )}
          </div>
          <dl className="space-y-1 [&>div]:flex [&>div]:justify-between">
            <div><dt>Subtotal</dt><dd className="tabular-nums">{m(d.sale.subtotal)}</dd></div>
            {d.sale.discountTotal > 0 && <div><dt>Discount</dt><dd className="tabular-nums">−{m(d.sale.discountTotal)}</dd></div>}
            <div><dt>Taxable value</dt><dd className="tabular-nums">{m(d.sale.taxableTotal)}</dd></div>
            <div><dt>Total tax</dt><dd className="tabular-nums">{m(d.sale.taxTotal)}</dd></div>
            {d.sale.roundOff !== 0 && <div><dt>Round off</dt><dd className="tabular-nums">{m(d.sale.roundOff)}</dd></div>}
            <div className="border-y py-1.5 text-[14px] font-bold"><dt>Grand total</dt><dd className="tabular-nums">{m(d.sale.grandTotal)}</dd></div>
            <div><dt>Paid</dt><dd className="tabular-nums">{m(d.sale.grandTotal - d.sale.balanceDue)}</dd></div>
            {d.sale.balanceDue > 0 && <div className="font-semibold"><dt>Balance due</dt><dd className="tabular-nums">{m(d.sale.balanceDue)}</dd></div>}
          </dl>
        </section>

        <footer className="mt-12 flex items-end justify-between">
          <p className="text-[10px] text-neutral-500">{d.org.footer}</p>
          <div className="text-center">
            <div className="mb-1 h-10" />
            <p className="border-t pt-1">For {d.org.legalName || d.org.name}<br /><span className="text-neutral-500">Authorised signatory</span></p>
          </div>
        </footer>
      </article>
    </div>
  );
}
