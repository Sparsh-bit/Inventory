// Minimal ESC/POS encoder for 58mm (32 col) and 80mm (48 col) thermal printers.
// Text is transliterated to ASCII so it prints identically on every code page.

const ESC = 0x1b;
const GS = 0x1d;

const REPLACE: Record<string, string> = { "₹": "Rs.", "€": "EUR", "£": "GBP", "¥": "JPY", "—": "-", "–": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "×": "x" };

export function toAscii(s: string): string {
  return s
    .replace(/[₹€£¥—–‘’“”…×]/g, (c) => REPLACE[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

export class EscPos {
  readonly width: number;
  private buf: number[] = [];

  constructor(opts: { width?: 32 | 48 } = {}) {
    this.width = opts.width ?? 32;
  }

  private raw(...b: number[]) {
    this.buf.push(...b);
    return this;
  }

  init() {
    return this.raw(ESC, 0x40);
  }
  text(s: string) {
    for (const ch of toAscii(s)) this.buf.push(ch.charCodeAt(0));
    return this;
  }
  /** Prints text and a newline, wrapping anything wider than the paper. */
  line(s = "") {
    const t = toAscii(s);
    if (t.length <= this.width) return this.text(t + "\n");
    for (let i = 0; i < t.length; i += this.width) this.text(t.slice(i, i + this.width) + "\n");
    return this;
  }
  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  align(a: "left" | "center" | "right") {
    return this.raw(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  }
  size(w: 1 | 2, h: 1 | 2) {
    return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1));
  }
  divider(ch = "-") {
    return this.line(ch.repeat(this.width));
  }
  /** Left text and right-aligned text on one line; long left text wraps. */
  cols(left: string, right: string) {
    const l = toAscii(left);
    const r = toAscii(right);
    const w = this.width;
    if (l.length + r.length + 1 <= w) return this.line(l + " ".repeat(w - l.length - r.length) + r);
    const chunks: string[] = [];
    for (let i = 0; i < l.length; i += w) chunks.push(l.slice(i, i + w));
    const lastChunk = chunks.pop() ?? "";
    for (const c of chunks) this.line(c);
    if (lastChunk.length + r.length + 1 <= w) return this.line(lastChunk + " ".repeat(w - lastChunk.length - r.length) + r);
    this.line(lastChunk);
    return this.line(" ".repeat(Math.max(0, w - r.length)) + r);
  }
  feed(n = 1) {
    return this.raw(ESC, 0x64, n);
  }
  cut() {
    return this.raw(GS, 0x56, 0x42, 0x00);
  }
  /** Pulse cash drawer pin 2. */
  drawer() {
    return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa);
  }
  qr(data: string, size = 6) {
    const bytes = Array.from(new TextEncoder().encode(data));
    const len = bytes.length + 3;
    return this.raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00) // model 2
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size)
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31) // error correction M
      .raw(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...bytes)
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
  }
  bytes(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}
