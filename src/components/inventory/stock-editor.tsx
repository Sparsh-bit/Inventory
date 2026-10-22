"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatQty } from "@/lib/format";
import { variantBatches, adjust, count, transfer } from "@/server/actions/inventory";
import { availableSerials, lookupCode } from "@/server/actions/products";
import type { VariantHit } from "@/server/services/products";
import { FormField } from "@/components/app/form-field";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { ProductPicker } from "@/components/products/product-picker";
import { CameraScanButton } from "@/components/scanner/scan-tools";
import { SerialInput } from "@/components/serials/serial-input";
import { scanFeedback, useScanner } from "@/components/scanner/use-scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Mode = "adjust" | "transfer" | "count";
interface Row {
  key: string;
  hit: VariantHit;
  qty: string;
  sign: "+" | "-";
  batchId: string | null;
  batches: { id: string; batchNo: string; expiry: string | null; qty: number }[] | null;
  serials: string[];
  stockSerials: string[];
}

const REASONS = ["Damaged", "Expired", "Lost / theft", "Found extra", "Internal use", "Sample / gift", "Correction"];

export function StockEditor({ mode, locations }: { mode: Mode; locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [toId, setToId] = useState(locations[1]?.id ?? "");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [activeSerialRow, setActiveSerialRow] = useState<string | null>(null);
  const a = useAction(adjust);
  const t = useAction(transfer);
  const c = useAction(count);
  const pending = a.pending || t.pending || c.pending;

  async function addHit(hit: VariantHit) {
    if (hit.trackSerial) {
      const existing = rows.find((r) => r.hit.variantId === hit.variantId);
      if (existing) {
        if (hit.serial && !existing.serials.includes(hit.serial)) setRows((rs) => rs.map((r) => (r.key === existing.key ? { ...r, serials: [...r.serials, hit.serial!], qty: String(r.serials.length + 1) } : r)));
        setActiveSerialRow(existing.key);
        return;
      }
      const stockSerials = await availableSerials({ variantId: hit.variantId, locationId }).then((r) => (r.ok ? r.data : []));
      const key = crypto.randomUUID();
      setRows((rs) => [{ key, hit, qty: hit.serial ? "1" : "", sign: "-", batchId: null, batches: null, serials: hit.serial ? [hit.serial] : [], stockSerials }, ...rs]);
      setActiveSerialRow(key);
      return;
    }
    if (mode === "count") {
      const existing = rows.find((r) => r.hit.variantId === hit.variantId && !hit.trackBatch);
      if (existing) {
        setRows((rs) => rs.map((r) => (r.key === existing.key ? { ...r, qty: formatQty(Math.round(Number(r.qty || 0) * hit.scale) + hit.scale, hit.scale) } : r)));
        return;
      }
    }
    const batches = hit.trackBatch ? await variantBatches({ variantId: hit.variantId, locationId }).then((r) => (r.ok ? r.data : [])) : null;
    setRows((rs) => [{ key: crypto.randomUUID(), hit, qty: mode === "count" ? "1" : "", sign: "-", batchId: batches?.[0]?.id ?? null, batches, serials: [], stockSerials: [] }, ...rs]);
  }

  const onCode = async (code: string) => {
    const r = await lookupCode({ code, locationId });
    if (r.ok && r.data) {
      scanFeedback(true);
      void addHit(r.data);
    } else if (activeSerialRow && rows.some((x) => x.key === activeSerialRow)) {
      // Unknown code while a serial box is active: treat it as a new serial (e.g. adding stock).
      scanFeedback(true);
      setRows((rs) => rs.map((x) => (x.key === activeSerialRow && !x.serials.includes(code) ? { ...x, serials: [...x.serials, code], qty: String(x.serials.length + 1) } : x)));
    } else {
      scanFeedback(false);
      toast.error(`No product with code ${code}`);
    }
  };
  useScanner(onCode);

  function submit() {
    try {
      const parsed = rows.map((r) => {
        const q = r.hit.trackSerial ? r.serials.length : Math.round(Number(r.qty) * r.hit.scale);
        if (!Number.isFinite(q) || q < 0 || (mode !== "count" && q === 0)) throw new Error(r.hit.trackSerial ? `Add serial numbers for ${r.hit.name}` : `Enter a quantity for ${r.hit.name}`);
        if (r.hit.trackBatch && !r.batchId) throw new Error(`Choose a batch for ${r.hit.name}`);
        return { r, q };
      });
      if (!parsed.length) return toast.error("Add at least one product");
      const done = { onSuccess: () => { setRows([]); router.refresh(); } };
      if (mode === "adjust")
        a.run({ locationId, reason: note ? `${reason}: ${note}` : reason, lines: parsed.map(({ r, q }) => ({ variantId: r.hit.variantId, batchId: r.batchId, qtyDelta: r.sign === "-" ? -q : q, ...(r.hit.trackSerial ? { serials: r.serials } : {}) })) }, { success: "Stock adjusted", ...done });
      else if (mode === "transfer")
        t.run({ fromId: locationId, toId, note, lines: parsed.map(({ r, q }) => ({ variantId: r.hit.variantId, batchId: r.batchId, qty: q, ...(r.hit.trackSerial ? { serials: r.serials } : {}) })) }, { success: "Stock transferred", ...done });
      else
        c.run({ locationId, lines: parsed.map(({ r, q }) => ({ variantId: r.hit.variantId, batchId: r.batchId, counted: q, ...(r.hit.trackSerial ? { serials: r.serials } : {}) })) }, { success: "Stock count posted", ...done });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex gap-2">
            <div className="flex-1"><ProductPicker onPick={addHit} locationId={locationId} placeholder="Search or scan a product…" /></div>
            <CameraScanButton onScan={onCode} />
          </div>
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {mode === "count" ? "Scan each item as you count it — every scan adds 1." : "Search or scan the products to include."}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {rows.map((r) => {
                const batch = r.batches?.find((b) => b.id === r.batchId);
                const systemQty = batch ? batch.qty : r.hit.stock;
                const counted = Math.round(Number(r.qty || 0) * r.hit.scale);
                return (
                  <li key={r.key} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.hit.name}{r.hit.variantName && <span className="text-muted-foreground"> · {r.hit.variantName}</span>}</p>
                      <p className="text-xs text-muted-foreground">
                        In stock: {formatQty(systemQty, r.hit.scale)} {r.hit.unit}
                        {mode === "count" && r.qty !== "" && counted !== systemQty && (
                          <span className={counted > systemQty ? "text-success" : "text-destructive"}> · difference {counted > systemQty ? "+" : ""}{formatQty(counted - systemQty, r.hit.scale)}</span>
                        )}
                      </p>
                    </div>
                    {r.batches && (
                      <SelectField aria-label="Batch" className="w-44" value={r.batchId ?? ""} onValueChange={(v) => set(r.key, { batchId: v })} placeholder="Batch" options={r.batches.map((b) => [b.id, `${b.batchNo} (${formatQty(b.qty, r.hit.scale)})`] as const)} />
                    )}
                    {mode === "adjust" && (
                      <ToggleGroup type="single" variant="outline" size="sm" value={r.sign} onValueChange={(v) => v && set(r.key, { sign: v as "+" | "-" })} aria-label="Add or remove">
                        <ToggleGroupItem value="-" aria-label="Remove stock">−</ToggleGroupItem>
                        <ToggleGroupItem value="+" aria-label="Add stock">+</ToggleGroupItem>
                      </ToggleGroup>
                    )}
                    {r.hit.trackSerial ? (
                      <div className="w-full sm:w-auto sm:min-w-72 sm:flex-1" onClick={() => setActiveSerialRow(r.key)}>
                        <SerialInput
                          label={`Serial numbers for ${r.hit.name}`}
                          value={r.serials}
                          onFocus={() => setActiveSerialRow(r.key)}
                          onChange={(serials) => set(r.key, { serials, qty: String(serials.length) })}
                          suggestions={mode === "adjust" && r.sign === "+" ? [] : r.stockSerials}
                        />
                      </div>
                    ) : (
                      <Input aria-label={`${mode === "count" ? "Counted" : "Quantity"} for ${r.hit.name}`} className="w-24" inputMode="decimal" placeholder={mode === "count" ? "Counted" : "Qty"} value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} />
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.hit.name}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 /></Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            <FormField label={mode === "transfer" ? "From" : "Location"}>
              <SelectField value={locationId} onValueChange={(v) => { if (rows.length) return void toast.error("Clear the list before changing location."); setLocationId(v); }} options={locations.map((l) => [l.id, l.name] as const)} />
            </FormField>
            {mode === "transfer" && (
              <FormField label="To">
                <SelectField value={toId} onValueChange={setToId} options={locations.filter((l) => l.id !== locationId).map((l) => [l.id, l.name] as const)} placeholder="Choose destination" />
              </FormField>
            )}
            {mode === "adjust" && (
              <FormField label="Reason">
                <SelectField value={reason} onValueChange={setReason} options={REASONS.map((r) => [r, r] as const)} />
              </FormField>
            )}
            {mode !== "count" && (
              <FormField label="Note" optional>
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={150} />
              </FormField>
            )}
            {mode === "count" && <p className="text-sm text-muted-foreground">Only the items in the list are updated. Their stock is set to the counted quantity and the difference is recorded.</p>}
            <Button size="lg" onClick={submit} disabled={pending || !rows.length || (mode === "transfer" && (!toId || toId === locationId))}>
              {pending && <Spinner />} {mode === "adjust" ? "Save adjustment" : mode === "transfer" ? "Transfer stock" : "Post count"}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
