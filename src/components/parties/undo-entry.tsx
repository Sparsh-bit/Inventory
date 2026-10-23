"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { undoEntry } from "@/server/actions/parties";
import { useOrg } from "@/components/app/org-context";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

/** Undo a mistaken udhaar entry or payment: posts an opposite line, keeps the original visible. */
export function UndoEntryButton({ entryId, what, amount }: { entryId: string; what: string; amount: number }) {
  const org = useOrg();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending } = useAction(undoEntry);
  return (
    <>
      <Button variant="ghost" size="xs" className="ml-1 text-muted-foreground" onClick={() => { setReason(""); setOpen(true); }} aria-label={`Undo ${what} of ${org.money(amount)}`}>
        <Undo2 /> Undo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo this {what}?</DialogTitle>
            <DialogDescription>
              {org.money(amount)} will be reversed with a correcting entry. The original stays on the statement, marked as reversed.
              {what === "payment" && " The amounts it paid go back to being due on those bills."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run({ entryId, reason }, { onSuccess: () => { toast.success("Entry undone"); setOpen(false); router.refresh(); } });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`undo-${entryId}`}>Reason</Label>
              <Input id={`undo-${entryId}`} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={200} required autoFocus placeholder="e.g. Entered twice, wrong customer" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep it</Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Spinner />} Undo {what}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
