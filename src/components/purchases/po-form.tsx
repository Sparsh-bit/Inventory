"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatQty } from "@/lib/format";
import { fromMinor, toMinor } from "@/lib/money";
import { lookupCode } from "@/server/actions/products";
import { savePO } from "@/server/actions/purchases";
import type { VariantHit } from "@/server/services/products";
import { FormField } from "@/components/app/form-field";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { ProductPicker } from "@/components/products/product-picker";
import { QuickProductDialog } from "./quick-product";
import { CameraScanButton } from "@/components/scanner/scan-tools";
import { scanFeedback, useScanner } from "@/components/scanner/use-scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface Line {
  variantId: string;
  name: string;
  sku: string;
  unit: string;
  scale: number;
  qty: string;
  cost: string;
}

export interface PoFormProps {
  suppliers: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  initial?: { id: string; supplierId: string; locationId: string; expectedDate: string | null; supplierInvoiceNo: string; notes: string; lines: Line[] };
}

export function PoForm({ suppliers, locations, initial }: PoFormProps) {
  const org = useOrg();
  const router = useRouter();
  const { run, pending } = useAction(savePO);
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [locationId, setLocationId] = useState(initial?.locationId ?? locations[0]?.id ?? "");
  const [expectedDate, setExpectedDate] = useState(initial?.expectedDate ?? "");
  const [invoiceNo, setInvoiceNo] = useState(initial?.supplierInvoiceNo ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? []);
  const [newProduct, setNewProduct] = useState<{ code: string } | null>(null);

  const add = (h: VariantHit) =>
    setLines((ls) =>
      ls.some((l) => l.variantId === h.variantId)
        ? ls.map((l) => (l.variantId === h.variantId ? { ...l, qty: String(Number(l.qty || 0) + 1) } : l))
        : [...ls, { variantId: h.variantId, name: [h.name, h.variantName].filter(Boolean).join(" - "), sku: h.sku, unit: h.unit, scale: h.scale, qty: "1", cost: h.costPrice ? fromMinor(h.costPrice) : "" }],
    );

  const onCode = async (code: string) => {
    const r = await lookupCode({ code });
    if (r.ok && r.data) {
      scanFeedback(true);
      add(r.data);
    } else {
      scanFeedback(false);
      toast.error(`No product with code ${code}`, { action: { label: "Create product", onClick: () => setNewProduct({ code }) } });
    }
  };
  useScanner(onCode, !newProduct);

  const total = lines.reduce((a, l) => {
    try {
      return a + Math.round((toMinor(l.cost || "0") * Number(l.qty || 0)));
    } catch {
      return a;
    }
  }, 0);

  function submit() {
    if (!supplierId) return toast.error("Choose a supplier");
    if (!lines.length) return toast.error("Add at least one item");
    let payload;
    try {
      payload = lines.map((l) => {
        const qty = Math.round(Number(l.qty) * l.scale);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Enter a quantity for ${l.name}`);
        return { variantId: l.variantId, qty, unitCost: toMinor(l.cost || "0") };
      });
    } catch (e) {
      return toast.error((e as Error).message.startsWith("Invalid amount") ? "Enter costs like 120 or 99.50" : (e as Error).message);
    }
    run(
      { id: initial?.id ?? null, data: { supplierId, locationId, expectedDate: expectedDate || null, supplierInvoiceNo: invoiceNo, notes, lines: payload } },
      { success: initial ? "Purchase order updated" : "Purchase order created", onSuccess: (r) => { router.push(`/purchases/${r.id}`); router.refresh(); } },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <ProductPicker onPick={add} placeholder="Search or scan products to order…" />
            </div>
            <CameraScanButton onScan={onCode} />
            <Button type="button" variant="outline" onClick={() => setNewProduct({ code: "" })}>
              <PackagePlus /> <span className="hidden sm:inline">New product</span>
            </Button>
          </div>
          <QuickProductDialog
            open={!!newProduct}
            onOpenChange={(o) => !o && setNewProduct(null)}
            initialCode={newProduct?.code ?? ""}
            onCreated={(l) => setLines((ls) => [...ls, { ...l, qty: "1" }])}
          />
          {lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Search, scan, or pick products above. Buying something new? Use <span className="font-medium">New product</span>.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-32">Unit cost</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  let amt = 0;
                  try {
                    amt = Math.round(toMinor(l.cost || "0") * Number(l.qty || 0));
                  } catch {}
                  return (
                    <TableRow key={l.variantId}>
                      <TableCell>
                        <span className="block max-w-64 truncate">{l.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{l.sku}</span>
                      </TableCell>
                      <TableCell>
                        <Input aria-label={`Quantity of ${l.name}`} inputMode="decimal" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x) => (x.variantId === l.variantId ? { ...x, qty: e.target.value } : x)))} />
                      </TableCell>
                      <TableCell>
                        <Input aria-label={`Unit cost of ${l.name}`} inputMode="decimal" value={l.cost} placeholder="0.00" onChange={(e) => setLines((ls) => ls.map((x) => (x.variantId === l.variantId ? { ...x, cost: e.target.value } : x)))} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{org.money(amt)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))}>
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <FieldGroup>
              <FormField label="Supplier">
                <SelectField value={supplierId} onValueChange={setSupplierId} options={suppliers.map((s) => [s.id, s.name] as const)} placeholder={suppliers.length ? "Choose supplier" : "Add a supplier first"} />
              </FormField>
              <FormField label="Deliver to">
                <SelectField value={locationId} onValueChange={setLocationId} options={locations.map((l) => [l.id, l.name] as const)} />
              </FormField>
              <FormField label="Expected on" optional>
                <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </FormField>
              <FormField label="Supplier bill no." optional>
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} maxLength={60} />
              </FormField>
              <FormField label="Notes" optional>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
              </FormField>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{lines.length} items · {formatQty(lines.reduce((a, l) => a + (Number(l.qty) || 0), 0))} units</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-sm">Total (before tax)</span>
              <span className="text-2xl font-semibold tabular-nums">{org.money(total)}</span>
            </div>
            <Button className="w-full" size="lg" onClick={submit} disabled={pending}>
              {pending && <Spinner />} {initial ? "Save changes" : "Create purchase order"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
