"use client";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useOrg } from "@/components/app/org-context";

const config = { revenue: { label: "Sales", color: "var(--chart-1)" } } satisfies ChartConfig;

export function SalesChart({ data }: { data: { date: string; revenue: number; count: number }[] }) {
  const { money, locale } = useOrg();
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={(d: string) => new Date(d + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short" })} />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => compact.format(v / 100)} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(d) => new Date(String(d) + "T00:00:00").toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
              formatter={(value, _name, item) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">{(item.payload as { count: number }).count} bills</span>
                  <span className="font-mono font-medium tabular-nums">{money(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Area dataKey="revenue" type="monotone" fill="url(#fillRevenue)" stroke="var(--color-revenue)" strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}
