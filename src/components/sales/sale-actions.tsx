"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, FileText, Printer, Undo2 } from "lucide-react";
import { formatQty } from "@/lib/format";
import { markSaleReviewed } from "@/server/actions/offline";
import { cancelSale, refundSale } from "@/server/actions/sales";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { printSale } from "@/components/print/use-print-sale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

interface Line {
  index: number;
  name: string;
  sold: number;
  returned: number;
  scale: number;
  unit: string;
  total: number;
  serials: string[];
}

export function SaleActions({ saleId, canReturn, canVoid, hasCustomer, lines }: { saleId: string; canReturn: boolean; canVoid: boolean; hasCustomer: boolean; lines: Line[] }) {
  const org = useOrg();
  const router = useRouter();
  const [retOpen, setRetOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const ret = useAction(refundSale);
  const voi = useAction(cancelSale);

  const qtyOf = (l: Line) => (l.serials.length ? (picked[l.index]?.length ?? 0) : Math.round(Number(qty[l.index] || 0) * l.scale));
  const items = lines
    .map((l) => ({ lineIndex: l.index, qty: qtyOf(l), ...(l.serials.length ? { serials: picked[l.index] ?? [] } : {}) }))
    .filter((i) => Number.isFinite(i.qty) && i.qty > 0);
  const refund = lines.reduce((a, l) => {
    const q = qtyOf(l);
    return a + (q > 0 ? Math.round((l.total * q) / l.sold) : 0);
  }, 0);

  return (
    <>
      <Button variant="outline" onClick={() => printSale(saleId, { format: "thermal" })}>
        <Printer /> Receipt
      </Button>
      <Button variant="outline" onClick={() => printSale(saleId, { format: "a4" })}>
        <FileText /> Invoice
      </Button>
      {canReturn && (
        <Button variant="outline" onClick={() => setRetOpen(true)}>
          <Undo2 /> Return
        </Button>
      )}
      {canVoid && (
        <Button variant="destructive" onClick={() => setVoidOpen(true)}>
          <Ban /> Void
        </Button>
      )}

      <Dialog open={retOpen} onOpenChange={setRetOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Return items</DialogTitle>
            <DialogDescription>Returned items go back into stock and a credit note is created.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {lines.map((l) => {
              const max = (l.sold - l.returned) / l.scale;
              return (
                <li key={l.index} className="flex items-center gap-3 p-3">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">{l.name}</span>
                    <span className="text-xs text-muted-foreground">Returnable: {formatQty(l.sold - l.returned, l.scale)} {l.unit}</span>
                  </span>
                  {l.serials.length ? (
                    <div className="flex max-w-56 flex-wrap justify-end gap-1">
                      {l.serials.map((sn) => {
                        const on = picked[l.index]?.includes(sn) ?? false;
                        return (
                          <button key={sn} type="button" aria-pressed={on} onClick={() => setPicked((p) => ({ ...p, [l.index]: on ? (p[l.index] ?? []).filter((x) => x !== sn) : [...(p[l.index] ?? []), sn] }))} className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                            {sn}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                  <Input aria-label={`Return quantity for ${l.name}`} className="w-20 text-center" inputMode="decimal" placeholder="0" disabled={max <= 0} value={qty[l.index] ?? ""} onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || (Number(v) >= 0 && Number(v) <= max)) setQty((q) => ({ ...q, [l.index]: v }));
                  }} />
                  )}
                </li>
              );
            })}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="refund-method">Refund as</Label>
              <SelectField id="refund-method" value={method} onValueChange={setMethod} options={[["cash", "Cash"], ["card", "Card"], ["upi", "UPI"], ...(hasCustomer ? [["credit", "Credit to customer account"] as const] : []), ["other", "Other"]]} />
            </div>
            <div className="space-y-1.5">
              <Label>Refund amount</Label>
              <p className="flex h-8 items-center text-lg font-semibold tabular-nums">{org.money(refund)}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ret-reason">Reason</Label>
            <Textarea id="ret-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="e.g. Damaged, wrong size" />
          </div>
          <DialogFooter>
            <Button
              disabled={!items.length || ret.pending}
              onClick={() =>
                ret.run({ saleId, items, refundMethod: method as "cash", reason }, {
                  success: "Return recorded",
                  onSuccess: (r) => {
                    setRetOpen(false);
                    void printSale(r.saleId);
                    router.push(`/sales/${r.saleId}`);
                    router.refresh();
                  },
                })
              }
            >
              {ret.pending && <Spinner />} Confirm return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this sale?</DialogTitle>
            <DialogDescription>All items go back to stock and the bill is marked void. Only today&apos;s bills can be voided.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} required />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>Keep sale</Button>
            <Button variant="destructive" disabled={reason.trim().length < 3 || voi.pending} onClick={() => voi.run({ saleId, reason }, { success: "Sale voided", onSuccess: () => { setVoidOpen(false); router.refresh(); } })}>
              {voi.pending && <Spinner />} Void sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MarkReviewedButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const { run, pending } = useAction(markSaleReviewed);
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run({ saleId }, { success: "Marked as reviewed", onSuccess: () => router.refresh() })}>
      {pending && <Spinner />} Mark as reviewed
    </Button>
  );
}
