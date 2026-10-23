"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { dayIn } from "@/lib/dates";
import { toMinor } from "@/lib/money";
import { addUdhaarEntry } from "@/server/actions/parties";
import { useOrg } from "@/components/app/org-context";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/** Khata entry: udhaar given to a customer, or taken from a supplier, without a bill. */
export function UdhaarButton({ partyId, partyName, kind, size, variant = "outline" }: { partyId: string; partyName: string; kind: "customer" | "supplier"; size?: "sm" | "default"; variant?: "default" | "outline" }) {
  const org = useOrg();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => dayIn(org.timezone));
  const { run, pending } = useAction(addUdhaarEntry);
  const verb = kind === "customer" ? "Gave udhaar" : "Took udhaar";

  return (
    <>
      <Button size={size} variant={variant} onClick={() => { setAmount(""); setNote(""); setDate(dayIn(org.timezone)); setOpen(true); }}>
        <NotebookPen /> {verb}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{verb}</DialogTitle>
            <DialogDescription>
              {kind === "customer" ? `Money or goods given to ${partyName} on credit, without a bill. It adds to what they owe you.` : `Money or goods taken from ${partyName} on credit. It adds to what you owe them.`}
            </DialogDescription>
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
              if (minor <= 0) return toast.error("Enter an amount like 500 or 99.50");
              run({ partyId, amount: minor, note, date }, { onSuccess: (r) => { toast.success("Entry added", { description: r.balance !== null ? `New balance ${org.money(r.balance)}` : undefined }); setOpen(false); router.refresh(); } });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="udhaar-amount">Amount</Label>
                <Input id="udhaar-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="udhaar-date">Date</Label>
                <Input id="udhaar-date" type="date" value={date} max={dayIn(org.timezone)} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="udhaar-note">Details</Label>
              <Textarea id="udhaar-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} required placeholder={kind === "customer" ? "e.g. 2 kg sugar and 1 L oil, pay on Sunday" : "e.g. Cash advance for next order"} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner />} Save entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
