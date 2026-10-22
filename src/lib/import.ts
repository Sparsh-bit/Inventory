import { toMinor } from "./money";

export type ImportKind = "products" | "customers" | "suppliers";
export type RawRow = Record<string, string>;
export interface RowError {
  row: number; // 1-based spreadsheet row (header = 1)
  message: string;
}

export const TEMPLATES: Record<ImportKind, string[]> = {
  products: ["name", "variant", "sku", "barcode", "category", "brand", "unit", "hsn", "tax_rate", "price", "cost", "mrp", "reorder_level", "opening_stock"],
  customers: ["name", "phone", "email", "gstin", "state_code", "address", "city", "credit_limit", "opening_balance"],
  suppliers: ["name", "phone", "email", "gstin", "state_code", "address", "city", "opening_balance"],
};

const KG_UNITS = new Set(["kg", "l", "m"]);

/** "Sale Price" / "sale-price" / "SALE_PRICE" -> "sale_price"; common aliases mapped. */
export function normalizeHeader(h: string): string {
  const k = h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const alias: Record<string, string> = {
    product: "name", product_name: "name", item: "name", item_name: "name", selling_price: "price", sale_price: "price", rate: "price",
    cost_price: "cost", purchase_price: "cost", gst: "tax_rate", gst_rate: "tax_rate", tax: "tax_rate", hsn_code: "hsn", qty: "opening_stock",
    quantity: "opening_stock", stock: "opening_stock", mobile: "phone", phone_number: "phone", gst_number: "gstin", gstin_uin: "tax_id_alias",
    reorder: "reorder_level", min_stock: "reorder_level", size: "variant",
  };
  return alias[k] === "tax_id_alias" ? "gstin" : (alias[k] ?? k);
}

const money = (v: string | undefined, field: string, required = false): number => {
  const s = (v ?? "").replace(/[₹$€£,\s]/g, "");
  if (!s) {
    if (required) throw new Error(`${field} is required`);
    return 0;
  }
  try {
    const n = toMinor(Number(s).toFixed(2));
    if (n < 0) throw new Error();
    return n;
  } catch {
    throw new Error(`${field} "${v}" is not a valid amount`);
  }
};

export interface ProductRow {
  row: number;
  name: string;
  variant: string;
  sku: string;
  barcode: string;
  category: string;
  brand: string;
  unit: string;
  scale: 1 | 1000;
  hsn: string;
  taxRateBp: number | null;
  price: number;
  cost: number;
  mrp: number;
  reorder: number;
  opening: number; // scaled
}

export function parseProductRows(rows: RawRow[]): { valid: ProductRow[]; errors: RowError[] } {
  const valid: ProductRow[] = [];
  const errors: RowError[] = [];
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();
  rows.forEach((r, i) => {
    const row = i + 2;
    try {
      const name = (r.name ?? "").trim();
      if (!name) throw new Error("name is required");
      if (name.length > 200) throw new Error("name is too long");
      const unit = (r.unit ?? "pcs").trim().toLowerCase() || "pcs";
      const scale = KG_UNITS.has(unit) ? 1000 : 1;
      const hsn = (r.hsn ?? "").replace(/\D/g, "");
      if (hsn && ![4, 6, 8].includes(hsn.length)) throw new Error(`HSN "${r.hsn}" must be 4, 6 or 8 digits`);
      const rateText = (r.tax_rate ?? "").replace("%", "").trim();
      const taxRateBp = rateText ? Math.round(Number(rateText) * 100) : null;
      if (taxRateBp !== null && (!Number.isFinite(taxRateBp) || taxRateBp < 0 || taxRateBp > 10000)) throw new Error(`tax_rate "${r.tax_rate}" is invalid`);
      const sku = (r.sku ?? "").trim();
      const barcode = (r.barcode ?? "").trim();
      if (sku && !/^[\x21-\x7e]{1,64}$/.test(sku)) throw new Error(`SKU "${sku}" has invalid characters`);
      if (barcode && !/^[\x21-\x7e]{1,64}$/.test(barcode)) throw new Error(`barcode "${barcode}" has invalid characters`);
      if (sku && seenSku.has(sku)) throw new Error(`SKU "${sku}" appears twice in the file`);
      if (barcode && seenBarcode.has(barcode)) throw new Error(`barcode "${barcode}" appears twice in the file`);
      const openText = (r.opening_stock ?? "").trim();
      const opening = openText ? Math.round(Number(openText) * scale) : 0;
      if (!Number.isFinite(opening) || opening < 0) throw new Error(`opening_stock "${openText}" is invalid`);
      const reorder = Math.round(Number((r.reorder_level ?? "").trim() || 0));
      if (!Number.isFinite(reorder) || reorder < 0) throw new Error("reorder_level is invalid");
      if (sku) seenSku.add(sku);
      if (barcode) seenBarcode.add(barcode);
      valid.push({
        row, name, variant: (r.variant ?? "").trim().slice(0, 120), sku, barcode, category: (r.category ?? "").trim().slice(0, 80), brand: (r.brand ?? "").trim().slice(0, 100),
        unit, scale, hsn, taxRateBp, price: money(r.price, "price", true), cost: money(r.cost, "cost"), mrp: money(r.mrp, "mrp"), reorder, opening,
      });
    } catch (e) {
      errors.push({ row, message: (e as Error).message });
    }
  });
  return { valid, errors };
}

export interface PartyRow {
  row: number;
  name: string;
  phone: string;
  email: string;
  taxId: string;
  stateCode: string;
  line1: string;
  city: string;
  creditLimit: number;
  openingBalance: number;
}

export function parsePartyRows(rows: RawRow[]): { valid: PartyRow[]; errors: RowError[] } {
  const valid: PartyRow[] = [];
  const errors: RowError[] = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    try {
      const name = (r.name ?? "").trim();
      if (!name) throw new Error("name is required");
      const phone = (r.phone ?? "").trim();
      if (phone && !/^[+\d][\d\s-]{5,19}$/.test(phone)) throw new Error(`phone "${phone}" is invalid`);
      const email = (r.email ?? "").trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`email "${email}" is invalid`);
      const stateCode = (r.state_code ?? "").trim();
      if (stateCode && !/^\d{2}$/.test(stateCode)) throw new Error("state_code must be 2 digits");
      valid.push({
        row, name: name.slice(0, 200), phone, email, taxId: (r.gstin ?? "").trim().toUpperCase().slice(0, 20), stateCode,
        line1: (r.address ?? "").trim().slice(0, 200), city: (r.city ?? "").trim().slice(0, 100),
        creditLimit: money(r.credit_limit, "credit_limit"), openingBalance: money(r.opening_balance, "opening_balance"),
      });
    } catch (e) {
      errors.push({ row, message: (e as Error).message });
    }
  });
  return { valid, errors };
}
