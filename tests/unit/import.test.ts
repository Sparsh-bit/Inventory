import { describe, expect, it } from "vitest";
import { normalizeHeader, parsePartyRows, parseProductRows } from "@/lib/import";

describe("import parsing", () => {
  it("normalises headers and aliases", () => {
    expect(normalizeHeader(" Selling Price ")).toBe("price");
    expect(normalizeHeader("HSN Code")).toBe("hsn");
    expect(normalizeHeader("GST %")).toBe("tax_rate");
    expect(normalizeHeader("Mobile")).toBe("phone");
  });

  it("parses valid product rows with units and money", () => {
    const { valid, errors } = parseProductRows([{ name: "Rice", unit: "kg", price: "₹1,200.50", cost: "1000", opening_stock: "2.5", tax_rate: "5%", hsn: "1006" }]);
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ name: "Rice", scale: 1000, price: 120050, cost: 100000, opening: 2500, taxRateBp: 500, hsn: "1006" });
  });

  it("reports row-level errors with spreadsheet row numbers", () => {
    const { valid, errors } = parseProductRows([
      { name: "", price: "10" },
      { name: "Pen", price: "abc" },
      { name: "Book", price: "10", sku: "A1" },
      { name: "Book 2", price: "10", sku: "A1" },
      { name: "Bad HSN", price: "10", hsn: "12" },
    ]);
    expect(valid).toHaveLength(1);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 5, 6]);
    expect(errors[0].message).toMatch(/name is required/);
    expect(errors[2].message).toMatch(/twice/);
  });

  it("validates party rows", () => {
    const { valid, errors } = parsePartyRows([{ name: "Ravi", phone: "98765 43210", state_code: "27" }, { name: "X", email: "nope" }]);
    expect(valid[0]).toMatchObject({ name: "Ravi", stateCode: "27" });
    expect(errors[0]).toMatchObject({ row: 3 });
  });
});
