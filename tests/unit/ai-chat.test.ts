import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/reports", () => ({
  startOfDay: () => new Date("2026-11-14T00:00:00Z"),
  salesTotals: async () => ({ revenue: 1234500, count: 12, avgBill: 102875, returns: 0, net: 1234500, creditGiven: 50000, grossProfit: 300000 }),
  salesByProduct: async () => [],
  lowStock: async () => [],
  balances: async () => ({ rows: [], total: 0 }),
  expiringBatches: async () => [],
}));
vi.mock("@/server/services/products", () => ({ searchVariants: async () => [] }));
vi.mock("@/server/models", () => ({ Types: { ObjectId: class {} }, StockLevel: { aggregate: async () => [] } }));
vi.mock("@/server/context", () => {
  class AppError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return {
    AppError,
    allowed: (ctx: { role: string }, p: string) => ctx.role === "owner" || !["reports:read"].includes(p),
    getOrgSettings: async () => ({ currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata" }),
  };
});

afterEach(() => {
  delete process.env.GROQ_API_KEY;
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function load(withKey = true) {
  Object.assign(process.env, { MONGODB_URI: "mongodb://localhost/x", BETTER_AUTH_SECRET: "x".repeat(40), APP_URL: "http://localhost:3000" });
  if (withKey) process.env.GROQ_API_KEY = "gsk_test";
  return import("@/server/services/ai-chat");
}
const ctx = (role = "owner") => ({ orgId: "a".repeat(24), orgName: "Sharma Kirana", role }) as never;

describe("Ask Galla", () => {
  it("is off without a key", async () => {
    const { chatReply } = await load(false);
    await expect(chatReply(ctx(), [{ role: "user", content: "hi" }])).rejects.toThrow(/not switched on/);
  });

  it("calls a tool for numbers, feeds the result back, and returns the final answer", async () => {
    const { chatReply } = await load();
    const replies = [
      { choices: [{ message: { content: null, tool_calls: [{ id: "t1", function: { name: "sales_summary", arguments: '{"period":"today"}' } }] } }] },
      { choices: [{ message: { content: "Aaj ₹12,345 ki bikri hui, 12 bills." } }] },
    ];
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => replies.shift() }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await chatReply(ctx(), [{ role: "user", content: "aaj kitni sale hui?" }]);
    expect(out).toBe("Aaj ₹12,345 ki bikri hui, 12 bills.");
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body);
    const toolMsg = second.messages.find((m: { role: string }) => m.role === "tool");
    expect(JSON.parse(toolMsg.content)).toMatchObject({ bills: 12, revenue: "₹12,345.00" });
    // The model is told it can only read, and the shop's name is in the prompt.
    expect(second.messages[0].content).toContain("Sharma Kirana");
    expect(second.messages[0].content).toMatch(/only read/);
  });

  it("hides the money tools from roles without access", async () => {
    const { chatReply } = await load();
    const replies = [
      { choices: [{ message: { content: null, tool_calls: [{ id: "t1", function: { name: "who_owes_money", arguments: '{"kind":"customer"}' } }] } }] },
      { choices: [{ message: { content: "Ask the owner." } }] },
    ];
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => replies.shift() }));
    vi.stubGlobal("fetch", fetchMock);
    await chatReply(ctx("cashier"), [{ role: "user", content: "who owes?" }]);
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body);
    expect(second.messages.find((m: { role: string }) => m.role === "tool").content).toContain("not allowed");
  });

  it("gives up politely if the model keeps asking for tools", async () => {
    const { chatReply } = await load();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: null, tool_calls: [{ id: "t", function: { name: "low_stock", arguments: "{}" } }] } }] }) })));
    expect(await chatReply(ctx(), [{ role: "user", content: "x" }])).toMatch(/too many steps/);
  });
});
