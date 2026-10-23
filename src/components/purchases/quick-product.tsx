"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { toMinor } from "@/lib/money";
import { listTaxRates, saveProduct } from "@/server/actions/products";
import { FormField } from "@/components/app/form-field";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { BarcodeInput, UNITS } from "@/components/products/product-form";
import { useScanner } from "@/components/scanner/use-scanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export interface NewProductLine {
  variantId: string;
  name: string;
  sku: string;
  unit: string;
  scale: number;
  cost: string;
}

/** Add a product that isn't in the catalogue yet, right from a purchase order. */
export function QuickProductDialog({ open, onOpenChange, initialCode, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; initialCode: string; onCreated: (line: NewProductLine) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>It is added to Products and to this purchase. Variants, images and batch tracking can be set later on the product page.</DialogDescription>
        </DialogHeader>
        {open && <QuickProductForm key={initialCode} initialCode={initialCode} onCreated={(l) => { onCreated(l); onOpenChange(false); }} />}
      </DialogContent>
    </Dialog>
  );
}

function QuickProductForm({ initialCode, onCreated }: { initialCode: string; onCreated: (line: NewProductLine) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [unitCode, setUnitCode] = useState("pcs");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [hsn, setHsn] = useState("");
  const [rates, setRates] = useState<{ id: string; name: string }[]>([]);
  const [taxRateId, setTaxRateId] = useState("none");
  const { run, pending } = useAction(saveProduct);
  useScanner((c) => setCode(c));

  useEffect(() => {
    let live = true;
    listTaxRates({})
      .then((r) => live && r.ok && setRates(r.data))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // the dialog sits inside the purchase form
    const unit = UNITS.find((u) => u.code === unitCode)!;
    let costMinor = 0, priceMinor = 0, mrpMinor = 0;
    try {
      costMinor = cost.trim() ? toMinor(cost) : 0;
      priceMinor = toMinor(price);
      mrpMinor = mrp.trim() ? toMinor(mrp) : 0;
    } catch {
      return toast.error("Enter prices like 120 or 99.50");
    }
    run(
      {
        id: null,
        data: {
          name, description: "", categoryId: null, brand: "", unitCode: unit.code, unitScale: unit.scale, hsn, taxRateId: taxRateId === "none" ? null : taxRateId, priceIncludesTax: true,
          trackBatch: false, trackSerial: false, warrantyMonths: 0, reorderLevel: 0, images: [], active: true,
          variants: [{ name: "", sku: "", barcodes: code.trim() ? [code.trim()] : [], attributes: [], costPrice: costMinor, salePrice: priceMinor, mrp: mrpMinor, active: true, openingQty: 0 }],
        },
      },
      {
        success: "Product added",
        onSuccess: (r) => {
          const v = (r as { variants?: { id: string; sku: string }[] }).variants?.[0];
          if (v) onCreated({ variantId: v.id, name, sku: v.sku, unit: unit.code, scale: unit.scale, cost });
        },
      },
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <FormField label="Product name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoFocus />
      </FormField>
      <FormField label="Barcode / product no." optional>
        <BarcodeInput value={code} onChange={(e) => setCode(e.target.value)} onScan={setCode} placeholder="Scan, type, or leave empty" maxLength={64} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Unit">
          <SelectField value={unitCode} onValueChange={setUnitCode} options={UNITS.map((u) => [u.code, u.label] as const)} />
        </FormField>
        <FormField label="GST / tax rate">
          <SelectField value={taxRateId} onValueChange={setTaxRateId} options={[["none", "No tax"], ...rates.map((r) => [r.id, r.name] as const)]} />
        </FormField>
        <FormField label="Purchase cost">
          <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
        </FormField>
        <FormField label="Selling price">
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" required />
        </FormField>
        <FormField label="MRP" optional>
          <Input inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="0.00" />
        </FormField>
        <FormField label="HSN code" optional>
          <Input value={hsn} onChange={(e) => setHsn(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />} Add product
        </Button>
      </DialogFooter>
    </form>
  );
}
