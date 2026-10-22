import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "outline" },
  ordered: { label: "Ordered", variant: "outline" },
  partial: { label: "Partly received", variant: "secondary" },
  received: { label: "Received", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export function PoStatus({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
