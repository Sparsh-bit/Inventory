"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { fromMinor, toMinor } from "@/lib/money";
import { addPayment } from "@/server/actions/parties";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function PaymentButton({ partyId, kind, balance }: { partyId: string; kind: "customer" | "supplier"; balance: number }) {
  const org = useOrg();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const { run, pending } = useAction(addPayment);
  const verb = kind === "customer" ? "Receive payment" : "Pay supplier";

  return (
    <>
      <Button onClick={() => { setAmount(balance > 0 ? fromMinor(balance) : ""); setOpen(true); }}>
        <HandCoins /> {verb}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{verb}</DialogTitle>
            <DialogDescription>{balance > 0 ? `Outstanding: ${org.money(balance)}. The payment settles the oldest bills first.` : "No outstanding balance — this will be recorded as an advance."}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              let minor: number;
              try {
                minor = toMinor(amount);
              } catch {
                return toast.error("Enter an amount like 500 or 99.50");
              }
              run({ partyId, amount: minor, method: method as "cash", reference }, { success: "Payment recorded", onSuccess: () => { setOpen(false); router.refresh(); } });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount</Label>
                <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-method">Method</Label>
                <SelectField id="pay-method" value={method} onValueChange={setMethod} options={[["cash", "Cash"], ["upi", "UPI"], ["card", "Card"], ["bank", "Bank transfer"], ["other", "Other"]]} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Reference (optional)</Label>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} placeholder="Cheque no., UTR…" />
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
