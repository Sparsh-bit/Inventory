"use client";
import { useEffect, useState } from "react";
import { availableSerials } from "@/server/actions/products";
import type { VariantHit } from "@/server/services/products";
import { SerialInput } from "@/components/serials/serial-input";
import { useScanner } from "@/components/scanner/use-scanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Choose which serial-numbered units are being sold (scan, type, or pick from stock). */
export function SerialDialog({ hit, locationId, initial, onDone, onClose }: { hit: VariantHit; locationId: string; initial: string[]; onDone: (serials: string[]) => void; onClose: () => void }) {
  const [serials, setSerials] = useState(initial);
  const [stock, setStock] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    availableSerials({ variantId: hit.variantId, locationId }).then((r) => alive && r.ok && setStock(r.data));
    return () => {
      alive = false;
    };
  }, [hit.variantId, locationId]);
  useScanner((code) => setSerials((s) => (s.includes(code) ? s : [...s, code])));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Serial numbers</DialogTitle>
          <DialogDescription>{hit.name}{hit.variantName && ` · ${hit.variantName}`} — scan or pick each unit being sold.</DialogDescription>
        </DialogHeader>
        <SerialInput label="Serial numbers" value={serials} onChange={setSerials} suggestions={stock} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onDone(serials)} disabled={!serials.length}>Use {serials.length} unit{serials.length === 1 ? "" : "s"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
