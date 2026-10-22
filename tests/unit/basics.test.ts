import { describe, expect, it } from "vitest";
import { allocateProportionally, fromMinor, toMinor, formatMoney } from "@/lib/money";
import { ean13CheckDigit, isValidEan13, makeInternalEan13 } from "@/lib/ean13";
import { escapeCell, toCsv } from "@/lib/csv";
import { can } from "@/lib/permissions";

describe("money", () => {
  it("converts major <-> minor exactly", () => {
    expect(toMinor("12.34")).toBe(1234);
    expect(toMinor("0.1")).toBe(10);
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor("-5")).toBe(-500);
    expect(fromMinor(1234)).toBe("12.34");
    expect(fromMinor(-5)).toBe("-0.05");
  });
  it("rejects garbage", () => {
    expect(() => toMinor("12.345")).toThrow();
    expect(() => toMinor("abc")).toThrow();
  });
  it("allocates proportionally with exact sum", () => {
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportionally(10, [0, 0])).toEqual([5, 5]);
    expect(allocateProportionally(0, [3, 4])).toEqual([0, 0]);
    const r = allocateProportionally(997, [123, 456, 789]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(997);
  });
  it("formats currency", () => {
    expect(formatMoney(123456, "INR", "en-IN")).toBe("₹1,234.56");
  });
});

describe("ean13", () => {
  it("computes check digits", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
  });
  it("makes valid internal codes", () => {
    const c = makeInternalEan13(42);
    expect(c).toHaveLength(13);
    expect(c.startsWith("2")).toBe(true);
    expect(isValidEan13(c)).toBe(true);
  });
});

describe("csv", () => {
  it("neutralises formulas", () => {
    expect(escapeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCell("+1")).toBe("'+1");
    expect(escapeCell("@x")).toBe("'@x");
    expect(escapeCell(-5)).toBe("-5"); // real numbers stay numbers
  });
  it("quotes special characters", () => {
    expect(toCsv([{ a: 'he said "hi"', b: "x,y" }], [{ key: "a", label: "A" }, { key: "b", label: "B" }]))
      .toBe('A,B\r\n"he said ""hi""","x,y"\r\n');
  });
});

describe("permissions", () => {
  it("applies role matrix", () => {
    expect(can("cashier", "pos:sell")).toBe(true);
    expect(can("cashier", "cost:read")).toBe(false);
    expect(can("stockkeeper", "stock:write")).toBe(true);
    expect(can("stockkeeper", "pos:sell")).toBe(false);
    expect(can("manager", "settings:manage")).toBe(false);
    expect(can("owner", "settings:manage")).toBe(true);
  });
});
