"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fromMinor, toMinor } from "@/lib/money";
import { INDIAN_STATES, type PartyInput } from "@/lib/schemas";
import { upsertParty } from "@/server/actions/parties";
import { FormField } from "@/components/app/form-field";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function PartyDialog({ open, onOpenChange, kind, party }: { open: boolean; onOpenChange: (o: boolean) => void; kind: "customer" | "supplier"; party?: PartyInput & { id: string } }) {
  const router = useRouter();
  const org = useOrg();
  const { run, pending, fieldErrors } = useAction(upsertParty);
  const [stateCode, setStateCode] = useState(party?.stateCode ?? "");
  const label = kind === "customer" ? "customer" : "supplier";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? "").trim();
    let creditLimit = 0;
    let openingBalance = 0;
    try {
      creditLimit = str("creditLimit") ? toMinor(str("creditLimit")) : 0;
      openingBalance = str("openingBalance") ? toMinor(str("openingBalance")) : 0;
    } catch {
      return toast.error("Enter amounts like 5000 or 120.50");
    }
    run(
      {
        id: party?.id ?? null,
        data: {
          kind, name: str("name"), phone: str("phone"), email: str("email"), taxId: str("taxId"), stateCode,
          address: { line1: str("line1"), city: str("city"), state: str("state"), postalCode: str("postalCode") },
          creditLimit, openingBalance, notes: str("notes"),
        },
      },
      {
        success: party ? "Saved" : `New ${label} added`,
        onSuccess: (r) => {
          onOpenChange(false);
          if (!party) router.push(`/${kind}s/${r.id}`);
          router.refresh();
        },
      },
    );
  }

  const e = (k: string) => fieldErrors[`data.${k}`];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{party ? `Edit ${label}` : `New ${label}`}</DialogTitle>
          <DialogDescription>Only the name is required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <FormField label="Name" error={e("name")}>
              <Input name="name" required maxLength={200} defaultValue={party?.name} autoFocus />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Phone" optional error={e("phone")}>
                <Input name="phone" type="tel" maxLength={20} defaultValue={party?.phone} />
              </FormField>
              <FormField label="Email" optional error={e("email")}>
                <Input name="email" type="email" maxLength={200} defaultValue={party?.email} />
              </FormField>
              <FormField label={org.taxMode === "GST" ? "GSTIN" : "Tax ID"} optional error={e("taxId")}>
                <Input name="taxId" maxLength={20} className="uppercase" defaultValue={party?.taxId} />
              </FormField>
              {org.taxMode === "GST" && (
                <FormField label="State (place of supply)" optional>
                  <SelectField value={stateCode} onValueChange={setStateCode} options={INDIAN_STATES} placeholder="Same as business" />
                </FormField>
              )}
            </div>
            <FormField label="Address" optional>
              <Input name="line1" maxLength={200} defaultValue={party?.address?.line1} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="City" optional>
                <Input name="city" maxLength={100} defaultValue={party?.address?.city} />
              </FormField>
              <FormField label="State / region" optional>
                <Input name="state" maxLength={100} defaultValue={party?.address?.state} />
              </FormField>
              <FormField label="PIN / ZIP" optional>
                <Input name="postalCode" maxLength={20} defaultValue={party?.address?.postalCode} />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {kind === "customer" && (
                <FormField label="Credit limit" optional description="0 = no limit">
                  <Input name="creditLimit" inputMode="decimal" defaultValue={party?.creditLimit ? fromMinor(party.creditLimit) : ""} />
                </FormField>
              )}
              <FormField label="Opening balance" optional description={kind === "customer" ? "Amount they already owe you" : "Amount you already owe them"}>
                <Input name="openingBalance" inputMode="decimal" defaultValue={party?.openingBalance ? fromMinor(party.openingBalance) : ""} />
              </FormField>
            </div>
            <FormField label="Notes" optional>
              <Textarea name="notes" rows={2} maxLength={1000} defaultValue={party?.notes} />
            </FormField>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewPartyButton({ kind, autoOpen = false }: { kind: "customer" | "supplier"; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New {kind}</Button>
      <PartyDialog open={open} onOpenChange={setOpen} kind={kind} />
    </>
  );
}

export function EditPartyButton({ kind, party }: { kind: "customer" | "supplier"; party: PartyInput & { id: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>Edit</Button>
      <PartyDialog open={open} onOpenChange={setOpen} kind={kind} party={party} />
    </>
  );
}
