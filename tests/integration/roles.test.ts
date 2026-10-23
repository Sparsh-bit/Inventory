/**
 * Role matrix: every server action is called as every role. Each call must be refused
 * exactly when the role lacks the permission, and otherwise get past authorization
 * (empty input then fails validation, which proves the permission gate let it through).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { ROLES, can, type Permission, type Role } from "@/lib/permissions";
import type { Ctx } from "@/server/context";

let current: Ctx | null = null;
vi.mock("@/server/context", async (orig) => ({ ...(await orig<typeof import("@/server/context")>()), loadCtx: vi.fn(async () => current) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const DENIED = "You don't have permission to do that.";
let rs: MongoMemoryReplSet;
// [module, export name, permission the action requires]
const ACTIONS: [string, string, Permission][] = [
  ["products", "saveProduct", "products:write"], ["products", "archiveProduct", "products:write"], ["products", "searchProducts", "products:read"],
  ["products", "lookupCode", "products:read"], ["products", "saveCategory", "products:write"], ["products", "deleteCategory", "products:write"],
  ["products", "listTaxRates", "products:read"], ["products", "availableSerials", "products:read"],
  ["sales", "checkout", "pos:sell"], ["sales", "holdBill", "pos:sell"], ["sales", "listHeldBills", "pos:sell"], ["sales", "discardHeldBill", "pos:sell"],
  ["sales", "resumeHeldBill", "pos:sell"], ["sales", "refundSale", "sales:return"], ["sales", "cancelSale", "sales:void"], ["sales", "receiptData", "sales:read"],
  ["sales", "findCustomers", "parties:read"], ["sales", "quickAddCustomer", "parties:write"], ["sales", "listBatches", "pos:sell"],
  ["sales", "startRemoteScan", "products:read"], ["sales", "stopRemoteScan", "products:read"],
  ["inventory", "adjust", "stock:write"], ["inventory", "transfer", "stock:write"], ["inventory", "count", "stock:write"], ["inventory", "variantBatches", "stock:read"],
  ["inventory", "saveLocation", "settings:manage"],
  ["purchases", "savePO", "purchases:write"], ["purchases", "receivePO", "purchases:write"], ["purchases", "returnPO", "purchases:write"], ["purchases", "cancelPO", "purchases:write"],
  ["purchases", "savePurchaseBill", "purchases:write"], ["purchases", "attachFiles", "purchases:write"], ["purchases", "detachFile", "purchases:write"],
  ["parties", "upsertParty", "parties:read"], ["parties", "archiveParty", "parties:read"], ["parties", "addPayment", "parties:read"],
  ["parties", "openBills", "parties:read"], ["parties", "addUdhaarEntry", "parties:read"], ["parties", "undoEntry", "ledger:reverse"], ["sales", "billShareLink", "sales:read"],
  ["offline", "registerTill", "pos:sell"], ["offline", "getPosSnapshot", "pos:sell"], ["offline", "syncOfflineSales", "pos:sell"], ["offline", "markSaleReviewed", "sales:return"],
  ["einvoice", "saveEinvoice", "settings:manage"], ["einvoice", "testEinvoice", "settings:manage"], ["einvoice", "createIrn", "sales:void"], ["einvoice", "voidIrn", "sales:void"],
  ["einvoice", "createEwb", "sales:void"], ["einvoice", "downloadGstJson", "sales:read"],
  ["settings", "updateBusiness", "settings:manage"], ["settings", "updateReceipt", "settings:manage"], ["settings", "saveTaxRate", "settings:manage"], ["settings", "deleteTaxRate", "settings:manage"],
];

const mods: Record<string, Record<string, (i: unknown) => Promise<{ ok: boolean; error?: string }>>> = {};

beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  Object.assign(process.env, { MONGODB_URI: rs.getUri("roles-test"), BETTER_AUTH_SECRET: "y".repeat(40), APP_URL: "http://localhost:3000" });
  for (const m of new Set(ACTIONS.map(([mod]) => mod))) mods[m] = (await import(`@/server/actions/${m}.ts`)) as never;
});

afterAll(async () => {
  await mongoose.disconnect();
  await rs?.stop();
});

const ctxFor = (role: Role): Ctx => ({ userId: `u-${role}`, userName: role, userEmail: `${role}@x.test`, orgId: new mongoose.Types.ObjectId().toHexString(), orgName: "Org", role });

describe.each(ROLES)("role: %s", (role) => {
  it.each(ACTIONS)("%s.%s requires %s", async (mod, name, permission) => {
    current = ctxFor(role);
    // Actions whose input schema is `{}` would legitimately run; give them input that fails validation.
    const res = await mods[mod][name]({ __invalid: true });
    expect(res.ok).toBe(false);
    if (can(role, permission)) expect(res.error).not.toBe(DENIED);
    else expect(res.error).toBe(DENIED);
  });
});

describe("unauthenticated", () => {
  it.each(ACTIONS)("%s.%s refuses without a session", async (mod, name) => {
    current = null;
    const res = await mods[mod][name]({});
    expect(res).toEqual({ ok: false, error: "Your session has expired. Please sign in again." });
  });
});

describe("kind-specific party rules", () => {
  it("cashier can add customers but not suppliers", async () => {
    current = ctxFor("cashier");
    const base = { name: "X", phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 0, openingBalance: 0, notes: "" };
    const ok = await mods.parties.upsertParty({ id: null, data: { ...base, kind: "customer" } });
    expect(ok.ok).toBe(true);
    const no = await mods.parties.upsertParty({ id: null, data: { ...base, kind: "supplier" } });
    expect(no).toMatchObject({ ok: false, error: DENIED });
  });
  it("stock keeper can add suppliers but not customers", async () => {
    current = ctxFor("stockkeeper");
    const base = { name: "Y", phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 0, openingBalance: 0, notes: "" };
    expect((await mods.parties.upsertParty({ id: null, data: { ...base, kind: "supplier" } })).ok).toBe(true);
    expect(await mods.parties.upsertParty({ id: null, data: { ...base, kind: "customer" } })).toMatchObject({ ok: false, error: DENIED });
  });
  it("udhaar follows the same rules: cashier for customers, purchasing staff for suppliers, never another business", async () => {
    const owner = ctxFor("owner");
    current = owner;
    const base = { phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 0, openingBalance: 0, notes: "" };
    const cust = (await mods.parties.upsertParty({ id: null, data: { ...base, name: "C", kind: "customer" } })) as unknown as { ok: true; data: { id: string } };
    const sup = (await mods.parties.upsertParty({ id: null, data: { ...base, name: "S", kind: "supplier" } })) as unknown as { ok: true; data: { id: string } };
    const entry = (partyId: string) => ({ partyId, amount: 100, note: "test", date: null });

    current = { ...owner, role: "cashier" };
    expect((await mods.parties.addUdhaarEntry(entry(cust.data.id))).ok).toBe(true);
    expect(await mods.parties.addUdhaarEntry(entry(sup.data.id))).toMatchObject({ ok: false, error: DENIED });
    current = { ...owner, role: "stockkeeper" };
    expect(await mods.parties.addUdhaarEntry(entry(cust.data.id))).toMatchObject({ ok: false, error: DENIED });
    expect((await mods.parties.addUdhaarEntry(entry(sup.data.id))).ok).toBe(true);
    current = ctxFor("owner"); // a different business
    expect(await mods.parties.addUdhaarEntry(entry(cust.data.id))).toMatchObject({ ok: false });
    expect(await mods.parties.openBills({ partyId: cust.data.id })).toMatchObject({ ok: false });
  });
  it("a cashier can't change an existing customer's opening balance (it would erase dues)", async () => {
    const owner = ctxFor("owner");
    current = owner;
    const data = { kind: "customer" as const, name: "Dues", phone: "", email: "", taxId: "", stateCode: "", address: {}, creditLimit: 0, openingBalance: 5000, notes: "" };
    const made = (await mods.parties.upsertParty({ id: null, data })) as unknown as { data: { id: string } };
    current = { ...owner, role: "cashier" };
    expect(await mods.parties.upsertParty({ id: made.data.id, data: { ...data, openingBalance: 0 } })).toMatchObject({ ok: false, error: expect.stringMatching(/owner or manager/) });
    expect((await mods.parties.upsertParty({ id: made.data.id, data: { ...data, phone: "9876543210" } })).ok).toBe(true);
    current = { ...owner, role: "manager" };
    expect((await mods.parties.upsertParty({ id: made.data.id, data: { ...data, openingBalance: 4000 } })).ok).toBe(true);
  });
});
