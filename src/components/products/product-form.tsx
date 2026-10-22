"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Layers, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { fromMinor, toMinor } from "@/lib/money";
import type { ProductInput } from "@/lib/schemas";
import { saveProduct } from "@/server/actions/products";
import { FormField } from "@/components/app/form-field";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CameraScanButton } from "@/components/scanner/scan-tools";
import { useScanner } from "@/components/scanner/use-scanner";

export const UNITS: { code: string; label: string; scale: 1 | 1000 }[] = [
  { code: "pcs", label: "Pieces (pcs)", scale: 1 },
  { code: "box", label: "Box", scale: 1 },
  { code: "pack", label: "Pack", scale: 1 },
  { code: "pair", label: "Pair", scale: 1 },
  { code: "dozen", label: "Dozen", scale: 1 },
  { code: "set", label: "Set", scale: 1 },
  { code: "bottle", label: "Bottle", scale: 1 },
  { code: "strip", label: "Strip", scale: 1 },
  { code: "kg", label: "Kilogram (kg, 3 decimals)", scale: 1000 },
  { code: "l", label: "Litre (l, 3 decimals)", scale: 1000 },
  { code: "m", label: "Metre (m, 3 decimals)", scale: 1000 },
];

interface Row {
  key: string;
  id?: string;
  name: string;
  attributes: { name: string; value: string }[];
  sku: string;
  barcodes: string;
  cost: string;
  price: string;
  mrp: string;
  opening: string;
  active: boolean;
}

export interface ProductFormProps {
  product?: ProductInput & { id: string };
  categories: { id: string; name: string }[];
  taxRates: { id: string; name: string }[];
  locations: { id: string; name: string; isDefault: boolean }[];
  defaults: { priceIncludesTax: boolean; taxRateId: string | null };
  initialBarcode?: string;
}

const blankRow = (o: Partial<Row> = {}): Row => ({ key: crypto.randomUUID(), name: "", attributes: [], sku: "", barcodes: "", cost: "", price: "", mrp: "", opening: "", active: true, ...o });
const m = (v: number | undefined) => (v ? fromMinor(v) : "");

export function ProductForm({ product, categories, taxRates, locations, defaults, initialBarcode = "" }: ProductFormProps) {
  const router = useRouter();
  const org = useOrg();
  const { run, pending, fieldErrors } = useAction(saveProduct);
  const isEdit = !!product;

  const [name, setName] = useState(product?.name ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "none");
  const [taxRateId, setTaxRateId] = useState(product?.taxRateId ?? defaults.taxRateId ?? "none");
  const [inclusive, setInclusive] = useState(product?.priceIncludesTax ?? defaults.priceIncludesTax);
  const [hsn, setHsn] = useState(product?.hsn ?? "");
  const [unitCode, setUnitCode] = useState(product?.unitCode ?? "pcs");
  const [trackBatch, setTrackBatch] = useState(product?.trackBatch ?? false);
  const [trackSerial, setTrackSerial] = useState(product?.trackSerial ?? false);
  const [warranty, setWarranty] = useState(product?.warrantyMonths ? String(product.warrantyMonths) : "");
  const [reorder, setReorder] = useState(String(product?.reorderLevel ?? ""));
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [openingLocationId, setOpeningLocationId] = useState(locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const initialRows: Row[] = product
    ? product.variants.map((v) => blankRow({ id: v.id, name: v.name ?? "", attributes: v.attributes ?? [], sku: v.sku ?? "", barcodes: (v.barcodes ?? []).join(", "), cost: m(v.costPrice), price: m(v.salePrice), mrp: m(v.mrp), active: v.active ?? true }))
    : [blankRow({ barcodes: initialBarcode })];
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [hasVariants, setHasVariants] = useState(initialRows.length > 1 || !!initialRows[0].attributes.length);
  const [attrs, setAttrs] = useState<{ name: string; values: string }[]>(() => {
    if (!product || !hasVariants) return [{ name: "Size", values: "" }];
    const names = [...new Set(product.variants.flatMap((v) => (v.attributes ?? []).map((a) => a.name)))];
    return names.map((n) => ({ name: n, values: [...new Set(product.variants.map((v) => v.attributes?.find((a) => a.name === n)?.value).filter(Boolean))].join(", ") }));
  });

  const unit = UNITS.find((u) => u.code === unitCode) ?? UNITS[0];
  const err = (k: string) => fieldErrors[`data.${k}`];

  const combos = useMemo(() => {
    const lists = attrs.filter((a) => a.name.trim() && a.values.trim()).map((a) => a.values.split(",").map((v) => v.trim()).filter(Boolean).map((value) => ({ name: a.name.trim(), value })));
    if (!lists.length) return [];
    return lists.reduce<{ name: string; value: string }[][]>((acc, list) => acc.flatMap((c) => list.map((x) => [...c, x])), [[]]);
  }, [attrs]);

  function generateVariants() {
    if (!combos.length) return toast.error("Add at least one option with values, e.g. Size: S, M, L");
    if (combos.length > 100) return toast.error("That's more than 100 combinations. Use fewer values.");
    const base = rows.find((r) => r.price) ?? rows[0];
    setRows((prev) =>
      combos.map((attributes) => {
        const label = attributes.map((a) => a.value).join(" / ");
        const existing = prev.find((r) => r.name === label);
        return existing ?? blankRow({ name: label, attributes, cost: base.cost, price: base.price, mrp: base.mrp });
      }),
    );
  }

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // A scan anywhere on the form fills the first variant that has no barcode yet.
  useScanner((code) => {
    const row = rows.find((r) => !r.barcodes.trim());
    if (!row) return void toast.info("Every variant already has a barcode. Clear one to scan a new code into it.");
    setRow(row.key, { barcodes: code });
    toast.success(`Barcode ${code} added${rows.length > 1 ? ` to ${row.name || "the next variant"}` : ""}`);
  });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 6 - images.length)) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
        setImages((im) => [...im, json.url!]);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let variants;
    try {
      const qty = (s: string) => {
        if (!s.trim()) return 0;
        const n = Number(s);
        if (!Number.isFinite(n) || n < 0) throw new Error("Opening stock must be a positive number");
        return Math.round(n * unit.scale);
      };
      variants = rows.map((r, i) => {
        if (!r.price.trim()) throw new Error(hasVariants ? `Enter a selling price for ${r.name || `variant ${i + 1}`}` : "Enter a selling price");
        return {
          id: r.id, name: hasVariants ? r.name : "", attributes: hasVariants ? r.attributes : [], sku: r.sku.trim(),
          barcodes: r.barcodes.split(",").map((b) => b.trim()).filter(Boolean), costPrice: r.cost.trim() ? toMinor(r.cost) : 0,
          salePrice: toMinor(r.price), mrp: r.mrp.trim() ? toMinor(r.mrp) : 0, active: r.active, openingQty: isEdit ? 0 : qty(r.opening),
        };
      });
    } catch (e2) {
      return toast.error((e2 as Error).message.replace("Invalid amount", "Enter prices like 120 or 99.50"));
    }
    const data: ProductInput = {
      name, description, brand, categoryId: categoryId === "none" ? null : categoryId, unitCode: unit.code, unitScale: unit.scale, hsn: hsn.trim(),
      taxRateId: taxRateId === "none" ? null : taxRateId, priceIncludesTax: inclusive, trackBatch, trackSerial, warrantyMonths: Number(warranty) || 0, reorderLevel: Number(reorder) || 0, images, active: true,
      variants, openingLocationId: isEdit ? undefined : openingLocationId || undefined,
    };
    run({ id: product?.id ?? null, data }, {
      success: isEdit ? "Product updated" : "Product created",
      onSuccess: (res) => {
        router.push(`/products/${res.id}`);
        router.refresh();
      },
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <FormField label="Product name" error={err("name")}>
                <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} placeholder="e.g. Basmati Rice Premium" autoFocus={!isEdit} />
              </FormField>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Category">
                  <SelectField value={categoryId} onValueChange={setCategoryId} options={[["none", "No category"], ...categories.map((c) => [c.id, c.name] as const)]} />
                </FormField>
                <FormField label="Brand" optional>
                  <Input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={100} />
                </FormField>
              </div>
              <FormField label="Description" optional>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} />
              </FormField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing & stock</CardTitle>
            <CardDescription>Leave SKU and barcode empty to generate them automatically. Scan the product&apos;s barcode with your scanner or tap Scan to use the camera.</CardDescription>
          </CardHeader>
          <CardContent className="@container space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <Label htmlFor="has-variants" className="flex flex-col items-start gap-0.5">
                <span className="flex items-center gap-1.5">
                  <Layers className="size-4" /> This product has variants
                </span>
                <span className="text-xs font-normal text-muted-foreground">Different sizes, colours, weights… each with its own price and barcode.</span>
              </Label>
              <Switch id="has-variants" checked={hasVariants} onCheckedChange={(v) => { setHasVariants(v); if (!v) setRows((r) => [r[0]]); }} disabled={isEdit && rows.length > 1} />
            </div>

            {hasVariants && (
              <div className="space-y-3 rounded-lg bg-muted/40 p-4">
                {attrs.map((a, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-end gap-2">
                    <FormField label={i === 0 ? "Option" : " "}>
                      <Input value={a.name} onChange={(e) => setAttrs((as) => as.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Size" maxLength={40} />
                    </FormField>
                    <FormField label={i === 0 ? "Values (comma separated)" : " "}>
                      <Input value={a.values} onChange={(e) => setAttrs((as) => as.map((x, j) => (j === i ? { ...x, values: e.target.value } : x)))} placeholder="S, M, L, XL" />
                    </FormField>
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove option" onClick={() => setAttrs((as) => as.filter((_, j) => j !== i))} disabled={attrs.length === 1}>
                      <X />
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAttrs((as) => [...as, { name: "", values: "" }])} disabled={attrs.length >= 3}>
                    <Plus /> Add option
                  </Button>
                  <Button type="button" size="sm" onClick={generateVariants}>
                    Generate {combos.length || ""} variants
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={r.key} className={hasVariants ? "space-y-3 rounded-lg border p-3" : "space-y-3"}>
                  {hasVariants && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.name || `Variant ${i + 1}`}</span>
                      <div className="flex items-center gap-2">
                        {r.id && (
                          <Label className="text-xs font-normal">
                            <Switch checked={r.active} onCheckedChange={(v) => setRow(r.key, { active: v })} size="sm" /> Active
                          </Label>
                        )}
                        {!r.id && rows.length > 1 && (
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove variant" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @3xl:grid-cols-6">
                    <FormField label="Selling price" error={err(`variants.${i}.salePrice`)} className="col-span-1">
                      <Input inputMode="decimal" value={r.price} onChange={(e) => setRow(r.key, { price: e.target.value })} placeholder="0.00" required />
                    </FormField>
                    <FormField label="Cost price" className="col-span-1">
                      <Input inputMode="decimal" value={r.cost} onChange={(e) => setRow(r.key, { cost: e.target.value })} placeholder="0.00" />
                    </FormField>
                    <FormField label="MRP" className="col-span-1">
                      <Input inputMode="decimal" value={r.mrp} onChange={(e) => setRow(r.key, { mrp: e.target.value })} placeholder="0.00" />
                    </FormField>
                    <FormField label="SKU" error={err(`variants.${i}.sku`)} className="col-span-1">
                      <Input value={r.sku} onChange={(e) => setRow(r.key, { sku: e.target.value })} placeholder="Auto" maxLength={64} className="font-mono" />
                    </FormField>
                    <FormField label="Barcode" error={err(`variants.${i}.barcodes.0`)} className="col-span-2 @md:col-span-1">
                      <BarcodeInput value={r.barcodes} onChange={(e) => setRow(r.key, { barcodes: e.target.value })} onScan={(code) => setRow(r.key, { barcodes: code })} />
                    </FormField>
                    {!isEdit && (
                      <FormField label={`Opening stock (${unit.code})`} className="col-span-2 @md:col-span-1">
                        <Input inputMode="decimal" value={r.opening} onChange={(e) => setRow(r.key, { opening: e.target.value })} placeholder="0" disabled={trackBatch || trackSerial} />
                      </FormField>
                    )}
                  </div>
                  {r.price && r.cost && toMinorSafe(r.price) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Margin {Math.round(((toMinorSafe(r.price) - toMinorSafe(r.cost)) / toMinorSafe(r.price)) * 100)}% · {org.money(toMinorSafe(r.price) - toMinorSafe(r.cost))} per {unit.code}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Images</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 lg:grid-cols-3">
              {images.map((src) => (
                <div key={src} className="group relative aspect-square overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="size-full object-cover" />
                  <button type="button" onClick={() => setImages((im) => im.filter((x) => x !== src))} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-background/90 opacity-0 shadow group-hover:opacity-100 focus-visible:opacity-100" aria-label="Remove image">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {images.length < 6 && (
                <button type="button" onClick={() => fileRef.current?.click()} className="grid aspect-square place-items-center rounded-md border border-dashed text-muted-foreground hover:bg-muted" aria-label="Add image" disabled={uploading}>
                  {uploading ? <Spinner /> : <ImagePlus className="size-5" />}
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
            <p className="mt-2 text-xs text-muted-foreground">PNG, JPG or WebP up to 2 MB.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <FormField label={org.taxMode === "GST" ? "GST rate" : "Tax rate"}>
                <SelectField value={taxRateId} onValueChange={setTaxRateId} options={[["none", "No tax"], ...taxRates.map((t) => [t.id, t.name] as const)]} />
              </FormField>
              {org.taxMode === "GST" && (
                <FormField label="HSN / SAC code" optional error={err("hsn")}>
                  <Input value={hsn} onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} placeholder="e.g. 1006" />
                </FormField>
              )}
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="inclusive" className="font-normal">Selling price includes tax</Label>
                <Switch id="inclusive" checked={inclusive} onCheckedChange={setInclusive} />
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <FormField label="Unit">
                <SelectField value={unitCode} onValueChange={setUnitCode} options={UNITS.filter((u) => !trackSerial || u.scale === 1).map((u) => [u.code, u.label] as const)} disabled={isEdit} />
              </FormField>
              <FormField label="Low stock alert at" description="Shows on the dashboard when stock falls to this level.">
                <Input inputMode="numeric" value={reorder} onChange={(e) => setReorder(e.target.value.replace(/\D/g, ""))} placeholder="0" />
              </FormField>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="batch" className="flex flex-col items-start gap-0.5 font-normal">
                  Track batches & expiry
                  <span className="text-xs text-muted-foreground">For medicines, food and cosmetics.</span>
                </Label>
                <Switch id="batch" checked={trackBatch} onCheckedChange={(v) => { setTrackBatch(v); if (v) setTrackSerial(false); }} disabled={isEdit} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="serial" className="flex flex-col items-start gap-0.5 font-normal">
                  Track serial numbers / IMEI
                  <span className="text-xs text-muted-foreground">Phones, electronics, appliances. Each unit is scanned in and out.</span>
                </Label>
                <Switch id="serial" checked={trackSerial} onCheckedChange={(v) => { setTrackSerial(v); if (v) { setTrackBatch(false); setUnitCode("pcs"); } }} disabled={isEdit} />
              </div>
              {trackSerial && (
                <FormField label="Warranty (months)" optional description="Shown on serial lookups so you can check warranty claims.">
                  <Input inputMode="numeric" value={warranty} onChange={(e) => setWarranty(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="12" />
                </FormField>
              )}
              {!isEdit && locations.length > 1 && !trackBatch && !trackSerial && (
                <FormField label="Opening stock location">
                  <SelectField value={openingLocationId} onValueChange={setOpeningLocationId} options={locations.map((l) => [l.id, l.name] as const)} />
                </FormField>
              )}
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="flex gap-2 lg:sticky lg:bottom-4">
          <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending && <Spinner />} {isEdit ? "Save changes" : "Create product"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function toMinorSafe(s: string) {
  try {
    return toMinor(s);
  } catch {
    return 0;
  }
}

/** Barcode box + camera button. Props (incl. FormField's id/aria) go to the input so the label stays linked. */
function BarcodeInput({ onScan, ...props }: React.ComponentProps<typeof Input> & { onScan: (code: string) => void }) {
  return (
    <div className="flex gap-2">
      <Input data-scan-field placeholder="Scan or auto" className="font-mono" {...props} />
      <CameraScanButton single label="Scan" onScan={onScan} />
    </div>
  );
}
