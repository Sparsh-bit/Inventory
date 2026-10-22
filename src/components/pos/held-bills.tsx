"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { discardHeldBill, listHeldBills } from "@/server/actions/sales";
import { useOrg } from "@/components/app/org-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";

interface Held {
  id: string;
  total: number;
  customer: string;
  items: number;
  at: string;
  cashier: string;
}

export function HeldBills({ open, onOpenChange, locationId, onResume }: { open: boolean; onOpenChange: (o: boolean) => void; locationId: string; onResume: (id: string) => void }) {
  const org = useOrg();
  const [rows, setRows] = useState<Held[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listHeldBills({ locationId }).then((r) => alive && setRows(r.ok ? r.data : []));
    return () => {
      alive = false;
    };
  }, [open, locationId]);

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setRows(null); }}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Held bills</SheetTitle>
          <SheetDescription>Parked bills for this location. Resume one to finish it.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4">
          {rows === null ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No held bills.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {rows.map((h) => (
                <li key={h.id} className="flex items-center gap-3 p-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onResume(h.id)}>
                    <span className="block font-medium tabular-nums">{org.money(h.total)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {h.customer || "Walk-in"} · {h.items} item{h.items === 1 ? "" : "s"} · {new Date(h.at).toLocaleTimeString(org.locale, { hour: "2-digit", minute: "2-digit" })} · {h.cashier}
                    </span>
                  </button>
                  <Button size="sm" onClick={() => onResume(h.id)}>Resume</Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Discard held bill"
                    onClick={async () => {
                      await discardHeldBill({ id: h.id });
                      setRows((rs) => rs?.filter((x) => x.id !== h.id) ?? null);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
