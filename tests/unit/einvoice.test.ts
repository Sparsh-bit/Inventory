import { describe, expect, it } from "vitest";
import { buildEinvoice, ewbBulkJson, ewbByIrnPayload, validateEinvoice, type EinvInput } from "@/lib/einvoice";
import { gstinCheckChar, isValidGstin } from "@/lib/gstin";
import { computeBill } from "@/lib/tax";

describe("GSTIN", () => {
  it("validates real GSTINs and catches typos", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("29AAGCB7383J1Z4")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false); // wrong check char
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(gstinCheckChar("24AAACC1206D1Z")).toBe("M");
  });
});

const seller = { gstin: "27AAPFU0939F1ZV", legalName: "Sharma Traders", address1: "12 MG Road", location: "Pune", pin: "411001", stateCode: "27", phone: "98765 43210" };
const buyer = { gstin: "29AAGCB7383J1Z4", legalName: "Bangalore Retail Pvt Ltd", address1: "5 Brigade Rd", location: "Bengaluru", pin: "560001", stateCode: "29" };

function sample(inclusive: boolean): EinvInput {
  // 2 units @ 1180.00 incl. 18% with 118.00 discount, inter-state
  const bill = computeBill({ lines: [{ unitPrice: 118000, qty: 2, scale: 1, discount: 11800, rateBp: 1800, inclusive }], billDiscount: 0, mode: "GST", interState: true, roundOff: true });
  const l = bill.lines[0];
  return {
    docType: "INV", docNo: "INV/26-27/00001", docDate: "22/10/2026", seller, buyer, roundOff: bill.roundOff, grandTotal: bill.grandTotal,
    lines: [{ name: "Steel Almirah", hsn: "94032010", qty: 2, scale: 1, unit: "pcs", discount: l.discount, taxable: l.taxable, rateBp: 1800, cessBp: 0, inclusive, cgst: l.cgst, sgst: l.sgst, igst: l.igst, cess: l.cess, total: l.total }],
  };
}

describe("e-invoice builder", () => {
  it("expresses inclusive prices tax-exclusive and reconciles", () => {
    const e = buildEinvoice(sample(true));
    const it0 = e.ItemList[0];
    expect(it0).toMatchObject({ SlNo: "1", IsServc: "N", HsnCd: "94032010", Qty: 2, Unit: "PCS", GstRt: 18, CgstAmt: 0, SgstAmt: 0 });
    expect(it0.AssAmt).toBe(1900); // (2360 - 118) / 1.18
    expect(it0.Discount).toBe(100); // 118 incl. -> 100 ex-tax
    expect(it0.TotAmt).toBe(2000);
    expect(it0.UnitPrice).toBe(1000);
    expect(it0.IgstAmt).toBe(342);
    expect(e.ValDtls).toMatchObject({ AssVal: 1900, IgstVal: 342, TotInvVal: 2242 });
    expect(e.BuyerDtls.Pos).toBe("29");
    expect(validateEinvoice(e)).toEqual([]);
  });

  it("handles exclusive prices and services", () => {
    const input = sample(false);
    input.lines[0].hsn = "998314";
    const e = buildEinvoice(input);
    expect(e.ItemList[0]).toMatchObject({ IsServc: "Y", TotAmt: 2360, Discount: 118, AssAmt: 2242 });
    expect(validateEinvoice(e)).toEqual([]);
  });

  it("catches problems the government portal would reject", () => {
    const input = sample(true);
    input.buyer = { ...buyer, gstin: "29AAGCB7383J1Z5", pin: "56001", location: "B" };
    input.lines[0].hsn = "94";
    input.docNo = "0INV/2026-27/000001";
    const errors = validateEinvoice(buildEinvoice(input)).join("\n");
    expect(errors).toMatch(/customer's GSTIN/);
    expect(errors).toMatch(/Customer PIN/);
    expect(errors).toMatch(/Customer city/);
    expect(errors).toMatch(/HSN/);
    expect(errors).toMatch(/16 characters/);
  });

  it("references the original invoice on credit notes", () => {
    const e = buildEinvoice({ ...sample(true), docType: "CRN", docNo: "CN/26-27/00001", original: { no: "INV/26-27/00001", date: "20/10/2026" } });
    expect(e.RefDtls).toEqual({ PrecDocDtls: [{ InvNo: "INV/26-27/00001", InvDt: "20/10/2026" }] });
  });

  it("builds e-way bill payloads", () => {
    const e = buildEinvoice(sample(true));
    expect(ewbByIrnPayload("abc", { transMode: "1", distance: 0, vehNo: "mh 12 ab 1234" })).toEqual({ Irn: "abc", Distance: 0, TransMode: "1", VehNo: "MH12AB1234", VehType: "R" });
    const bulk = ewbBulkJson(e, { transMode: "1", distance: 840, vehNo: "MH12AB1234" });
    expect(bulk.billLists[0]).toMatchObject({ fromGstin: "27AAPFU0939F1ZV", toGstin: "29AAGCB7383J1Z4", totInvValue: 2242, igstValue: 342, transDistance: 840 });
    expect(bulk.billLists[0].itemList[0]).toMatchObject({ hsnCode: 94032010, igstRate: 18, cgstRate: 0 });
  });
});
