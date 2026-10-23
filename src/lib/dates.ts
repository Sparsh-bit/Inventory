/** Calendar day (YYYY-MM-DD) in a time zone. Browser and server use this so "today" always agrees. */
export const dayIn = (timeZone: string, at = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC" }).format(at);

/** Midday of `day` in `timeZone`, as an instant. Midday stays on the same date in every zone and avoids DST edges. */
export function zonedNoon(day: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 12);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(guess))
      .map((x) => [x.type, Number(x.value)]),
  );
  const shownAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(guess - (shownAsUtc - guess));
}
