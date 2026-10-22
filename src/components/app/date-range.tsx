"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SelectField } from "./select-field";

/** yyyy-mm-dd arithmetic in UTC (pure, timezone-independent). */
function shift(isoDate: string, days = 0, months = 0, day?: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, day ?? d + days)).toISOString().slice(0, 10);
}

/** From/to date inputs + quick presets, kept in the URL. */
export function DateRange({ from, to, today }: { from: string; to: string; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (f: string, t: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("from", f);
    next.set("to", t);
    next.delete("page");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const presets: Record<string, [string, string]> = {
    today: [today, today],
    yesterday: [shift(today, -1), shift(today, -1)],
    last7: [shift(today, -6), today],
    month: [shift(today, 0, 0, 1), today],
    lastMonth: [shift(today, 0, -1, 1), shift(today, 0, 0, 0)],
    last90: [shift(today, -89), today],
    year: [`${today.slice(0, 4)}-01-01`, today],
  };
  const current = Object.entries(presets).find(([, [f, t]]) => f === from && t === to)?.[0] ?? "custom";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SelectField
        aria-label="Date range"
        className="w-40"
        value={current}
        onValueChange={(v) => v !== "custom" && go(...presets[v])}
        options={[
          ["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7 days"], ["month", "This month"], ["lastMonth", "Last month"],
          ["last90", "Last 90 days"], ["year", "This year"], ["custom", "Custom"],
        ]}
      />
      <div className="flex items-center gap-1.5">
        <CalendarDays className="size-4 text-muted-foreground" />
        <Input type="date" aria-label="From date" className="w-38" value={from} max={to} onChange={(e) => e.target.value && go(e.target.value, to)} />
        <span className="text-muted-foreground">–</span>
        <Input type="date" aria-label="To date" className="w-38" value={to} min={from} onChange={(e) => e.target.value && go(from, e.target.value)} />
      </div>
    </div>
  );
}
