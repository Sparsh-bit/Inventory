import { formatMoney } from "./money";
import { EscPos } from "./escpos";

export interface ReceiptData {
  org: {
    name: string; legalName: string; address: string; phone: string; email: string; taxId: string; taxMode: "GST" | "VAT" | "NONE";
    logoUrl: string | null; header: string; footer: string; terms: string; upiId: string; showUpiQr: boolean; showHsn: boolean;
    currency: string; locale: string; timezone: string; paperWidth: 58 | 80;
  };
  sale: {
    id: string; number: string; kind: "receipt" | "tax_invoice" | "return"; status: string; date: string; cashier: string; location: string;
    customer: { name: string; phone: string; taxId: string; address: string } | null; placeOfSupply: string; interState: boolean;
    lines: { name: string; sku: string; hsn: string; qty: number; scale: number; unit: string; unitPrice: number; mrp: number; discount: number; taxable: number; rateBp: number; tax: number; total: number; batchNo: string; serials: string[] }[];
    subtotal: number; discountTotal: number; taxableTotal: number; cgst: number; sgst: number; igst: number; vat: number; cess: number; taxTotal: number; roundOff: number; grandTotal: number;
    payments: { method: string; amount: number }[]; change: number; balanceDue: number; returnOfNumber: string | null; notes: string;
    taxSummary: { rateBp: number; taxable: number; cgst: number; sgst: number; igst: number; vat: number; cess: number }[];
    einvoice?: { irn: string; ackNo: string; ackDt: string; signedQr: string; ewbNo: string; cancelled: boolean } | null;
  };
}

const METHOD: Record<string, string> = { cash: "Cash", card: "Card", upi: "UPI", credit: "On account", other: "Other" };
export const qtyText = (q: number, scale: number) => (scale === 1 ? String(q) : String(+(q / scale).toFixed(3)));
export const pct = (bp: number) => `${+(bp / 100).toFixed(2)}%`;

export function upiLink(d: ReceiptData, amount: number) {
  const p = new URLSearchParams({ pa: d.org.upiId, pn: d.org.name.slice(0, 50), am: (amount / 100).toFixed(2), cu: d.org.currency, tn: d.sale.number });
  return `upi://pay?${p.toString()}`;
}

export function receiptTitle(d: ReceiptData) {
  if (d.sale.kind === "return") return d.org.taxMode === "GST" ? "CREDIT NOTE" : "REFUND";
  if (d.sale.kind === "tax_invoice") return "TAX INVOICE";
  return d.org.taxMode === "GST" && d.org.taxId ? "TAX INVOICE" : "RECEIPT";
}

/** ESC/POS bytes for a thermal receipt. */
export function receiptToEscPos(d: ReceiptData, opts: { openDrawer?: boolean } = {}): Uint8Array {
  const width = d.org.paperWidth === 58 ? 32 : 48;
  // Thermal printers can't render ₹ etc. reliably, so money is printed with the ISO code stripped.
  const m = (v: number) => formatMoney(v, d.org.currency, d.org.locale).replace(/[^\d.,\-]/g, "").replace(/^-?/, (s) => s) || "0";
  const p = new EscPos({ width: width as 32 | 48 }).init();

  p.align("center").bold(true).size(2, 2).line(d.org.name.slice(0, width / 2)).size(1, 1).bold(false);
  if (d.org.legalName && d.org.legalName !== d.org.name) p.line(d.org.legalName);
  if (d.org.address) p.line(d.org.address);
  if (d.org.phone) p.line(`Ph: ${d.org.phone}`);
  if (d.org.taxId) p.line(`${d.org.taxMode === "GST" ? "GSTIN" : "Tax No"}: ${d.org.taxId}`);
  if (d.org.header) p.line(d.org.header);
  p.bold(true).line(receiptTitle(d)).bold(false);
  p.align("left").divider();
  p.cols(`No: ${d.sale.number}`, d.sale.date);
  if (d.sale.returnOfNumber) p.line(`Against: ${d.sale.returnOfNumber}`);
  p.line(`Cashier: ${d.sale.cashier}`);
  if (d.sale.customer) {
    p.line(`Customer: ${d.sale.customer.name}${d.sale.customer.phone ? ` (${d.sale.customer.phone})` : ""}`);
    if (d.sale.customer.taxId) p.line(`GSTIN: ${d.sale.customer.taxId}`);
  }
  p.divider();
  p.bold(true).cols("Item", "Amount").bold(false);
  for (const l of d.sale.lines) {
    p.line(l.name + (d.org.showHsn && l.hsn ? ` [${l.hsn}]` : ""));
    p.cols(`  ${qtyText(l.qty, l.scale)} ${l.unit} x ${m(l.unitPrice)}`, m(l.total));
    if (l.discount) p.line(`  Discount -${m(l.discount)}`);
    if (l.serials.length) p.line(`  S/N: ${l.serials.join(", ")}`);
  }
  p.divider();
  p.cols("Subtotal", m(d.sale.subtotal));
  if (d.sale.discountTotal) p.cols("Discount", `-${m(d.sale.discountTotal)}`);
  for (const t of d.sale.taxSummary) {
    if (t.cgst) p.cols(`CGST ${pct(t.rateBp / 2)} on ${m(t.taxable)}`, m(t.cgst)).cols(`SGST ${pct(t.rateBp / 2)}`, m(t.sgst));
    if (t.igst) p.cols(`IGST ${pct(t.rateBp)} on ${m(t.taxable)}`, m(t.igst));
    if (t.vat) p.cols(`Tax ${pct(t.rateBp)} on ${m(t.taxable)}`, m(t.vat));
    if (t.cess) p.cols("Cess", m(t.cess));
  }
  if (d.sale.roundOff) p.cols("Round off", m(d.sale.roundOff));
  p.bold(true).size(1, 2).cols("TOTAL", `${d.org.currency} ${m(d.sale.grandTotal)}`).size(1, 1).bold(false);
  for (const pay of d.sale.payments) p.cols(METHOD[pay.method] ?? pay.method, m(pay.amount));
  if (d.sale.change) p.cols("Change", m(d.sale.change));
  if (d.sale.balanceDue) p.bold(true).cols("Balance due", m(d.sale.balanceDue)).bold(false);
  const items = d.sale.lines.reduce((a, l) => a + (l.scale === 1 ? l.qty : 1), 0);
  p.line(`Items: ${d.sale.lines.length}  Qty: ${items}`);
  p.divider();
  // Only when something is still owed, for exactly that amount (a paid bill must not invite a second payment).
  if (d.org.showUpiQr && d.org.upiId && d.sale.kind !== "return" && d.sale.status !== "void" && d.sale.balanceDue > 0) {
    p.align("center").line("Scan to pay with UPI").qr(upiLink(d, d.sale.balanceDue), width === 32 ? 5 : 6).feed(1);
  }
  p.align("center");
  if (d.org.footer) p.line(d.org.footer);
  p.feed(3).cut();
  if (opts.openDrawer) p.drawer();
  return p.bytes();
}
