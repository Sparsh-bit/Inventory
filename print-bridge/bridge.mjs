#!/usr/bin/env node
// StockPilot print bridge — forwards ESC/POS bytes from the browser to a network (LAN) receipt
// printer on port 9100. Run it on any always-on computer in the shop. Zero dependencies.
//
//   node bridge.mjs --printer 192.168.1.50 --key "long-random-secret" --origin https://your-stockpilot-domain
//
// Then in StockPilot: Settings → Printer & scanner → Network (LAN), enter the same key.
import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { parseArgs } from "node:util";

const { values: opt } = parseArgs({
  options: {
    printer: { type: "string" },
    "printer-port": { type: "string", default: "9100" },
    key: { type: "string", default: process.env.BRIDGE_KEY },
    port: { type: "string", default: "9123" },
    host: { type: "string", default: "127.0.0.1" },
    origin: { type: "string", multiple: true, default: [] },
  },
});

if (!opt.printer || !opt.key || opt.key.length < 12) {
  console.error("Usage: node bridge.mjs --printer <printer-ip> --key <secret, 12+ chars> [--origin https://app.example.com] [--port 9123]");
  process.exit(1);
}

const MAX_BYTES = 1024 * 1024;
const origins = new Set(opt.origin);
const keyBuf = Buffer.from(opt.key);

function keyMatches(given) {
  const b = Buffer.from(String(given ?? ""));
  return b.length === keyBuf.length && timingSafeEqual(b, keyBuf);
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (origins.size === 0 || origins.has(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Key");
    // Chrome Private Network Access: allow https pages to reach this local service.
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    return true;
  }
  return !origin; // non-browser clients (curl) have no Origin
}

function sendToPrinter(data) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: opt.printer, port: Number(opt["printer-port"]) });
    socket.setTimeout(5000, () => socket.destroy(new Error("Printer did not respond (timeout)")));
    socket.once("error", reject);
    socket.once("connect", () => socket.end(data));
    socket.once("close", (hadError) => !hadError && resolve());
  });
}

const server = http.createServer((req, res) => {
  const allowed = cors(req, res);
  if (req.method === "OPTIONS") return res.writeHead(allowed ? 204 : 403).end();
  if (!allowed) return res.writeHead(403).end("Origin not allowed");
  if (req.method === "GET" && req.url === "/health") return res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
  if (req.method !== "POST" || req.url !== "/print") return res.writeHead(404).end("Not found");
  if (!keyMatches(req.headers["x-bridge-key"])) return res.writeHead(401).end("Wrong bridge key");

  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BYTES) {
      res.writeHead(413).end("Too large");
      req.destroy();
    } else chunks.push(c);
  });
  req.on("end", async () => {
    if (res.writableEnded) return;
    try {
      await sendToPrinter(Buffer.concat(chunks));
      res.writeHead(200, { "Content-Type": "text/plain" }).end("printed");
    } catch (e) {
      res.writeHead(502, { "Content-Type": "text/plain" }).end(e instanceof Error ? e.message : "Printer error");
    }
  });
});

server.listen(Number(opt.port), opt.host, () => {
  console.log(`StockPilot print bridge on http://${opt.host}:${opt.port} → printer ${opt.printer}:${opt["printer-port"]}`);
  if (!origins.size) console.log("Tip: pass --origin https://your-app-domain to only accept requests from your StockPilot site.");
});
