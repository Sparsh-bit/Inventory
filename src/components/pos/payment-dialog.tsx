"use client";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Banknote, CreditCard, Landmark, Plus, Smartphone, X } from "lucide-react";
import { fromMinor, toMinor } from "@/lib/money";
import { useOrg } from "@/components/app/org-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Method = "cash" | "card" | "upi" | "credit";
export interface Tender {
  method: Method;
  amount: number;
  reference: string;
}

const METHODS: { id: Method; label: string; icon: typeof Banknote }[] = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "upi", label: "UPI", icon: Smartphone },
  { id: "credit", label: "On account", icon: Landmark },
];

function quickCash(total: number) {
  const notes = [1000, 5000, 10000, 20000, 50000, 100000, 200000];
  const out = new Set<number>([total]);
  for (const n of notes) {
    const v = Math.ceil(total / n) * n;
    if (v > total) out.add(v);
    if (out.size >= 5) break;
  }
  return [...out];
}

export function PaymentDialog({
  open, onOpenChange, total, hasCustomer, upiId, orgName, pending, kind, onKindChange, onPay,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; total: number; hasCustomer: boolean; upiId: string; orgName: string; pending: boolean;
  kind: "receipt" | "tax_invoice"; onKindChange: (k: "receipt" | "tax_invoice") => void; onPay: (tenders: Tender[]) => void;
}) {
  const org = useOrg();
  const [rows, setRows] = useState<{ method: Method; amount: string; reference: string }[]>([]);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (open) setRows([{ method: "cash", amount: fromMinor(total), reference: "" }]);
  }, [open, total]);

  const parsed = rows.map((r) => {
    try {
      return r.amount.trim() ? toMinor(r.amount) : 0;
    } catch {
      return NaN;
    }
  });
  const paid = parsed.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const cash = rows.reduce((a, r, i) => a + (r.method === "cash" && Number.isFinite(parsed[i]) ? parsed[i] : 0), 0);
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  const invalid = parsed.some((p) => !Number.isFinite(p) || p < 0) || paid < total || change > cash || (rows.some((r) => r.method === "credit") && !hasCustomer);
  const upiAmount = rows.reduce((a, r, i) => a + (r.method === "upi" ? parsed[i] || 0 : 0), 0);

  const upiUrl = useMemo(
    () => (upiId && upiAmount > 0 ? `upi://pay?${new URLSearchParams({ pa: upiId, pn: orgName.slice(0, 50), am: (upiAmount / 100).toFixed(2), cu: org.currency })}` : null),
    [upiId, upiAmount, orgName, org.currency],
  );
  useEffect(() => {
    if (!upiUrl) return setQr(null);
    QRCode.toDataURL(upiUrl, { margin: 1, width: 200 }).then(setQr, () => setQr(null));
  }, [upiUrl]);

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const submit = () => !invalid && !pending && onPay(rows.map((r, i) => ({ method: r.method, amount: parsed[i], reference: r.reference.trim() })).filter((t) => t.amount > 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey || (e.target as HTMLElement).tagName !== "BUTTON")) { e.preventDefault(); submit(); } }}>
        <DialogHeader>
          <DialogTitle>Take payment</DialogTitle>
          <DialogDescription>Split across methods if the customer pays in parts.</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-primary/5 p-4 text-center">
          <p className="text-sm text-muted-foreground">Amount due</p>
          <p className="text-4xl font-semibold tracking-tight tabular-nums">{org.money(total)}</p>
        </div>

        {org.taxMode === "GST" && (
          <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(v) => v && onKindChange(v as "receipt" | "tax_invoice")} className="w-full">
            <ToggleGroupItem value="receipt" className="flex-1">Receipt</ToggleGroupItem>
            <ToggleGroupItem value="tax_invoice" className="flex-1" disabled={!hasCustomer}>Tax invoice (B2B)</ToggleGroupItem>
          </ToggleGroup>
        )}

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex gap-1.5">
                {METHODS.map((m) => (
                  <Button key={m.id} type="button" size="sm" variant={r.method === m.id ? "default" : "outline"} className="flex-1 px-1" onClick={() => setRow(i, { method: m.id })} disabled={m.id === "credit" && !hasCustomer} aria-pressed={r.method === m.id}>
                    <m.icon /> <span className="truncate">{m.label}</span>
                  </Button>
                ))}
                {rows.length > 1 && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove payment" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`amt-${i}`} className="text-xs">Amount</Label>
                  <Input id={`amt-${i}`} inputMode="decimal" value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} onFocus={(e) => e.target.select()} className="h-10 text-lg tabular-nums" autoFocus={i === 0} aria-invalid={!Number.isFinite(parsed[i]) || undefined} />
                </div>
                {(r.method === "card" || r.method === "upi") && (
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`ref-${i}`} className="text-xs">Reference (optional)</Label>
                    <Input id={`ref-${i}`} value={r.reference} onChange={(e) => setRow(i, { reference: e.target.value })} className="h-10" maxLength={100} placeholder={r.method === "card" ? "Last 4 / approval" : "UTR"} />
                  </div>
                )}
              </div>
              {r.method === "cash" && (
                <div className="flex flex-wrap gap-1.5">
                  {quickCash(total - parsed.reduce((a, p, j) => a + (j !== i && Number.isFinite(p) ? p : 0), 0)).map((v) => (
                    <Button key={v} type="button" variant="secondary" size="sm" className="tabular-nums" onClick={() => setRow(i, { amount: fromMinor(v) })}>
                      {org.money(v)}
                    </Button>
                  ))}
                </div>
              )}
              {r.method === "credit" && <p className="text-xs text-muted-foreground">Added to the customer&apos;s account balance.</p>}
            </div>
          ))}
          {remaining > 0 && rows.length < 4 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { method: "card", amount: fromMinor(remaining), reference: "" }])}>
              <Plus /> Split payment ({org.money(remaining)} left)
            </Button>
          )}
        </div>

        {qr && (
          <div className="flex items-center gap-4 rounded-lg border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="UPI QR code" className="size-28 rounded bg-white p-1" />
            <p className="text-sm text-muted-foreground">Ask the customer to scan with any UPI app to pay <strong className="text-foreground">{org.money(upiAmount)}</strong>.</p>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-3 text-sm">
          {remaining > 0 ? (
            <span className="text-destructive">Still due <strong className="tabular-nums">{org.money(remaining)}</strong></span>
          ) : (
            <span>Change to return</span>
          )}
          <span className="text-2xl font-semibold tabular-nums">{org.money(change)}</span>
        </div>
        {change > cash && <p className="text-sm text-destructive">Only cash can be over-paid.</p>}

        <DialogFooter>
          <Button size="lg" className="h-11 w-full text-base" disabled={invalid || pending} onClick={submit}>
            {pending && <Spinner />} Complete sale <Kbd className="ml-2 bg-primary-foreground/20 text-primary-foreground">Enter</Kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
