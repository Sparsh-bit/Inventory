import { allocateProportionally } from "./money";

export type TaxMode = "GST" | "VAT" | "NONE";

export interface BillLineInput {
  unitPrice: number; // minor units per base unit (per 1 unit when scale = 1, per kg when scale = 1000 grams)
  qty: number; // integer in scaled units
  scale: number;
  discount: number; // line discount, minor units, applied to the line amount
  rateBp: number; // GST/VAT rate in basis points
  cessBp?: number;
  inclusive: boolean; // unitPrice already includes tax
}

export interface BillInput {
  lines: BillLineInput[];
  billDiscount: number;
  mode: TaxMode;
  interState: boolean;
  roundOff: boolean;
}

export interface BillLine {
  gross: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  vat: number;
  cess: number;
  tax: number;
  total: number;
}

export interface Bill {
  lines: BillLine[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  vat: number;
  cess: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
}

const bp = (amount: number, rateBp: number) => Math.round((amount * rateBp) / 10000);

export function computeBill(input: BillInput): Bill {
  const pre = input.lines.map((l) => {
    const gross = Math.round((l.unitPrice * l.qty) / l.scale);
    const lineDiscount = Math.min(Math.max(l.discount, 0), gross);
    return { l, gross, lineDiscount, net: gross - lineDiscount };
  });
  const netSum = pre.reduce((a, p) => a + p.net, 0);
  const billDiscount = Math.min(Math.max(input.billDiscount, 0), netSum);
  const shares = allocateProportionally(billDiscount, pre.map((p) => p.net));

  const lines: BillLine[] = pre.map((p, i) => {
    const amount = p.net - shares[i];
    const rate = input.mode === "NONE" ? 0 : p.l.rateBp;
    const cessRate = input.mode === "GST" ? (p.l.cessBp ?? 0) : 0;
    let taxable: number;
    let cess: number;
    let mainTax: number;
    if (p.l.inclusive && rate + cessRate > 0) {
      taxable = Math.round((amount * 10000) / (10000 + rate + cessRate));
      cess = bp(taxable, cessRate);
      mainTax = amount - taxable - cess;
    } else {
      taxable = amount;
      cess = bp(taxable, cessRate);
      mainTax = bp(taxable, rate);
    }
    const out: BillLine = { gross: p.gross, discount: p.lineDiscount + shares[i], taxable, cgst: 0, sgst: 0, igst: 0, vat: 0, cess, tax: mainTax + cess, total: taxable + mainTax + cess };
    if (input.mode === "VAT") out.vat = mainTax;
    else if (input.mode === "GST") {
      if (input.interState) out.igst = mainTax;
      else {
        out.cgst = Math.floor(mainTax / 2);
        out.sgst = mainTax - out.cgst;
      }
    }
    return out;
  });

  const sum = (k: keyof BillLine) => lines.reduce((a, l) => a + l[k], 0);
  const raw = sum("total");
  const grandTotal = input.roundOff ? Math.round(raw / 100) * 100 : raw;
  return {
    lines,
    subtotal: sum("gross"),
    discountTotal: sum("discount"),
    taxableTotal: sum("taxable"),
    cgst: sum("cgst"),
    sgst: sum("sgst"),
    igst: sum("igst"),
    vat: sum("vat"),
    cess: sum("cess"),
    taxTotal: sum("tax"),
    roundOff: grandTotal - raw,
    grandTotal,
  };
}
