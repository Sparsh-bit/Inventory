import { describe, expect, it } from "vitest";
import { computeBill, type BillLineInput } from "@/lib/tax";

const line = (o: Partial<BillLineInput>): BillLineInput => ({
  unitPrice: 10000, qty: 1, scale: 1, discount: 0, rateBp: 1800, inclusive: false, ...o,
});

describe("computeBill", () => {
  it("exclusive GST intra-state splits CGST/SGST", () => {
    const b = computeBill({ lines: [line({ qty: 2 })], billDiscount: 0, mode: "GST", interState: false, roundOff: false });
    expect(b.lines[0]).toMatchObject({ gross: 20000, taxable: 20000, cgst: 1800, sgst: 1800, igst: 0, total: 23600 });
    expect(b.grandTotal).toBe(23600);
    expect(b.taxTotal).toBe(3600);
  });

  it("inclusive price backs tax out", () => {
    const b = computeBill({ lines: [line({ unitPrice: 11800, inclusive: true })], billDiscount: 0, mode: "GST", interState: false, roundOff: false });
    expect(b.lines[0]).toMatchObject({ taxable: 10000, tax: 1800, total: 11800 });
  });

  it("odd tax splits floor to CGST and remainder to SGST", () => {
    const b = computeBill({ lines: [line({ unitPrice: 1050, rateBp: 500 })], billDiscount: 0, mode: "GST", interState: false, roundOff: false });
    // tax = round(1050 * 0.05) = 53 -> 26 + 27
    expect(b.lines[0]).toMatchObject({ tax: 53, cgst: 26, sgst: 27 });
  });

  it("inter-state uses IGST only", () => {
    const b = computeBill({ lines: [line({})], billDiscount: 0, mode: "GST", interState: true, roundOff: false });
    expect(b.lines[0]).toMatchObject({ igst: 1800, cgst: 0, sgst: 0 });
    expect(b.igst).toBe(1800);
  });

  it("pro-rates bill discount before tax", () => {
    const b = computeBill({
      lines: [line({ unitPrice: 30000, rateBp: 0 }), line({ unitPrice: 10000, rateBp: 0 })],
      billDiscount: 1000, mode: "GST", interState: false, roundOff: false,
    });
    expect(b.lines.map((l) => l.discount)).toEqual([750, 250]);
    expect(b.grandTotal).toBe(39000);
    expect(b.discountTotal).toBe(1000);
  });

  it("line discount reduces taxable value", () => {
    const b = computeBill({ lines: [line({ discount: 1000 })], billDiscount: 0, mode: "GST", interState: false, roundOff: false });
    expect(b.lines[0]).toMatchObject({ taxable: 9000, tax: 1620, total: 10620 });
  });

  it("VAT mode puts tax in vat component", () => {
    const b = computeBill({ lines: [line({ rateBp: 2000 })], billDiscount: 0, mode: "VAT", interState: false, roundOff: false });
    expect(b.lines[0]).toMatchObject({ vat: 2000, cgst: 0, sgst: 0, igst: 0 });
    expect(b.vat).toBe(2000);
  });

  it("NONE mode charges no tax", () => {
    const b = computeBill({ lines: [line({})], billDiscount: 0, mode: "NONE", interState: false, roundOff: false });
    expect(b.taxTotal).toBe(0);
    expect(b.grandTotal).toBe(10000);
  });

  it("NONE mode with inclusive flag keeps the price as-is", () => {
    const b = computeBill({ lines: [line({ inclusive: true })], billDiscount: 0, mode: "NONE", interState: false, roundOff: false });
    expect(b.grandTotal).toBe(10000);
  });

  it("rounds off to the nearest whole unit", () => {
    const down = computeBill({ lines: [line({ unitPrice: 23649, rateBp: 0 })], billDiscount: 0, mode: "GST", interState: false, roundOff: true });
    expect(down).toMatchObject({ grandTotal: 23600, roundOff: -49 });
    const up = computeBill({ lines: [line({ unitPrice: 23650, rateBp: 0 })], billDiscount: 0, mode: "GST", interState: false, roundOff: true });
    expect(up).toMatchObject({ grandTotal: 23700, roundOff: 50 });
  });

  it("handles fractional quantities via scale", () => {
    // 1.5 kg at 40.00/kg
    const b = computeBill({ lines: [line({ unitPrice: 4000, qty: 1500, scale: 1000, rateBp: 0 })], billDiscount: 0, mode: "GST", interState: false, roundOff: false });
    expect(b.lines[0].gross).toBe(6000);
  });

  it("adds cess on top of GST", () => {
    const b = computeBill({ lines: [line({ rateBp: 2800, cessBp: 1200 })], billDiscount: 0, mode: "GST", interState: false, roundOff: false });
    expect(b.lines[0]).toMatchObject({ cgst: 1400, sgst: 1400, cess: 1200, tax: 4000, total: 14000 });
  });

  it("never lets discount exceed gross", () => {
    const b = computeBill({ lines: [line({ discount: 50000 })], billDiscount: 0, mode: "GST", interState: false, roundOff: false });
    expect(b.lines[0].taxable).toBe(0);
    expect(b.grandTotal).toBe(0);
  });
});
