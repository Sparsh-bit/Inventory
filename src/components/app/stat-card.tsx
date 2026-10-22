import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({ label, value, hint, icon: Icon, tone = "default" }: { label: string; value: string; hint?: React.ReactNode; icon: LucideIcon; tone?: "default" | "success" | "warning" | "destructive" }) {
  const tones = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground dark:text-warning",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}
