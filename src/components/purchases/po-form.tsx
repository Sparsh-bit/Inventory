"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { dayIn } from "@/lib/dates";
import { formatQty } from "@/lib/format";
import { fromMinor, toMinor } from "@/lib/money";
import { purchaseLineValue } from "@/lib/purchase";
import { lookupCode } from "@/server/actions/products";
import { savePO, savePurchaseBill } from "@/server/actions/purchases";
import type { VariantHit } from "@/server/services/products";
import { FormField } from "@/components/app/form-field";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { ProductPicker } from "@/components/products/product-picker";
import { CameraScanButton } from "@/components/scanner/scan-tools";
import { scanFeedback, useScanner } from "@/components/scanner/use-scanner";
import { SerialInput } from "@/components/serials/serial-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentsField, type Attachment } from "./attachments";
import { QuickProductDialog } from "./quick-product";

interface Line {
  variantId: string;
  name: string;
  sku: string;
  unit: string;
  scale: number;
  qty: string;
  cost: string;
  rateBp?: number;
  trackBatch?: boolean;
  trackSerial?: boolean;
  batchNo?: string;
  expiry?: string;
  serials?: string[];
}

export interface PoFormProps {
  suppliers: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  initial?: { id: string; supplierId: string; locationId: string; expectedDate: string | null; supplierInvoiceNo: string; notes: string; lines: Line[] };
  /** "bill": goods already here; save the supplier's bill, payment and photos in one step. */
  mode?: "order" | "bill";
  defaultSupplierId?: string;
}

const safeMinor = (v: string) => {
  try {
    return v.trim() ? toMinor(v) : 0;
  } catch {
    return NaN;
  }
};

export function PoForm({ suppliers, locations, initial, mode = "order", defaultSupplierId }: PoFormProps) {
  const org = useOrg();
  const router = useRouter();
  const order = useAction(savePO);
  const billAction = useAction(savePurchaseBill);
  const pending = order.pending || billAction.pending;
  const isBill = mode === "bill";
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? (suppliers.some((s) => s.id === defaultSupplierId) ? defaultSupplierId! : ""));
  const [locationId, setLocationId] = useState(initial?.locationId ?? locations[0]?.id ?? "");
  const [expectedDate, setExpectedDate] = useState(initial?.expectedDate ?? "");
  const [billDate, setBillDate] = useState(() => dayIn(org.timezone));
  const [invoiceNo, setInvoiceNo] = useState(initial?.supplierInvoiceNo ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? []);
  const [newProduct, setNewProduct] = useState<{ code: string } | null>(null);
  const [payMode, setPayMode] = useState<"full" | "part" | "none">("full");
  const [paidNow, setPaidNow] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const setLine = (variantId: string, patch: Partial<Line>) => setLines((ls) => ls.map((x) => (x.variantId === variantId ? { ...x, ...patch } : x)));

  const add = (h: VariantHit) =>
    setLines((ls) =>
      ls.some((l) => l.variantId === h.variantId)
        ? ls.map((l) => (l.variantId === h.variantId ? { ...l, qty: String(Number(l.qty || 0) + 1) } : l))
        : [...ls, {
            variantId: h.variantId, name: [h.name, h.variantName].filter(Boolean).join(" - "), sku: h.sku, unit: h.unit, scale: h.scale, qty: "1",
            cost: h.costPrice ? fromMinor(h.costPrice) : "", rateBp: h.rateBp + h.cessBp, trackBatch: h.trackBatch, trackSerial: h.trackSerial, batchNo: "", expiry: "", serials: [],
          }],
    );

  const onCode = async (code: string) => {
    const r = await lookupCode({ code }).catch(() => null);
    if (r?.ok && r.data) {
      scanFeedback(true);
      add(r.data);
    } else {
      scanFeedback(false);
      toast.error(`No product with code ${code}`, { action: { label: "Create product", onClick: () => setNewProduct({ code }) } });
    }
  };
  useScanner(onCode, !newProduct);

  const qtyOf = (l: Line) => (l.trackSerial && isBill ? (l.serials?.length ?? 0) : Math.round(Number(l.qty) * l.scale));
  const lineAmount = (l: Line) => {
    const c = safeMinor(l.cost || "0");
    const q = qtyOf(l);
    return Number.isFinite(c) && Number.isFinite(q) ? Math.round((c * q) / l.scale) : 0;
  };
  const subtotal = lines.reduce((a, l) => a + lineAmount(l), 0);
  const withTax = lines.reduce((a, l) => {
    const c = safeMinor(l.cost || "0");
    const q = qtyOf(l);
    return a + (Number.isFinite(c) && Number.isFinite(q) && q > 0 ? purchaseLineValue(q, c, l.scale, l.rateBp ?? 0) : 0);
  }, 0);

  function submit() {
    if (!supplierId) return toast.error("Choose a supplier");
    if (!lines.length) return toast.error("Add at least one item");
    let payload;
    try {
      payload = lines.map((l) => {
        const qty = qtyOf(l);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(l.trackSerial && isBill ? `Scan or type the serial numbers of ${l.name}` : `Enter a quantity for ${l.name}`);
        if (isBill && l.trackBatch && !l.batchNo?.trim()) throw new Error(`Enter the batch number of ${l.name}`);
        return {
          variantId: l.variantId, qty, unitCost: toMinor(l.cost || "0"),
          ...(isBill && l.trackBatch ? { batchNo: l.batchNo!.trim(), expiry: l.expiry || null } : {}),
          ...(isBill && l.trackSerial ? { serials: l.serials } : {}),
        };
      });
    } catch (e) {
      return toast.error((e as Error).message.startsWith("Invalid amount") ? "Enter costs like 120 or 99.50" : (e as Error).message);
    }
    const base = { supplierId, locationId, expectedDate: isBill ? null : expectedDate || null, supplierInvoiceNo: invoiceNo, notes };
    if (!isBill) {
      return order.run(
        { id: initial?.id ?? null, data: { ...base, lines: payload } },
        { success: initial ? "Purchase order updated" : "Purchase order created", onSuccess: (r) => { router.push(`/purchases/${r.id}`); router.refresh(); } },
      );
    }
    const part = safeMinor(paidNow);
    if (payMode === "part" && (!Number.isFinite(part) || part <= 0)) return toast.error("Enter how much you paid, like 5000");
    if (payMode === "part" && part > withTax) return toast.error(`The bill comes to ${org.money(withTax)}; you can't pay more than that against it`);
    billAction.run(
      {
        ...base, billDate, lines: payload, attachments: files,
        paid: payMode === "none" ? null : { amount: payMode === "full" ? "full" : part, method: payMethod as "cash", reference: payRef },
      },
      {
        onSuccess: (r) => {
          toast.success(`Purchase bill ${r.number} saved`, { description: r.paid > 0 ? `Stock added · ${org.money(r.paid)} paid` : "Stock added · unpaid, it's on the supplier's khata" });
          router.push(`/purchases/${r.id}`);
          router.refresh();
        },
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <ProductPicker onPick={add} placeholder={isBill ? "Search or scan the items on the bill…" : "Search or scan products to order…"} />
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
            onCreated={(l) => setLines((ls) => [...ls, { ...l, qty: "1", rateBp: 0, trackBatch: false, trackSerial: false, batchNo: "", expiry: "", serials: [] }])}
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
                {lines.map((l) => (
                  <TableRow key={l.variantId} className="align-top">
                    <TableCell className="whitespace-normal">
                      <span className="block max-w-64 truncate">{l.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{l.sku}</span>
                      {isBill && l.trackBatch && (
                        <div className="mt-2 grid max-w-72 grid-cols-2 gap-2">
                          <Input aria-label={`Batch number of ${l.name}`} placeholder="Batch no." value={l.batchNo} onChange={(e) => setLine(l.variantId, { batchNo: e.target.value })} maxLength={40} />
                          <Input aria-label={`Expiry of ${l.name}`} type="date" value={l.expiry} onChange={(e) => setLine(l.variantId, { expiry: e.target.value })} />
                        </div>
                      )}
                      {isBill && l.trackSerial && (
                        <div className="mt-2 max-w-80">
                          <SerialInput label={`Serial numbers of ${l.name}`} value={l.serials ?? []} onChange={(serials) => setLine(l.variantId, { serials, qty: String(serials.length) })} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input aria-label={`Quantity of ${l.name}`} inputMode="decimal" value={l.qty} disabled={isBill && l.trackSerial} onChange={(e) => setLine(l.variantId, { qty: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Input aria-label={`Unit cost of ${l.name}`} inputMode="decimal" value={l.cost} placeholder="0.00" onChange={(e) => setLine(l.variantId, { cost: e.target.value })} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{org.money(lineAmount(l))}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))}>
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
              <FormField label={isBill ? "Stock goes to" : "Deliver to"}>
                <SelectField value={locationId} onValueChange={setLocationId} options={locations.map((l) => [l.id, l.name] as const)} />
              </FormField>
              {isBill ? (
                <FormField label="Bill date">
                  <Input type="date" value={billDate} max={dayIn(org.timezone)} onChange={(e) => setBillDate(e.target.value)} required />
                </FormField>
              ) : (
                <FormField label="Expected on" optional>
                  <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
                </FormField>
              )}
              <FormField label="Supplier bill no." optional>
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} maxLength={60} />
              </FormField>
              <FormField label="Notes" optional>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
              </FormField>
            </FieldGroup>
          </CardContent>
        </Card>
        {isBill && (
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Paid now">
                {([["full", "Paid in full"], ["part", "Part paid"], ["none", "Not paid"]] as const).map(([k, label]) => (
                  <Button key={k} type="button" size="sm" variant={payMode === k ? "secondary" : "outline"} role="radio" aria-checked={payMode === k} onClick={() => setPayMode(k)}>
                    {label}
                  </Button>
                ))}
              </div>
              {payMode === "part" && (
                <FormField label="Amount paid now">
                  <Input inputMode="decimal" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} placeholder="0.00" />
                </FormField>
              )}
              {payMode !== "none" && (
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Method">
                    <SelectField value={payMethod} onValueChange={setPayMethod} options={[["cash", "Cash"], ["upi", "UPI"], ["bank", "Bank transfer"], ["card", "Card"], ["other", "Other"]]} />
                  </FormField>
                  <FormField label="Reference" optional>
                    <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} maxLength={100} placeholder="UTR, cheque…" />
                  </FormField>
                </div>
              )}
              {payMode === "none" && <p className="text-xs text-muted-foreground">The full bill goes on the supplier&apos;s khata. Pay it later from the supplier page.</p>}
            </CardContent>
          </Card>
        )}
        {isBill && (
          <Card>
            <CardHeader>
              <CardTitle>Bill photo or PDF</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentsField value={files} onAdd={(f) => setFiles((x) => [...x, ...f])} onRemove={(a) => setFiles((x) => x.filter((y) => y.url !== a.url))} disabled={pending} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{lines.length} items · {formatQty(lines.reduce((a, l) => a + (Number(l.qty) || 0), 0))} units</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Before tax</span>
              <span className="tabular-nums">{org.money(subtotal)}</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-sm">{isBill ? "Bill total (incl. tax)" : "Total (incl. tax)"}</span>
              <span className="text-2xl font-semibold tabular-nums">{org.money(withTax)}</span>
            </div>
            {isBill && payMode !== "none" && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Due after this</span>
                <span className="tabular-nums">{org.money(Math.max(0, withTax - (payMode === "full" ? withTax : safeMinor(paidNow) || 0)))}</span>
              </div>
            )}
            <Button className="w-full" size="lg" onClick={submit} disabled={pending}>
              {pending && <Spinner />} {isBill ? "Save purchase bill" : initial ? "Save changes" : "Create purchase order"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
