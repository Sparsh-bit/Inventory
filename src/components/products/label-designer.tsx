"use client";
import { useState } from "react";
import { Minus, Plus, Printer, Trash2 } from "lucide-react";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { BarcodeSvg } from "@/components/print/barcode-svg";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductPicker } from "./product-picker";

interface Item {
  variantId: string;
  name: string;
  barcode: string;
  price: number;
  mrp: number;
  copies: number;
}

// Dimensions in mm. Sheet templates follow common Avery/Novajet A4 layouts.
const TEMPLATES = {
  a4_21: { label: "A4 sheet · 21 labels (63.5 × 38.1 mm)", page: "A4", w: 63.5, h: 38.1, cols: 3, rows: 7, top: 15.15, left: 7.2, gapX: 2.5, gapY: 0 },
  a4_65: { label: "A4 sheet · 65 labels (38.1 × 21.2 mm)", page: "A4", w: 38.1, h: 21.2, cols: 5, rows: 13, top: 10.7, left: 4.7, gapX: 2.5, gapY: 0 },
  t50x25: { label: "Thermal roll · 50 × 25 mm", page: "50mm 25mm", w: 50, h: 25, cols: 1, rows: 1, top: 0, left: 0, gapX: 0, gapY: 0 },
  t38x25: { label: "Thermal roll · 38 × 25 mm", page: "38mm 25mm", w: 38, h: 25, cols: 1, rows: 1, top: 0, left: 0, gapX: 0, gapY: 0 },
} as const;
type TemplateKey = keyof typeof TEMPLATES;

export function LabelDesigner({ initial }: { initial: Item[] }) {
  const org = useOrg();
  const [items, setItems] = useState<Item[]>(initial);
  const [tpl, setTpl] = useState<TemplateKey>("a4_21");
  const [showPrice, setShowPrice] = useState(true);
  const [showMrp, setShowMrp] = useState(false);
  const [showName, setShowName] = useState(true);
  const t = TEMPLATES[tpl];
  const perPage = t.cols * t.rows;
  const labels = items.flatMap((i) => Array.from({ length: i.copies }, () => i));
  const pages: Item[][] = [];
  for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage));
  const small = t.h < 30;

  const label = (i: Item, k: number) => (
    <div key={k} className="flex flex-col items-center justify-center overflow-hidden px-[1.5mm] text-center text-black" style={{ width: `${t.w}mm`, height: `${t.h}mm` }}>
      {showName && <div className={`w-full truncate font-medium leading-tight ${small ? "text-[6.5pt]" : "text-[8pt]"}`}>{i.name}</div>}
      <BarcodeSvg code={i.barcode} height={small ? 7 : 10} className="block w-full [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[60%] [&_svg]:max-w-full" />
      {(showPrice || (showMrp && i.mrp > 0)) && (
        <div className={`flex gap-2 font-semibold leading-tight ${small ? "text-[6.5pt]" : "text-[8.5pt]"}`}>
          {showMrp && i.mrp > 0 && <span className="font-normal">MRP {org.money(i.mrp)}</span>}
          {showPrice && <span>{org.money(i.price)}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <style>{`@media print {
        @page { size: ${t.page}; margin: 0; }
        html, body { background: #fff !important; }
        body * { visibility: hidden !important; }
        #label-sheet, #label-sheet * { visibility: visible !important; }
        #label-sheet { position: absolute; left: 0; top: 0; display: block !important; }
        .label-page { break-after: page; }
      }`}</style>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProductPicker
            onPick={(h) =>
              setItems((xs) =>
                xs.some((x) => x.variantId === h.variantId)
                  ? xs.map((x) => (x.variantId === h.variantId ? { ...x, copies: x.copies + 1 } : x))
                  : [...xs, { variantId: h.variantId, name: [h.name, h.variantName].filter(Boolean).join(" - "), barcode: h.barcode, price: h.salePrice, mrp: h.mrp, copies: Math.max(1, Math.min(h.stock / h.scale, 50)) | 0 || 1 }],
              )
            }
          />
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Search above to add products.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {items.map((i) => (
                <li key={i.variantId} className="flex items-center gap-3 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{i.barcode}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon-sm" aria-label="Fewer copies" onClick={() => setItems((xs) => xs.map((x) => (x.variantId === i.variantId ? { ...x, copies: Math.max(1, x.copies - 1) } : x)))}>
                      <Minus />
                    </Button>
                    <Input aria-label="Copies" className="h-7 w-14 text-center tabular-nums" inputMode="numeric" value={i.copies} onChange={(e) => setItems((xs) => xs.map((x) => (x.variantId === i.variantId ? { ...x, copies: Math.min(500, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) } : x)))} />
                    <Button variant="outline" size="icon-sm" aria-label="More copies" onClick={() => setItems((xs) => xs.map((x) => (x.variantId === i.variantId ? { ...x, copies: Math.min(500, x.copies + 1) } : x)))}>
                      <Plus />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((x) => x.variantId !== i.variantId))}>
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Layout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SelectField aria-label="Label template" value={tpl} onValueChange={(v) => setTpl(v as TemplateKey)} options={Object.entries(TEMPLATES).map(([k, v]) => [k, v.label] as const)} />
            {[
              ["name", "Product name", showName, setShowName],
              ["price", "Selling price", showPrice, setShowPrice],
              ["mrp", "MRP", showMrp, setShowMrp],
            ].map(([id, text, val, set]) => (
              <div key={id as string} className="flex items-center gap-2">
                <Checkbox id={`lbl-${id}`} checked={val as boolean} onCheckedChange={(v) => (set as (b: boolean) => void)(v === true)} />
                <Label htmlFor={`lbl-${id}`} className="font-normal">{text as string}</Label>
              </div>
            ))}
            <Button className="w-full" disabled={!labels.length} onClick={() => window.print()}>
              <Printer /> Print {labels.length} label{labels.length === 1 ? "" : "s"}
            </Button>
            <p className="text-xs text-muted-foreground">In the print dialog choose your label printer or A4 printer, set margins to “None” and scale to 100%.</p>
          </CardContent>
        </Card>
        {labels.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <div className="rounded border bg-white shadow-sm">{label(labels[0], 0)}</div>
            </CardContent>
          </Card>
        )}
      </div>

      <div id="label-sheet" className="hidden">
        {pages.map((pg, p) => (
          <div key={p} className="label-page bg-white" style={{ paddingTop: `${t.top}mm`, paddingLeft: `${t.left}mm`, display: "grid", gridTemplateColumns: `repeat(${t.cols}, ${t.w}mm)`, columnGap: `${t.gapX}mm`, rowGap: `${t.gapY}mm` }}>
            {pg.map((i, k) => label(i, k))}
          </div>
        ))}
      </div>
    </div>
  );
}
