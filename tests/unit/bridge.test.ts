import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

const BRIDGE = fileURLToPath(new URL("../../print-bridge/bridge.mjs", import.meta.url));
const KEY = "test-key-1234567890";
let printer: net.Server;
let received: Buffer[] = [];
let bridge: ChildProcess;
let port = 0;

beforeAll(async () => {
  printer = net.createServer((s) => s.on("data", (d) => received.push(d)));
  await new Promise<void>((r) => printer.listen(0, "127.0.0.1", r));
  const printerPort = (printer.address() as net.AddressInfo).port;
  port = 19000 + Math.floor(Math.random() * 1000);
  bridge = spawn(process.execPath, [BRIDGE, "--printer", "127.0.0.1", "--printer-port", String(printerPort), "--key", KEY, "--port", String(port), "--origin", "https://shop.example"]);
  await new Promise<void>((resolve, reject) => {
    bridge.stdout!.on("data", (d) => String(d).includes("print bridge on") && resolve());
    bridge.once("exit", (c) => reject(new Error(`bridge exited ${c}`)));
  });
});

afterAll(async () => {
  bridge?.kill();
  await new Promise((r) => printer.close(r));
});

const url = () => `http://127.0.0.1:${port}`;

describe("print bridge", () => {
  it("forwards bytes to the printer with the right key", async () => {
    received = [];
    const res = await fetch(`${url()}/print`, { method: "POST", headers: { "X-Bridge-Key": KEY, Origin: "https://shop.example" }, body: new Uint8Array([0x1b, 0x40, 0x41]) });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://shop.example");
    await new Promise((r) => setTimeout(r, 100));
    expect([...Buffer.concat(received)]).toEqual([0x1b, 0x40, 0x41]);
  });
  it("rejects a wrong key", async () => {
    const res = await fetch(`${url()}/print`, { method: "POST", headers: { "X-Bridge-Key": "nope", Origin: "https://shop.example" }, body: "x" });
    expect(res.status).toBe(401);
  });
  it("rejects other websites", async () => {
    const res = await fetch(`${url()}/print`, { method: "POST", headers: { "X-Bridge-Key": KEY, Origin: "https://evil.example" }, body: "x" });
    expect(res.status).toBe(403);
  });
  it("answers private-network preflight", async () => {
    const res = await fetch(`${url()}/print`, { method: "OPTIONS", headers: { Origin: "https://shop.example", "Access-Control-Request-Private-Network": "true" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-private-network")).toBe("true");
  });
});
