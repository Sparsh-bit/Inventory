import ExcelJS from "exceljs";
import { escapeCell, toCsv } from "@/lib/csv";
import { formatQty } from "@/lib/format";
import { can, type Permission } from "@/lib/permissions";
import { getOrgSettings, loadCtx } from "@/server/context";
import { Party, Product, Sale, StockMove } from "@/server/models";
import { gstSummary, parseRange, stockValuation } from "@/server/services/reports";
import { audit } from "@/server/services/system";

type Col = { key: string; label: string };
// Excel needs a UTF-8 byte-order mark to show ₹ and accents correctly.
const BOM = String.fromCharCode(0xfeff);
const major = (m: number | null | undefined) => Number(((m ?? 0) / 100).toFixed(2));

const REPORTS: Record<string, { permission: Permission; title: string }> = {
  sales: { permission: "reports:read", title: "Sales" },
  products: { permission: "products:read", title: "Products" },
  stock: { permission: "reports:read", title: "Stock valuation" },
  gst: { permission: "reports:read", title: "GST HSN summary" },
  customers: { permission: "parties:read", title: "Customers" },
  suppliers: { permission: "purchases:read", title: "Suppliers" },
  movements: { permission: "stock:read", title: "Stock movements" },
};

export async function GET(req: Request, { params }: RouteContext<"/api/export/[report]">) {
  const { report } = await params;
  const def = REPORTS[report];
  if (!def) return new Response("Not found", { status: 404 });
  const ctx = await loadCtx();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!can(ctx.role, def.permission)) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const s = await getOrgSettings(ctx.orgId);
  const range = parseRange(s.timezone, url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
  const date = (d: Date) => d.toLocaleString("en-CA", { timeZone: s.timezone, hour12: false }).replace(",", "");

  let cols: Col[] = [];
  let rows: Record<string, unknown>[] = [];

  if (report === "sales") {
    cols = [
      { key: "number", label: "Number" }, { key: "date", label: "Date" }, { key: "type", label: "Type" }, { key: "status", label: "Status" },
      { key: "customer", label: "Customer" }, { key: "gstin", label: "Customer GSTIN" }, { key: "taxable", label: "Taxable" }, { key: "cgst", label: "CGST" },
      { key: "sgst", label: "SGST" }, { key: "igst", label: "IGST" }, { key: "vat", label: "VAT" }, { key: "cess", label: "Cess" }, { key: "discount", label: "Discount" },
      { key: "roundOff", label: "Round off" }, { key: "total", label: "Total" }, { key: "due", label: "Balance due" }, { key: "payments", label: "Payments" }, { key: "cashier", label: "Cashier" },
    ];
    const sales = await Sale.find({ orgId: ctx.orgId, status: { $in: ["completed", "void"] }, completedAt: { $gte: range.start, $lt: range.end } }).sort({ completedAt: 1 }).limit(50_000).lean();
    rows = sales.map((x) => {
      const sign = x.kind === "return" ? -1 : 1;
      return {
        number: x.number, date: date(x.completedAt!), type: x.kind === "return" ? "Return" : x.kind === "tax_invoice" ? "Tax invoice" : "Receipt", status: x.status,
        customer: x.customer?.name ?? "", gstin: x.customer?.taxId ?? "", taxable: sign * major(x.taxableTotal), cgst: sign * major(x.cgst), sgst: sign * major(x.sgst),
        igst: sign * major(x.igst), vat: sign * major(x.vat), cess: sign * major(x.cess), discount: major(x.discountTotal), roundOff: major(x.roundOff),
        total: sign * major(x.grandTotal), due: major(x.balanceDue), payments: x.payments.map((p) => `${p.method}:${major(p.amount)}`).join(" "), cashier: x.cashierName,
      };
    });
  } else if (report === "products") {
    cols = [
      { key: "name", label: "Name" }, { key: "variant", label: "Variant" }, { key: "sku", label: "SKU" }, { key: "barcode", label: "Barcode" }, { key: "unit", label: "Unit" },
      { key: "hsn", label: "HSN" }, { key: "cost", label: "Cost price" }, { key: "price", label: "Sale price" }, { key: "mrp", label: "MRP" }, { key: "reorder", label: "Reorder level" }, { key: "active", label: "Active" },
    ];
    const products = await Product.find({ orgId: ctx.orgId }).sort({ name: 1 }).lean();
    rows = products.flatMap((p) => p.variants.map((v) => ({
      name: p.name, variant: v.name, sku: v.sku, barcode: v.barcodes.join(" "), unit: p.unit?.code, hsn: p.hsn,
      cost: can(ctx.role, "cost:read") ? major(v.costPrice) : "", price: major(v.salePrice), mrp: major(v.mrp), reorder: p.reorderLevel, active: p.active && v.active ? "yes" : "no",
    })));
  } else if (report === "stock") {
    cols = [{ key: "name", label: "Item" }, { key: "sku", label: "SKU" }, { key: "qty", label: "Quantity" }, { key: "unit", label: "Unit" }, { key: "cost", label: "Cost value" }, { key: "sale", label: "Sale value" }];
    const v = await stockValuation(ctx, url.searchParams.get("location") ?? undefined);
    rows = v.items.map((i) => ({ name: i.name, sku: i.sku, qty: Number(formatQty(i.qty, i.scale).replace(/,/g, "")), unit: i.unit, cost: major(i.costValue), sale: major(i.saleValue) }));
  } else if (report === "gst") {
    cols = [{ key: "hsn", label: "HSN/SAC" }, { key: "rate", label: "Rate %" }, { key: "qty", label: "Quantity" }, { key: "taxable", label: "Taxable value" }, { key: "cgst", label: "CGST" }, { key: "sgst", label: "SGST" }, { key: "igst", label: "IGST" }, { key: "cess", label: "Cess" }, { key: "total", label: "Total value" }];
    const g = await gstSummary(ctx, range.start, range.end);
    rows = g.byHsn.map((r) => ({ hsn: r._id.hsn || "—", rate: (r._id.rate ?? 0) / 100, qty: +r.qty.toFixed(3), taxable: major(r.taxable), cgst: major(r.cgst), sgst: major(r.sgst), igst: major(r.igst), cess: major(r.cess), total: major(r.total) }));
  } else if (report === "customers" || report === "suppliers") {
    cols = [{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "taxId", label: "GSTIN / Tax ID" }, { key: "state", label: "State code" }, { key: "balance", label: report === "customers" ? "Receivable" : "Payable" }, { key: "limit", label: "Credit limit" }];
    const parties = await Party.find({ orgId: ctx.orgId, kind: report === "customers" ? "customer" : "supplier" }).sort({ name: 1 }).lean();
    rows = parties.map((p) => ({ name: p.name, phone: p.phone, email: p.email, taxId: p.taxId, state: p.stateCode, balance: major(p.balance), limit: major(p.creditLimit) }));
  } else if (report === "movements") {
    cols = [{ key: "date", label: "Date" }, { key: "type", label: "Type" }, { key: "product", label: "Product" }, { key: "qty", label: "Qty change" }, { key: "ref", label: "Reference" }, { key: "reason", label: "Reason" }];
    const moves = await StockMove.find({ orgId: ctx.orgId, createdAt: { $gte: range.start, $lt: range.end } }).sort({ createdAt: 1 }).limit(50_000).lean();
    const products = new Map((await Product.find({ orgId: ctx.orgId, _id: { $in: [...new Set(moves.map((m) => String(m.productId)))] } }, { name: 1, unit: 1 }).lean()).map((p) => [String(p._id), p]));
    rows = moves.map((m) => {
      const p = products.get(String(m.productId));
      return { date: date(m.createdAt), type: m.type, product: p?.name ?? "", qty: m.qtyDelta / (p?.unit?.scale ?? 1), ref: m.ref?.number ?? "", reason: m.reason };
    });
  }

  await audit(ctx, "export", "report", report, `Exported ${def.title}`);
  const filename = `${report}-${range.from}-to-${range.to}`;
  if (url.searchParams.get("format") === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(def.title);
    ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 2) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => [c.key, typeof r[c.key] === "number" ? r[c.key] : escapeCell(r[c.key])])));
    const buf = await wb.xlsx.writeBuffer();
    return new Response(new Uint8Array(buf as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}.xlsx"`, "Cache-Control": "no-store" } });
  }
  return new Response(BOM + toCsv(rows, cols), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.csv"`, "Cache-Control": "no-store" } });
}
