import "server-only";
import type { ReceiptData } from "@/lib/receipt";
import { AppError, getOrgSettings, type Ctx } from "../context";
import { Location, Sale, type SaleDoc } from "../models";

export async function getReceiptData(ctx: Ctx, saleId: string): Promise<ReceiptData> {
  const s = await getOrgSettings(ctx.orgId);
  const sale = await Sale.findOne({ orgId: ctx.orgId, _id: saleId, status: { $in: ["completed", "void"] } }).lean<SaleDoc>();
  if (!sale) throw new AppError("NOT_FOUND", "Sale not found");
  const loc = await Location.findOne({ orgId: ctx.orgId, _id: sale.locationId }, { name: 1 }).lean();
  const a = s.address ?? {};

  const summary = new Map<number, { rateBp: number; taxable: number; cgst: number; sgst: number; igst: number; vat: number; cess: number }>();
  for (const l of sale.lines) {
    const r = summary.get(l.rateBp ?? 0) ?? { rateBp: l.rateBp ?? 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, vat: 0, cess: 0 };
    r.taxable += l.taxable ?? 0;
    r.cgst += l.cgst ?? 0;
    r.sgst += l.sgst ?? 0;
    r.igst += l.igst ?? 0;
    r.vat += l.vat ?? 0;
    r.cess += l.cess ?? 0;
    summary.set(r.rateBp, r);
  }

  return {
    org: {
      name: ctx.orgName, legalName: s.legalName ?? "", address: [a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", "),
      phone: s.phone ?? "", email: s.email ?? "", taxId: s.taxId ?? "", taxMode: s.taxMode as "GST" | "VAT" | "NONE", logoUrl: s.logoUrl ?? null,
      header: s.receipt?.header ?? "", footer: s.receipt?.footer ?? "", terms: s.invoiceTerms ?? "", upiId: s.receipt?.upiId ?? "",
      showUpiQr: !!s.receipt?.showUpiQr, showHsn: !!s.receipt?.showHsn, currency: s.currency, locale: s.locale, timezone: s.timezone,
      paperWidth: (s.receipt?.paperWidth ?? 80) as 58 | 80,
    },
    sale: {
      id: String(sale._id), number: sale.number ?? "", kind: sale.kind, status: sale.status,
      date: (sale.completedAt ?? sale.createdAt).toLocaleString(s.locale, { timeZone: s.timezone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      cashier: sale.cashierName ?? "", location: loc?.name ?? "",
      customer: sale.customer?.name ? { name: sale.customer.name, phone: sale.customer.phone ?? "", taxId: sale.customer.taxId ?? "", address: sale.customer.address ?? "" } : null,
      placeOfSupply: sale.customer?.stateCode || s.stateCode || "", interState: !!sale.interState,
      lines: sale.lines.map((l) => ({
        name: l.name ?? "", sku: l.sku ?? "", hsn: l.hsn ?? "", qty: l.qty, scale: l.scale ?? 1, unit: l.unit ?? "", unitPrice: l.unitPrice ?? 0, mrp: l.mrp ?? 0,
        discount: l.discount ?? 0, taxable: l.taxable ?? 0, rateBp: l.rateBp ?? 0, tax: (l.cgst ?? 0) + (l.sgst ?? 0) + (l.igst ?? 0) + (l.vat ?? 0) + (l.cess ?? 0),
        total: l.total ?? 0, batchNo: l.batchNo ?? "",
      })),
      subtotal: sale.subtotal ?? 0, discountTotal: sale.discountTotal ?? 0, taxableTotal: sale.taxableTotal ?? 0, cgst: sale.cgst ?? 0, sgst: sale.sgst ?? 0,
      igst: sale.igst ?? 0, vat: sale.vat ?? 0, cess: sale.cess ?? 0, taxTotal: sale.taxTotal ?? 0, roundOff: sale.roundOff ?? 0, grandTotal: sale.grandTotal ?? 0,
      payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount ?? 0 })), change: sale.change ?? 0, balanceDue: sale.balanceDue ?? 0,
      returnOfNumber: sale.returnOfNumber ?? null, notes: sale.notes ?? "",
      taxSummary: [...summary.values()].filter((t) => t.cgst || t.sgst || t.igst || t.vat || t.cess).sort((x, y) => x.rateBp - y.rateBp),
    },
  };
}
