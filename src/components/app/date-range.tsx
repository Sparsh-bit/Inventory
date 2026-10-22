"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SelectField } from "./select-field";

const iso = (d: Date) => d.toLocaleDateString("en-CA");

/** From/to date inputs + quick presets, kept in the URL. */
export function DateRange({ from, to }: { from: string; to: string }) {
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
  const today = new Date();
  const presets: Record<string, [string, string]> = {
    today: [iso(today), iso(today)],
    yesterday: [iso(new Date(Date.now() - 864e5)), iso(new Date(Date.now() - 864e5))],
    last7: [iso(new Date(Date.now() - 6 * 864e5)), iso(today)],
    month: [iso(new Date(today.getFullYear(), today.getMonth(), 1)), iso(today)],
    lastMonth: [iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), iso(new Date(today.getFullYear(), today.getMonth(), 0))],
    last90: [iso(new Date(Date.now() - 89 * 864e5)), iso(today)],
    year: [iso(new Date(today.getFullYear(), 0, 1)), iso(today)],
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
