"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, UserRound, X } from "lucide-react";
import { INDIAN_STATES } from "@/lib/schemas";
import { findCustomers, quickAddCustomer } from "@/server/actions/sales";
import { FormField } from "@/components/app/form-field";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { PosCustomer } from "./types";

export function CustomerPicker({ value, onChange }: { value: PosCustomer | null; onChange: (c: PosCustomer | null) => void }) {
  const org = useOrg();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PosCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await findCustomers({ q });
      if (my !== seq.current) return;
      setRows(r.ok ? r.data : []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  if (value)
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <UserRound className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-medium">{value.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {value.phone || "No phone"}
            {value.balance > 0 && <span className="text-warning-foreground dark:text-warning"> · Due {org.money(value.balance)}</span>}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Remove customer" onClick={() => onChange(null)}>
          <X />
        </Button>
      </div>
    );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start text-muted-foreground">
            <UserRound /> Walk-in customer <span className="ml-auto text-xs">Add customer</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={q} onValueChange={setQ} placeholder="Name, phone or GSTIN…" />
            <CommandList>
              {loading && !rows.length ? <div className="flex justify-center p-3"><Spinner /></div> : <CommandEmpty>No customers found.</CommandEmpty>}
              <CommandGroup>
                {rows.map((c) => (
                  <CommandItem key={c.id} value={c.id} onSelect={() => { onChange(c); setOpen(false); }}>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.phone}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {org.can("parties:write") && (
                <CommandGroup>
                  <CommandItem onSelect={() => { setOpen(false); setCreating(true); }}>
                    <Plus /> New customer{q && ` “${q}”`}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <QuickCustomerDialog open={creating} onOpenChange={setCreating} initialName={q} onCreated={(c) => { onChange(c); setCreating(false); }} />
    </>
  );
}

function QuickCustomerDialog({ open, onOpenChange, initialName, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; initialName: string; onCreated: (c: PosCustomer) => void }) {
  const org = useOrg();
  const { run, pending, fieldErrors } = useAction(quickAddCustomer);
  const [stateCode, setStateCode] = useState("");
  const isPhone = /^[+\d][\d\s-]{5,}$/.test(initialName);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              { kind: "customer", name: String(f.get("name")), phone: String(f.get("phone")), email: "", taxId: String(f.get("taxId") ?? ""), stateCode, address: {}, creditLimit: 0, openingBalance: 0, notes: "" },
              { success: "Customer added", onSuccess: onCreated },
            );
          }}
        >
          <FieldGroup>
            <FormField label="Name" error={fieldErrors.name}>
              <Input name="name" required defaultValue={isPhone ? "" : initialName} autoFocus maxLength={200} />
            </FormField>
            <FormField label="Phone" optional error={fieldErrors.phone}>
              <Input name="phone" type="tel" defaultValue={isPhone ? initialName : ""} maxLength={20} />
            </FormField>
            {org.taxMode === "GST" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="GSTIN" optional>
                  <Input name="taxId" maxLength={15} className="uppercase" />
                </FormField>
                <FormField label="State" optional description="For inter-state (IGST) billing">
                  <SelectField value={stateCode} onValueChange={setStateCode} options={INDIAN_STATES} placeholder="Same as business" />
                </FormField>
              </div>
            )}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />} Add customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
