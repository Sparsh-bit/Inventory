import { describe, expect, it } from "vitest";
import { receiptToEscPos, upiLink, type ReceiptData } from "@/lib/receipt";

const data = (width: 58 | 80): ReceiptData => ({
  org: {
    name: "Sharma General Store", legalName: "", address: "12 MG Road, Pune", phone: "9876543210", email: "", taxId: "27ABCDE1234F1Z5", taxMode: "GST",
    logoUrl: null, header: "", footer: "Thank you! Visit again.", terms: "", upiId: "shop@upi", showUpiQr: true, showHsn: true,
    currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", paperWidth: width,
  },
  sale: {
    id: "x", number: "S/26-27/00001", kind: "receipt", status: "completed", date: "22 Oct 2026, 10:15", cashier: "Asha", location: "Main",
    customer: null, placeOfSupply: "27", interState: false,
    lines: [{ name: "An extremely long product name that definitely needs wrapping on narrow paper", sku: "A", hsn: "1006", qty: 1500, scale: 1000, unit: "kg", unitPrice: 12000, mrp: 0, discount: 500, taxable: 16571, rateBp: 500, tax: 829, total: 17400, batchNo: "", serials: ["IMEI-123456789012345"] }],
    subtotal: 18000, discountTotal: 500, taxableTotal: 16571, cgst: 414, sgst: 415, igst: 0, vat: 0, cess: 0, taxTotal: 829, roundOff: 0, grandTotal: 17400,
    payments: [{ method: "cash", amount: 20000 }], change: 2600, balanceDue: 0, returnOfNumber: null, notes: "",
    taxSummary: [{ rateBp: 500, taxable: 16571, cgst: 414, sgst: 415, igst: 0, vat: 0, cess: 0 }],
  },
});

/** Text lines of the receipt with ESC/GS command sequences removed. */
function textLines(bytes: Uint8Array) {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b || b === 0x1d) {
      // skip known command lengths
      const cmd = bytes[i + 1];
      if (b === 0x1d && cmd === 0x28) { i += 4 + (bytes[i + 3] | (bytes[i + 4] << 8)); continue; }
      i += b === 0x1d && cmd === 0x56 ? 3 : b === 0x1b && cmd === 0x70 ? 4 : b === 0x1b && cmd === 0x40 ? 1 : 2;
      continue;
    }
    out.push(b);
  }
  return new TextDecoder().decode(Uint8Array.from(out)).split("\n");
}

describe("receiptToEscPos", () => {
  for (const w of [58, 80] as const) {
    it(`fits ${w}mm paper`, () => {
      const cols = w === 58 ? 32 : 48;
      const lines = textLines(receiptToEscPos(data(w)));
      expect(lines.length).toBeGreaterThan(10);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(cols);
    });
  }
  it("contains the essentials", () => {
    const text = textLines(receiptToEscPos(data(80))).join("\n");
    expect(text).toContain("GSTIN: 27ABCDE1234F1Z5");
    expect(text).toContain("S/26-27/00001");
    expect(text).toContain("1.5 kg x 120.00");
    expect(text).toContain("Change");
    expect(text).toMatch(/TOTAL\s+INR 174\.00/);
  });
  it("builds UPI deep links", () => {
    expect(upiLink(data(80), 17400)).toBe("upi://pay?pa=shop%40upi&pn=Sharma+General+Store&am=174.00&cu=INR&tn=S%2F26-27%2F00001");
  });
});
