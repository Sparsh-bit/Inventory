"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { dayIn } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { fromMinor, toMinor } from "@/lib/money";
import { addPayment, openBills } from "@/server/actions/parties";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type Bill = { id: string; number: string; ref: string; date: string; total: number; due: number };



const safeMinor = (v: string) => {
  try {
    return v.trim() ? toMinor(v) : 0;
  } catch {
    return NaN;
  }
};

export function PaymentButton({ partyId, kind, balance, size, variant }: { partyId: string; kind: "customer" | "supplier"; balance: number; size?: "sm" | "default"; variant?: "default" | "outline" }) {
  const org = useOrg();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => dayIn(org.timezone));
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [mode, setMode] = useState<"oldest" | "choose">("oldest");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const { run, pending } = useAction(addPayment);
  const verb = kind === "customer" ? "Receive payment" : "Pay supplier";
  const docWord = kind === "customer" ? "bill" : "purchase";

  async function start() {
    setAmount(balance > 0 ? fromMinor(balance) : "");
    setMethod("cash");
    setReference("");
    setNote("");
    setDate(dayIn(org.timezone));
    setMode("oldest");
    setPicked({});
    setBills(null);
    setOpen(true);
    const r = await openBills({ partyId }).catch(() => null);
    setBills(r?.ok ? r.data : []);
  }

  const payMinor = safeMinor(amount);
  const allocated = Object.values(picked).reduce((a, v) => a + (safeMinor(v) || 0), 0);

  function toggle(b: Bill, on: boolean) {
    setPicked((p) => {
      const next = { ...p };
      if (!on) {
        delete next[b.id];
        return next;
      }
      const used = Object.values(next).reduce((a, v) => a + (safeMinor(v) || 0), 0);
      const room = Number.isFinite(payMinor) && payMinor > 0 ? Math.max(payMinor - used, 0) : b.due;
      next[b.id] = fromMinor(Math.min(b.due, room || b.due));
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(payMinor) || payMinor <= 0) return toast.error("Enter an amount like 500 or 99.50");
    const allocations: { docId: string; amount: number }[] = [];
    if (mode === "choose") {
      for (const [docId, v] of Object.entries(picked)) {
        const b = bills?.find((x) => x.id === docId);
        const a = safeMinor(v);
        if (!b || !Number.isFinite(a) || a <= 0) return toast.error(`Enter the amount for ${b?.number ?? "the selected bill"}`);
        if (a > b.due) return toast.error(`${b.number} only has ${org.money(b.due)} due`);
        allocations.push({ docId, amount: a });
      }
      if (!allocations.length) return toast.error(`Tick the ${docWord}s this payment is for, or choose "Oldest first"`);
      if (allocated > payMinor) return toast.error(`The amounts against ${docWord}s (${org.money(allocated)}) are more than the payment (${org.money(payMinor)})`);
    }
    run(
      { partyId, amount: payMinor, method: method as "cash", reference, note, date, allocations },
      {
        onSuccess: (r) => {
          const parts = r.allocations.map((a) => `${a.number} ${org.money(a.amount)}`);
          toast.success("Payment recorded", { description: [parts.length ? `Against ${parts.join(", ")}` : "", r.advance > 0 ? `${org.money(r.advance)} kept as advance` : ""].filter(Boolean).join(" · ") || undefined });
          setOpen(false);
          router.refresh();
        },
      },
    );
  }

  return (
    <>
      <Button size={size} variant={variant} onClick={start}>
        <HandCoins /> {verb}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{verb}</DialogTitle>
            <DialogDescription>{balance > 0 ? `Outstanding: ${org.money(balance)}.` : "No outstanding balance. This will be recorded as an advance."}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount</Label>
                <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-date">Date</Label>
                <Input id="pay-date" type="date" value={date} max={dayIn(org.timezone)} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-method">Method</Label>
                <SelectField id="pay-method" value={method} onValueChange={setMethod} options={[["cash", "Cash"], ["upi", "UPI"], ["card", "Card"], ["bank", "Bank transfer"], ["other", "Other"]]} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-ref">Reference (optional)</Label>
                <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} placeholder="Cheque no., UTR…" />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium">Settle which {docWord}s?</legend>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={mode === "oldest" ? "secondary" : "outline"} onClick={() => setMode("oldest")} aria-pressed={mode === "oldest"}>Oldest first</Button>
                <Button type="button" variant={mode === "choose" ? "secondary" : "outline"} onClick={() => setMode("choose")} aria-pressed={mode === "choose"} disabled={bills?.length === 0}>Choose {docWord}s</Button>
              </div>
              {mode === "choose" &&
                (bills === null ? (
                  <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Spinner /> Loading unpaid {docWord}s…</p>
                ) : (
                  <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border" aria-label={`Unpaid ${docWord}s`}>
                    {bills.map((b) => {
                      const on = b.id in picked;
                      return (
                        <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
                          <Checkbox id={`bill-${b.id}`} checked={on} onCheckedChange={(v) => toggle(b, v === true)} />
                          <label htmlFor={`bill-${b.id}`} className="min-w-0 flex-1 cursor-pointer">
                            <span className="font-medium">{b.number}</span>
                            {b.ref && <span className="text-muted-foreground"> · Inv {b.ref}</span>}
                            <span className="block text-xs text-muted-foreground">
                              {formatDate(b.date, org.timezone, org.locale)} · Total {org.money(b.total)} · <span className="font-medium text-foreground">Due {org.money(b.due)}</span>
                            </span>
                          </label>
                          {on && (
                            <Input
                              aria-label={`Amount for ${b.number}`}
                              inputMode="decimal"
                              className="w-28"
                              value={picked[b.id]}
                              onChange={(e) => setPicked((p) => ({ ...p, [b.id]: e.target.value }))}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ))}
              {mode === "choose" && bills && bills.length > 0 && (
                <p className={`text-xs ${allocated > payMinor ? "text-destructive" : "text-muted-foreground"}`}>
                  Against selected {docWord}s: {org.money(allocated)} of {org.money(Number.isFinite(payMinor) ? payMinor : 0)}
                  {Number.isFinite(payMinor) && payMinor > allocated && ` · the remaining ${org.money(payMinor - allocated)} settles the oldest other ${docWord}s`}
                </p>
              )}
              {mode === "oldest" && <p className="text-xs text-muted-foreground">The payment is applied to the oldest unpaid {docWord}s first.</p>}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="pay-note">Note (optional)</Label>
              <Textarea id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="e.g. Part payment, balance next week" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner />} Save payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
