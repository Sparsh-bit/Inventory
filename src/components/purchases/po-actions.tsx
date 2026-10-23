"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatQty } from "@/lib/format";
import { fromMinor, toMinor } from "@/lib/money";
import { cancelPO, receivePO, returnPO } from "@/server/actions/purchases";
import { useAction } from "@/components/app/use-action";
import { SerialInput } from "@/components/serials/serial-input";
import { scanFeedback, useScanner } from "@/components/scanner/use-scanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export interface PoLine {
  id: string;
  name: string;
  sku: string;
  barcodes: string[];
  scale: number;
  unit: string;
  ordered: number;
  received: number;
  returned: number;
  unitCost: number;
  trackBatch: boolean;
  trackSerial: boolean;
}

export function PoActions({ id, status, lines }: { id: string; status: string; lines: PoLine[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"receive" | "return" | null>(null);
  const cancel = useAction(cancelPO);
  const open = status === "ordered" || status === "partial" || status === "draft";
  return (
    <>
      {open && (
        <Button onClick={() => setMode("receive")}>
          <PackageCheck /> Receive goods
        </Button>
      )}
      {lines.some((l) => l.received - l.returned > 0) && (
        <Button variant="outline" onClick={() => setMode("return")}>
          <Undo2 /> Return to supplier
        </Button>
      )}
      {(status === "ordered" || status === "draft") && (
        <Button variant="outline" disabled={cancel.pending} onClick={() => confirm("Cancel this purchase order?") && cancel.run({ id }, { success: "Order cancelled", onSuccess: () => router.refresh() })}>
          <XCircle /> Cancel order
        </Button>
      )}
      {mode && <LineDialog id={id} mode={mode} lines={lines} onClose={() => setMode(null)} />}
    </>
  );
}

function LineDialog({ id, mode, lines, onClose }: { id: string; mode: "receive" | "return"; lines: PoLine[]; onClose: () => void }) {
  const router = useRouter();
  const recv = useAction(receivePO);
  const ret = useAction(returnPO);
  const pending = recv.pending || ret.pending;
  const [rows, setRows] = useState(() =>
    lines.map((l) => ({
      ...l,
      qty: mode === "receive" && !l.trackSerial ? formatQty(Math.max(0, l.ordered - l.received), l.scale) : "",
      cost: fromMinor(l.unitCost),
      batchNo: "",
      expiry: "",
      serials: [] as string[],
      scanned: false, // the first scan replaces the pre-filled quantity instead of adding to it
    })),
  );
  const [activeSerialRow, setActiveSerialRow] = useState<string | null>(null);

  useScanner((code) => {
    const i = rows.findIndex((r) => r.barcodes.includes(code) || r.sku === code);
    const serialRows = rows.filter((r) => r.trackSerial);
    if (i >= 0 && rows[i].trackSerial) {
      setActiveSerialRow(rows[i].id);
      return void toast.info(`Now scan the serial numbers for ${rows[i].name}`);
    }
    if (i < 0 && serialRows.length) {
      const target = serialRows.find((r) => r.id === activeSerialRow) ?? (serialRows.length === 1 ? serialRows[0] : null);
      if (!target) return void toast.error("Click the serial box of the item first, then scan.");
      if (target.serials.includes(code)) return void toast.error(`${code} already added`);
      scanFeedback(true);
      setRows((rs) => rs.map((r) => (r.id === target.id ? { ...r, serials: [...r.serials, code], qty: String(r.serials.length + 1) } : r)));
      return;
    }
    if (i < 0) {
      scanFeedback(false);
      return void toast.error(`${code} is not on this order`);
    }
    scanFeedback(true);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, scanned: true, qty: String(r.scanned ? (Number(r.qty) || 0) + 1 : 1) } : r)));
  });

  function submit() {
    try {
      const payload = rows.map((r) => {
        const qty = r.trackSerial ? r.serials.length : Math.round(Number(r.qty || 0) * r.scale);
        if (!Number.isFinite(qty) || qty < 0) throw new Error(`Invalid quantity for ${r.name}`);
        return { r, qty };
      }).filter((x) => x.qty > 0);
      if (!payload.length) return toast.error("Enter a quantity for at least one item");
      if (mode === "receive") {
        recv.run(
          { id, lines: payload.map(({ r, qty }) => ({ lineId: r.id, qty, unitCost: toMinor(r.cost || "0"), ...(r.trackBatch ? { batchNo: r.batchNo, expiry: r.expiry || null } : {}), ...(r.trackSerial ? { serials: r.serials } : {}) })) },
          { success: "Stock received", onSuccess: () => { onClose(); router.refresh(); } },
        );
      } else {
        ret.run({ id, lines: payload.map(({ r, qty }) => ({ lineId: r.id, qty, ...(r.trackBatch && r.batchNo ? { batchNo: r.batchNo } : {}), ...(r.trackSerial ? { serials: r.serials } : {}) })) }, { success: "Return recorded", onSuccess: () => { onClose(); router.refresh(); } });
      }
    } catch (e) {
      toast.error((e as Error).message.startsWith("Invalid amount") ? "Enter costs like 120 or 99.50" : (e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === "receive" ? "Receive goods" : "Return to supplier"}</DialogTitle>
          <DialogDescription>{mode === "receive" ? "Scan items as they're unpacked, or type quantities. Stock is added at the delivery location." : "Returned items are taken out of stock and deducted from what you owe."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {rows.map((r, i) => {
            const max = mode === "receive" ? null : (r.received - r.returned) / r.scale;
            const set = (patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={r.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Ordered {formatQty(r.ordered, r.scale)} · received {formatQty(r.received, r.scale)}
                    {r.returned > 0 && ` · returned ${formatQty(r.returned, r.scale)}`} {r.unit}
                  </p>
                </div>
                {r.trackSerial ? (
                  <div className="sm:col-span-2" onClick={() => setActiveSerialRow(r.id)}>
                    <SerialInput
                      label={`Serial numbers for ${r.name}`}
                      value={r.serials}
                      onFocus={() => setActiveSerialRow(r.id)}
                      onChange={(serials) => set({ serials, qty: String(serials.length) })}
                      expected={mode === "receive" ? Math.max(0, r.ordered - r.received) : undefined}
                    />
                  </div>
                ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input aria-label={`Quantity for ${r.name}`} className="w-20" inputMode="decimal" placeholder="Qty" value={r.qty} onChange={(e) => set({ qty: e.target.value })} max={max ?? undefined} />
                  {mode === "receive" && <Input aria-label={`Unit cost for ${r.name}`} className="w-24" inputMode="decimal" placeholder="Cost" value={r.cost} onChange={(e) => set({ cost: e.target.value })} />}
                  {r.trackBatch && <Input aria-label={`Batch number for ${r.name}`} className="w-28" placeholder="Batch no." value={r.batchNo} onChange={(e) => set({ batchNo: e.target.value })} maxLength={40} />}
                  {r.trackBatch && mode === "receive" && <Input aria-label={`Expiry for ${r.name}`} className="w-36" type="date" value={r.expiry} onChange={(e) => set({ expiry: e.target.value })} />}
                </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Spinner />} {mode === "receive" ? "Receive stock" : "Return items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
