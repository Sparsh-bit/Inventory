import { describe, expect, it } from "vitest";
import { createScanDetector } from "@/lib/scan-detector";
import { EscPos } from "@/lib/escpos";

function feed(keys: string[], gap: number) {
  const scans: string[] = [];
  let t = 1000;
  const d = createScanDetector({ interKeyMs: 30, minLength: 4, onScan: (c) => scans.push(c), now: () => t });
  const consumed = keys.map((key) => {
    t += gap;
    return d.handleKey({ key });
  });
  return { scans, consumed };
}

describe("scan detector", () => {
  it("detects fast bursts ending in Enter", () => {
    const { scans, consumed } = feed(["8", "9", "0", "1", "2", "Enter"], 5);
    expect(scans).toEqual(["89012"]);
    expect(consumed.at(-1)).toBe(true);
  });
  it("ignores human typing speed", () => {
    expect(feed(["1", "2", "3", "4", "Enter"], 120).scans).toEqual([]);
  });
  it("ignores too-short bursts", () => {
    expect(feed(["1", "2", "3", "Enter"], 5).scans).toEqual([]);
  });
  it("accepts Tab as terminator", () => {
    expect(feed(["A", "B", "C", "D", "Tab"], 5).scans).toEqual(["ABCD"]);
  });
  it("drops a slow leading keystroke before a fast burst", () => {
    const scans: string[] = [];
    let t = 0;
    const d = createScanDetector({ interKeyMs: 30, minLength: 4, onScan: (c) => scans.push(c), now: () => t });
    d.handleKey({ key: "a" });
    t += 500;
    for (const key of ["1", "2", "3", "4", "Enter"]) {
      d.handleKey({ key });
      t += 5;
    }
    expect(scans).toEqual(["1234"]);
  });
  it("ignores modifier keys mid-scan", () => {
    expect(feed(["Shift", "A", "Shift", "B", "1", "2", "Enter"], 5).scans).toEqual(["AB12"]);
  });
});

describe("EscPos", () => {
  it("encodes init, text, cut", () => {
    expect(Array.from(new EscPos().init().text("A").cut().bytes())).toEqual([0x1b, 0x40, 0x41, 0x1d, 0x56, 0x42, 0x00]);
  });
  it("encodes drawer kick", () => {
    expect(Array.from(new EscPos().drawer().bytes())).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });
  it("pads two columns to width", () => {
    const s = new TextDecoder().decode(new EscPos({ width: 32 }).cols("Item", "12.00").bytes());
    expect(s).toBe("Item" + " ".repeat(23) + "12.00\n");
  });
  it("wraps long left column", () => {
    const s = new TextDecoder().decode(new EscPos({ width: 32 }).cols("A very long product name that wraps", "9.00").bytes());
    for (const l of s.split("\n").filter(Boolean)) expect(l.length).toBeLessThanOrEqual(32);
  });
  it("transliterates non-ASCII to safe bytes", () => {
    const bytes = new EscPos().text("₹5 café").bytes();
    expect(Array.from(bytes).every((b) => b < 0x80)).toBe(true);
    expect(new TextDecoder().decode(bytes)).toBe("Rs.5 cafe");
  });
  it("encodes QR with GS ( k", () => {
    const b = Array.from(new EscPos().qr("hi").bytes());
    expect(b.slice(0, 3)).toEqual([0x1d, 0x28, 0x6b]);
  });
});
