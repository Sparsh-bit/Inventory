import { expect, test } from "vitest";
import { dayIn, zonedNoon } from "@/lib/dates";

test("today is worked out in the business's time zone", () => {
  const at = new Date("2026-10-23T20:00:00Z"); // 01:30 on the 24th in India
  expect(dayIn("Asia/Kolkata", at)).toBe("2026-10-24");
  expect(dayIn("UTC", at)).toBe("2026-10-23");
  expect(dayIn("America/New_York", at)).toBe("2026-10-23");
});

test("a back-dated entry stays on that date in any time zone", () => {
  for (const tz of ["Asia/Kolkata", "UTC", "Pacific/Auckland", "Pacific/Kiritimati", "America/Los_Angeles", "Pacific/Pago_Pago"]) {
    const d = zonedNoon("2026-01-20", tz);
    expect(dayIn(tz, d), tz).toBe("2026-01-20");
    expect(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d), tz).toBe("12");
  }
});
