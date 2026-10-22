import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { normalizeHeader, parsePartyRows, parseProductRows, type ImportKind, type ProductRow, type RawRow, type RowError } from "@/lib/import";
import { AppError, type Ctx } from "../context";
import { Category, Location, OrgSettings, Party, Product, TaxRate } from "../models";
import { createProduct } from "./products";
import { saveParty } from "./parties";
import { audit } from "./system";

export const MAX_ROWS = 5000;

export async function readSheet(file: File): Promise<RawRow[]> {
  const name = file.name.toLowerCase();
  if (file.size > 5 * 1024 * 1024) throw new AppError("INVALID", "File must be 5 MB or smaller.");
  let rows: RawRow[];
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new AppError("INVALID", "The workbook has no sheets.");
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => (headers[col] = normalizeHeader(String(c.text ?? ""))));
    rows = [];
    ws.eachRow((r, idx) => {
      if (idx === 1) return;
      const obj: RawRow = {};
      r.eachCell({ includeEmpty: true }, (c, col) => {
        if (headers[col]) obj[headers[col]] = String(c.text ?? "").trim();
      });
      if (Object.values(obj).some(Boolean)) rows.push(obj);
    });
  } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const parsed = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: "greedy", transformHeader: normalizeHeader });
    rows = parsed.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "").trim()])));
  } else {
    throw new AppError("INVALID", "Upload a .csv or .xlsx file.");
  }
  if (!rows.length) throw new AppError("INVALID", "The file has no data rows.");
  if (rows.length > MAX_ROWS) throw new AppError("INVALID", `Import up to ${MAX_ROWS} rows at a time.`);
  return rows;
}

export function validate(kind: ImportKind, rows: RawRow[]) {
  return kind === "products" ? parseProductRows(rows) : parsePartyRows(rows);
}

export async function applyImport(ctx: Ctx, kind: ImportKind, rows: RawRow[]) {
  const failed: RowError[] = [...validate(kind, rows).errors];
  let created = 0;
  let updated = 0;

  if (kind === "products") {
    const settings = await OrgSettings.findOne({ orgId: ctx.orgId }).lean();
    const loc = await Location.findOne({ orgId: ctx.orgId, isDefault: true }).lean();
    const categories = new Map((await Category.find({ orgId: ctx.orgId }).lean()).map((c) => [c.name.toLowerCase(), String(c._id)]));
    const rates = await TaxRate.find({ orgId: ctx.orgId }).lean();
    const rateId = async (bp: number | null) => {
      if (bp === null) return null;
      const hit = rates.find((r) => r.rateBp === bp && !r.cessBp);
      if (hit) return String(hit._id);
      const [r] = await TaxRate.create([{ orgId: ctx.orgId, name: `${settings?.taxMode === "GST" ? "GST" : "Tax"} ${bp / 100}%`, rateBp: bp }]);
      rates.push(r.toObject());
      return String(r._id);
    };
    const categoryId = async (name: string) => {
      if (!name) return null;
      const key = name.toLowerCase();
      if (!categories.has(key)) {
        const c = await Category.create({ orgId: ctx.orgId, name });
        categories.set(key, String(c._id));
      }
      return categories.get(key)!;
    };

    // Rows sharing a name and having a variant column become one product with variants.
    const groups = new Map<string, ProductRow[]>();
    for (const r of parseProductRows(rows).valid) {
      const key = r.variant ? `v:${r.name.toLowerCase()}` : `s:${r.row}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    // ponytail: one transaction per product; batch inserts if imports above ~5k rows get slow.
    for (const group of groups.values()) {
      const first = group[0];
      try {
        const codes = group.flatMap((r) => [r.sku, r.barcode].filter(Boolean));
        const existing = codes.length ? await Product.findOne({ orgId: ctx.orgId, $or: [{ "variants.sku": { $in: codes } }, { "variants.barcodes": { $in: codes } }] }) : null;
        if (existing) {
          for (const r of group) {
            const v = existing.variants.find((x) => (r.sku && x.sku === r.sku) || (r.barcode && x.barcodes.includes(r.barcode)));
            if (!v) continue;
            v.salePrice = r.price;
            if (r.cost) v.costPrice = r.cost;
            if (r.mrp) v.mrp = r.mrp;
          }
          await existing.save();
          updated += group.length;
          continue;
        }
        await createProduct(ctx, {
          name: first.name, description: "", brand: first.brand, categoryId: await categoryId(first.category), unitCode: first.unit, unitScale: first.scale, hsn: first.hsn,
          taxRateId: await rateId(first.taxRateBp), priceIncludesTax: settings?.pricesIncludeTax ?? true, trackBatch: false, reorderLevel: first.reorder, images: [], active: true,
          openingLocationId: loc ? String(loc._id) : undefined,
          variants: group.map((r) => ({ name: r.variant, sku: r.sku, barcodes: r.barcode ? [r.barcode] : [], attributes: r.variant ? [{ name: "Variant", value: r.variant }] : [], costPrice: r.cost, salePrice: r.price, mrp: r.mrp, active: true, openingQty: r.opening })),
        });
        created += group.length;
      } catch (e) {
        const msg = (e as { code?: number }).code === 11000 ? "SKU or barcode already used by another product" : (e as Error).message;
        for (const r of group) failed.push({ row: r.row, message: msg });
      }
    }
  } else {
    const partyKind = kind === "customers" ? "customer" : "supplier";
    for (const r of parsePartyRows(rows).valid) {
      try {
        const existing = r.phone ? await Party.findOne({ orgId: ctx.orgId, kind: partyKind, phone: r.phone }) : null;
        const data = { kind: partyKind, name: r.name, phone: r.phone, email: r.email, taxId: r.taxId, stateCode: r.stateCode, address: { line1: r.line1, city: r.city }, creditLimit: r.creditLimit, openingBalance: r.openingBalance, notes: "" } as const;
        if (existing) {
          await saveParty(ctx, String(existing._id), { ...data, openingBalance: existing.openingBalance });
          updated++;
        } else {
          await saveParty(ctx, null, data);
          created++;
        }
      } catch (e) {
        failed.push({ row: r.row, message: (e as Error).message });
      }
    }
  }
  await audit(ctx, "import", kind, "", `Imported ${kind}: ${created} created, ${updated} updated, ${failed.length} failed`);
  return { created, updated, failed: failed.sort((a, b) => a.row - b.row).slice(0, 200), failedCount: failed.length };
}
