import { expect, test } from "vitest";
import { waLink, waNumber } from "@/lib/whatsapp";

test("normalises the phone formats people type", () => {
  expect(waNumber("9876543210")).toBe("919876543210");
  expect(waNumber("98765 43210")).toBe("919876543210");
  expect(waNumber("09876543210")).toBe("919876543210");
  expect(waNumber("+91 98765-43210")).toBe("919876543210");
  expect(waNumber("919876543210")).toBe("919876543210");
  expect(waNumber("0091 9876543210")).toBe("919876543210");
  expect(waNumber("+1 415 555 0100")).toBe("14155550100");
});

test("rejects things that aren't phone numbers", () => {
  expect(waNumber("")).toBeNull();
  expect(waNumber("12345")).toBeNull();
  expect(waNumber("abc")).toBeNull();
  expect(waNumber("1".repeat(16))).toBeNull();
});

test("builds a wa.me link with the message encoded", () => {
  expect(waLink("9876543210", "Bill INV/1 & total ₹20")).toBe("https://wa.me/919876543210?text=Bill%20INV%2F1%20%26%20total%20%E2%82%B920");
  expect(waLink("123", "x")).toBeNull();
});
