import { formatMoney } from "./money";
import { qtyText, type ReceiptData } from "./receipt";

const MAX_ITEMS = 25;

/** WhatsApp text for a bill: shop, number, items, totals and (when online) a link to the full bill. */
export function billMessage(d: ReceiptData, url: string | null): string {
  const m = (v: number) => formatMoney(v, d.org.currency, d.org.locale);
  const lines = d.sale.lines.slice(0, MAX_ITEMS).map((l) => `• ${l.name} × ${qtyText(l.qty, l.scale)}${l.unit && l.unit !== "pcs" ? ` ${l.unit}` : ""} = ${m(l.total)}`);
  if (d.sale.lines.length > MAX_ITEMS) lines.push(`…and ${d.sale.lines.length - MAX_ITEMS} more items`);
  const paid = d.sale.payments.filter((p) => p.method !== "credit").reduce((a, p) => a + p.amount, 0) - d.sale.change;
  return [
    `*${d.org.name}*`,
    `${d.sale.kind === "return" ? "Credit note" : "Bill"} ${d.sale.number} · ${d.sale.date}`,
    "",
    ...lines,
    "",
    `*Total: ${m(d.sale.grandTotal)}*`,
    paid > 0 && d.sale.balanceDue > 0 ? `Paid: ${m(paid)}` : "",
    d.sale.balanceDue > 0 ? `*Balance due: ${m(d.sale.balanceDue)}*` : "",
    "",
    url ? `View your bill: ${url}` : "",
    "",
    "Thank you for shopping with us!",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
