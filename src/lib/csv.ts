const FORMULA_START = /^[=+\-@\t\r]/;

/** Neutralises spreadsheet formula injection; real numbers are left untouched. */
export function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = v instanceof Date ? v.toISOString() : String(v);
  return FORMULA_START.test(s) ? `'${s}` : s;
}

const quote = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const lines = [columns.map((c) => quote(escapeCell(c.label))).join(",")];
  for (const r of rows) lines.push(columns.map((c) => quote(escapeCell(r[c.key]))).join(","));
  return lines.join("\r\n") + "\r\n";
}
