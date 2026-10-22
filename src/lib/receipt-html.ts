import { formatMoney } from "./money";
import { pct, qtyText, receiptTitle, type ReceiptData } from "./receipt";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const METHOD: Record<string, string> = { cash: "Cash", card: "Card", upi: "UPI", credit: "On account", other: "Other" };

/**
 * Self-contained receipt document for printing without the server (offline mode).
 * Every value is HTML-escaped; the document has no scripts.
 */
export function receiptHtml(d: ReceiptData): string {
  const m = (v: number) => esc(formatMoney(v, d.org.currency, d.org.locale));
  const row = (k: string, v: string, bold = false) => `<tr${bold ? ' class="b"' : ""}><td>${k}</td><td class="r">${v}</td></tr>`;
  const lines = d.sale.lines
    .map(
      (l) => `<tr><td>${esc(l.name)}${d.org.showHsn && l.hsn ? ` [${esc(l.hsn)}]` : ""}<br><span class="m">${esc(qtyText(l.qty, l.scale))} ${esc(l.unit)} × ${m(l.unitPrice)}${l.discount ? ` (−${m(l.discount)})` : ""}</span>${l.serials.length ? `<br><span class="m">S/N: ${esc(l.serials.join(", "))}</span>` : ""}</td><td class="r">${m(l.total)}</td></tr>`,
    )
    .join("");
  const tax = d.sale.taxSummary
    .map((t) =>
      [
        t.cgst ? row(`CGST ${pct(t.rateBp / 2)}`, m(t.cgst)) + row(`SGST ${pct(t.rateBp / 2)}`, m(t.sgst)) : "",
        t.igst ? row(`IGST ${pct(t.rateBp)}`, m(t.igst)) : "",
        t.vat ? row(`Tax ${pct(t.rateBp)}`, m(t.vat)) : "",
        t.cess ? row("Cess", m(t.cess)) : "",
      ].join(""),
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.sale.number)}</title><style>
@page{size:${d.org.paperWidth}mm auto;margin:0}*{box-sizing:border-box}body{margin:0;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#000;width:${d.org.paperWidth}mm;padding:3mm}
h1{font-size:15px;margin:0;text-align:center}.c{text-align:center}.r{text-align:right;white-space:nowrap}.m{color:#333}.b td{font-weight:bold;font-size:14px}
table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:1px 0}hr{border:0;border-top:1px dashed #000;margin:4px 0}</style></head><body>
<h1>${esc(d.org.name)}</h1><div class="c">${[d.org.address, d.org.phone && `Ph: ${d.org.phone}`, d.org.taxId && `${d.org.taxMode === "GST" ? "GSTIN" : "Tax No"}: ${d.org.taxId}`, d.org.header].filter(Boolean).map((x) => esc(String(x))).join("<br>")}<br><b>${esc(receiptTitle(d))}</b></div><hr>
<table>${row(`No: ${esc(d.sale.number)}`, esc(d.sale.date))}</table><div>Cashier: ${esc(d.sale.cashier)}${d.sale.customer ? `<br>Customer: ${esc(d.sale.customer.name)}${d.sale.customer.taxId ? `<br>GSTIN: ${esc(d.sale.customer.taxId)}` : ""}` : ""}</div><hr>
<table>${lines}</table><hr><table>${row("Subtotal", m(d.sale.subtotal))}${d.sale.discountTotal ? row("Discount", `−${m(d.sale.discountTotal)}`) : ""}${tax}${d.sale.roundOff ? row("Round off", m(d.sale.roundOff)) : ""}${row("TOTAL", m(d.sale.grandTotal), true)}${d.sale.payments.map((p) => row(METHOD[p.method] ?? esc(p.method), m(p.amount))).join("")}${d.sale.change ? row("Change", m(d.sale.change)) : ""}${d.sale.balanceDue ? row("Balance due", m(d.sale.balanceDue)) : ""}</table>
${d.org.footer ? `<hr><div class="c">${esc(d.org.footer)}</div>` : ""}</body></html>`;
}
