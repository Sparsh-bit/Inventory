import { beforeAll, expect, test } from "vitest";

let mod: typeof import("@/server/bill-link");
beforeAll(async () => {
  Object.assign(process.env, { MONGODB_URI: "mongodb://localhost/x", BETTER_AUTH_SECRET: "z".repeat(40), APP_URL: "https://shop.example.com/" });
  mod = await import("@/server/bill-link");
});

const org = "6500000000000000000000aa";
const id = "65a1b2c3d4e5f60718293a4b";

test("a genuine link verifies back to its sale", () => {
  expect(mod.verifyBillToken(mod.billToken(org, id))).toEqual({ orgId: org, saleId: id });
  expect(mod.billUrl(org, id)).toBe(`https://shop.example.com/bill/${mod.billToken(org, id)}`);
});

test("tampered or guessed links are refused", () => {
  const t = mod.billToken(org, id);
  const sig = t.split(".")[1];
  expect(mod.verifyBillToken(`${org}65a1b2c3d4e5f60718293a4c.${sig}`)).toBeNull(); // another sale
  expect(mod.verifyBillToken(`6500000000000000000000ab${id}.${sig}`)).toBeNull(); // another business
  expect(mod.verifyBillToken(`${t.slice(0, -1)}${t.endsWith("A") ? "B" : "A"}`)).toBeNull();
  expect(mod.verifyBillToken(id)).toBeNull();
  expect(mod.verifyBillToken("../../etc")).toBeNull();
});
