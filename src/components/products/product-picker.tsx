"use client";
import { useState } from "react";
import { Package, Search } from "lucide-react";
import { formatQty } from "@/lib/format";
import { searchProducts } from "@/server/actions/products";
import type { VariantHit } from "@/server/services/products";
import { useOrg } from "@/components/app/org-context";
import { useSearch } from "@/components/app/use-search";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";

/** Search-as-you-type product variant picker. */
export function ProductPicker({ onPick, locationId, placeholder = "Search products to add…", autoFocus }: { onPick: (hit: VariantHit) => void; locationId?: string; placeholder?: string; autoFocus?: boolean }) {
  const org = useOrg();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data, loading } = useSearch(open ? `${q}|${locationId ?? ""}` : null, async () => {
    const res = await searchProducts({ q, locationId });
    return res.ok ? res.data : [];
  });
  const hits = data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false} className="overflow-visible bg-transparent">
        <PopoverAnchor asChild>
          <div className="rounded-lg border bg-background">
            <CommandInput value={q} onValueChange={(v) => { setQ(v); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} autoFocus={autoFocus} />
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()} onInteractOutside={(e) => { if ((e.target as HTMLElement).closest("[cmdk-input]")) e.preventDefault(); }}>
          <CommandList className="max-h-80">
            {loading && hits.length === 0 ? (
              <div className="flex justify-center p-4"><Spinner /></div>
            ) : (
              <CommandEmpty>
                <span className="flex flex-col items-center gap-1"><Search className="size-4" /> No products found</span>
              </CommandEmpty>
            )}
            <CommandGroup>
              {hits.map((h) => (
                <CommandItem key={h.variantId} value={h.variantId} onSelect={() => { onPick(h); setQ(""); setOpen(false); }} className="gap-3">
                  <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {h.image ? <img src={h.image} alt="" className="size-full object-cover" /> : <Package className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{h.name}{h.variantName && <span className="text-muted-foreground"> · {h.variantName}</span>}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{h.sku} · {h.barcode}</span>
                  </span>
                  <span className="text-right text-xs">
                    <span className="block tabular-nums font-medium">{org.money(h.salePrice)}</span>
                    <span className={`block tabular-nums ${h.stock <= 0 ? "text-destructive" : "text-muted-foreground"}`}>{formatQty(h.stock, h.scale)} {h.unit}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}
