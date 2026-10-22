/** Quantity stored as integer × scale → human string ("1.5", "12"). */
export function formatQty(qty: number, scale = 1): string {
  if (scale === 1) return String(qty);
  return (qty / scale).toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function formatDate(d: Date | string, tz: string, locale = "en-IN", withTime = false): string {
  return new Date(d).toLocaleString(locale, {
    timeZone: tz, day: "2-digit", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export const PAYMENT_LABELS: Record<string, string> = { cash: "Cash", card: "Card", upi: "UPI", credit: "On account", bank: "Bank transfer", other: "Other" };

export const pageOf = (v: unknown) => Math.max(1, Math.min(10_000, Number.parseInt(String(v ?? "1"), 10) || 1));
