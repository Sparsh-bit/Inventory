/** Fiscal-year label for document numbers: "26-27" (April start) or "26" (January start). */
export function fiscalYear(date: Date, startMonth: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "numeric" }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  if (startMonth === 1) return String(y % 100).padStart(2, "0");
  const start = m >= startMonth ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Offline bills use a per-till series that stays within GST's 16-character limit:
 * "<prefix><till>/<fy without dash>/<seq>", e.g. "ST2/2627/00001".
 */
export function offlineNumber(prefix: string, deviceCode: string, fy: string, seq: number): string {
  return `${prefix}${deviceCode}/${fy.replace("-", "")}/${String(seq).padStart(5, "0")}`;
}

const OFFLINE_RE = /^([A-Z0-9]{1,4})(T\d{1,3})\/(\d{2,4})\/(\d{5,})$/;

export function parseOfflineNumber(n: string): { prefix: string; deviceCode: string; fy: string; seq: number } | null {
  const m = OFFLINE_RE.exec(n);
  if (!m) return null;
  const fy = m[3].length === 4 ? `${m[3].slice(0, 2)}-${m[3].slice(2)}` : m[3];
  return { prefix: m[1], deviceCode: m[2], fy, seq: Number(m[4]) };
}
