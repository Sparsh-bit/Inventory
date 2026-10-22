// All money is stored as integer hundredths of the currency's major unit ("minor").

const MONEY_RE = /^-?\d+(\.\d{1,2})?$/;

export function toMinor(major: string | number): number {
  const s = typeof major === "number" ? String(major) : major.trim();
  if (!MONEY_RE.test(s)) throw new Error(`Invalid amount: ${s}`);
  const neg = s.startsWith("-");
  const [int, frac = ""] = s.replace("-", "").split(".");
  const v = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(v)) throw new Error("Amount out of range");
  return neg ? -v : v;
}

export function fromMinor(minor: number): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const fmtCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor: number, currency: string, locale = "en-IN"): string {
  const key = `${locale}|${currency}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: "currency", currency });
    fmtCache.set(key, f);
  }
  return f.format(minor / 100);
}

/** Splits `total` across `weights` so the parts sum exactly to `total` (largest remainder). */
export function allocateProportionally(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  const wSum = sum > 0 ? sum : weights.length;
  const raw = w.map((x) => (total * x) / wSum);
  const parts = raw.map(Math.floor);
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) parts[order[k][1]]++;
  return parts;
}
