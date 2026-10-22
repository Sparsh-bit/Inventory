"use client";
import { useEffect, useState } from "react";
import { Minus, Package, Plus, Trash2 } from "lucide-react";
import { formatQty } from "@/lib/format";
import { fromMinor, toMinor } from "@/lib/money";
import { listBatches } from "@/server/actions/sales";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CartLine } from "./types";

export function CartLineRow({ line, total, locationId, allowNegative, onChange, onRemove }: { line: CartLine; total: number; locationId: string; allowNegative: boolean; onChange: (patch: Partial<CartLine>) => void; onRemove: () => void }) {
  const org = useOrg();
  const { hit } = line;
  const step = hit.scale; // one whole unit
  const short = !allowNegative && line.qty > hit.stock;
  return (
    <li className="group flex gap-3 px-3 py-2.5">
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {hit.image ? <img src={hit.image} alt="" className="size-full object-cover" /> : <Package className="size-4 text-muted-foreground" />}
      </span>
      <div className="min-w-0 flex-1">
        <LineEditor line={line} locationId={locationId} onChange={onChange} onRemove={onRemove}>
          <button type="button" className="block w-full min-w-0 text-left">
            <span className="block truncate text-sm font-medium leading-tight">
              {hit.name}
              {hit.variantName && <span className="text-muted-foreground"> · {hit.variantName}</span>}
            </span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {org.money(line.unitPrice)} / {hit.unit}
              {line.discount > 0 && <span className="text-success"> · −{org.money(line.discount)}</span>}
            </span>
          </button>
        </LineEditor>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Button variant="outline" size="icon-xs" aria-label={`Decrease ${hit.name}`} onClick={() => (line.qty - step <= 0 ? onRemove() : onChange({ qty: line.qty - step }))}>
            <Minus />
          </Button>
          <QtyInput key={line.qty} qty={line.qty} scale={hit.scale} onChange={(qty) => onChange({ qty })} label={`Quantity of ${hit.name}`} />
          <Button variant="outline" size="icon-xs" aria-label={`Increase ${hit.name}`} onClick={() => onChange({ qty: line.qty + step })}>
            <Plus />
          </Button>
          <span className="text-xs text-muted-foreground">{hit.unit}</span>
          {short && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">Only {formatQty(hit.stock, hit.scale)}</Badge>}
        </div>
      </div>
      <div className="flex flex-col items-end justify-between">
        <span className="text-sm font-semibold tabular-nums">{org.money(total)}</span>
        <Button variant="ghost" size="icon-xs" aria-label={`Remove ${hit.name}`} onClick={onRemove} className="text-muted-foreground opacity-60 group-hover:opacity-100">
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function QtyInput({ qty, scale, onChange, label }: { qty: number; scale: number; onChange: (q: number) => void; label: string }) {
  const [text, setText] = useState(formatQty(qty, scale));
  return (
    <Input
      aria-label={label}
      inputMode={scale === 1 ? "numeric" : "decimal"}
      className="h-6 w-14 px-1 text-center text-sm tabular-nums"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        const n = Math.round(Number(text.replace(",", ".")) * scale);
        if (Number.isFinite(n) && n > 0 && n <= 1e9) onChange(n);
        else setText(formatQty(qty, scale));
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function LineEditor({ line, locationId, onChange, onRemove, children }: { line: CartLine; locationId: string; onChange: (p: Partial<CartLine>) => void; onRemove: () => void; children: React.ReactNode }) {
  const org = useOrg();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(fromMinor(line.unitPrice));
  const [discount, setDiscount] = useState(line.discount ? fromMinor(line.discount) : "");
  const [batches, setBatches] = useState<{ id: string; batchNo: string; expiry: string | null; qty: number }[] | null>(null);
  const canPrice = org.can("price:override");

  useEffect(() => {
    if (!open || !line.hit.trackBatch || batches) return;
    listBatches({ variantId: line.hit.variantId, locationId }).then((r) => setBatches(r.ok ? r.data.filter((b) => b.qty > 0) : []));
  }, [open, line.hit.trackBatch, line.hit.variantId, locationId, batches]);

  function apply() {
    try {
      const patch: Partial<CartLine> = { discount: discount.trim() ? toMinor(discount) : 0 };
      if (canPrice) patch.unitPrice = toMinor(price);
      onChange(patch);
      setOpen(false);
    } catch {
      /* invalid number: keep the editor open */
    }
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setPrice(fromMinor(line.unitPrice)); setDiscount(line.discount ? fromMinor(line.discount) : ""); } }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <p className="text-sm font-medium">{line.hit.name}</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); apply(); }}>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`p-${line.key}`} className="text-xs">Price / {line.hit.unit}</Label>
              <Input id={`p-${line.key}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!canPrice} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`d-${line.key}`} className="text-xs">Discount (amount)</Label>
              <Input id={`d-${line.key}`} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" autoFocus />
            </div>
          </div>
          {line.hit.trackBatch && (
            <div className="space-y-1">
              <Label className="text-xs">Batch</Label>
              <SelectField
                aria-label="Batch"
                value={line.batchId ?? "auto"}
                onValueChange={(v) => onChange({ batchId: v === "auto" ? null : v })}
                options={[["auto", "Auto (earliest expiry first)"], ...(batches ?? []).map((b) => [b.id, `${b.batchNo}${b.expiry ? ` · exp ${b.expiry}` : ""} · ${formatQty(b.qty, line.hit.scale)} left`] as const)]}
              />
            </div>
          )}
          {line.hit.mrp > 0 && <p className="text-xs text-muted-foreground">MRP {org.money(line.hit.mrp)} · Stock {formatQty(line.hit.stock, line.hit.scale)} {line.hit.unit}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => { onRemove(); setOpen(false); }}>
              <Trash2 /> Remove
            </Button>
            <Button type="submit" size="sm" className="flex-1">Apply</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
