import { describe, expect, it } from "vitest";
import { fiscalYear, offlineNumber, parseOfflineNumber } from "@/lib/numbering";
import { receiptHtml } from "@/lib/receipt-html";
import type { ReceiptData } from "@/lib/receipt";

describe("offline numbering", () => {
  it("formats within the 16-character GST limit and round-trips", () => {
    const n = offlineNumber("INV", "T12", "26-27", 42);
    expect(n).toBe("INVT12/2627/00042");
    expect(offlineNumber("INV", "T1", "26-27", 1).length).toBeLessThanOrEqual(16);
    expect(parseOfflineNumber("ST2/2627/00007")).toEqual({ prefix: "S", deviceCode: "T2", fy: "26-27", seq: 7 });
    expect(parseOfflineNumber("S/26-27/00001")).toBeNull();
    expect(parseOfflineNumber("ST2/26/00001")).toMatchObject({ fy: "26" });
  });
  it("computes fiscal years in the business time zone", () => {
    expect(fiscalYear(new Date("2027-03-31T20:00:00Z"), 4, "Asia/Kolkata")).toBe("27-28"); // 1 Apr IST
    expect(fiscalYear(new Date("2027-03-31T10:00:00Z"), 4, "Asia/Kolkata")).toBe("26-27");
    expect(fiscalYear(new Date("2026-06-01T00:00:00Z"), 1, "UTC")).toBe("26");
  });
});

describe("offline receipt html", () => {
  it("escapes all user data", () => {
    const d = {
      org: { name: "<script>x</script>", legalName: "", address: "", phone: "", email: "", taxId: "", taxMode: "NONE", logoUrl: null, header: "", footer: "", terms: "", upiId: "", showUpiQr: false, showHsn: false, currency: "INR", locale: "en-IN", timezone: "UTC", paperWidth: 80 },
      sale: {
        id: "", number: "ST1/2627/00001", kind: "receipt", status: "completed", date: "now", cashier: 'a"b', location: "", customer: null, placeOfSupply: "", interState: false,
        lines: [{ name: "<img src=x onerror=alert(1)>", sku: "", hsn: "", qty: 1, scale: 1, unit: "pcs", unitPrice: 100, mrp: 0, discount: 0, taxable: 100, rateBp: 0, tax: 0, total: 100, batchNo: "", serials: [] }],
        subtotal: 100, discountTotal: 0, taxableTotal: 100, cgst: 0, sgst: 0, igst: 0, vat: 0, cess: 0, taxTotal: 0, roundOff: 0, grandTotal: 100,
        payments: [{ method: "cash", amount: 100 }], change: 0, balanceDue: 0, returnOfNumber: null, notes: "", taxSummary: [],
      },
    } satisfies ReceiptData;
    const html = receiptHtml(d);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("ST1/2627/00001");
  });
});
