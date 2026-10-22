"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveLocation } from "@/server/actions/inventory";
import { deleteTaxRate, saveTaxRate } from "@/server/actions/settings";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

interface Tax { id: string; name: string; rateBp: number; cessBp: number; isDefault: boolean; products: number }

export function TaxRateEditor({ rates, gst }: { rates: Tax[]; gst: boolean }) {
  const router = useRouter();
  const save = useAction(saveTaxRate);
  const del = useAction(deleteTaxRate);
  const [edit, setEdit] = useState<{ id: string | null; name: string; rate: string; cess: string; isDefault: boolean } | null>(null);
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEdit({ id: null, name: "", rate: "", cess: "", isDefault: false })}><Plus /> Add rate</Button></div>
      <Card className="divide-y py-0">
        {rates.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.name} {r.isDefault && <Badge variant="secondary">Default</Badge>}</p>
              <p className="text-xs text-muted-foreground">
                {r.rateBp / 100}%{gst && r.rateBp > 0 && ` = CGST ${r.rateBp / 200}% + SGST ${r.rateBp / 200}% (or IGST ${r.rateBp / 100}%)`}{r.cessBp > 0 && ` + cess ${r.cessBp / 100}%`} · {r.products} products
              </p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => setEdit({ id: r.id, name: r.name, rate: String(r.rateBp / 100), cess: r.cessBp ? String(r.cessBp / 100) : "", isDefault: r.isDefault })}><Pencil /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`} disabled={r.products > 0 || del.pending} onClick={() => del.run({ id: r.id }, { success: "Deleted", onSuccess: () => router.refresh() })}><Trash2 /></Button>
          </div>
        ))}
      </Card>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit tax rate" : "New tax rate"}</DialogTitle></DialogHeader>
          {edit && (
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              const rateBp = Math.round(Number(edit.rate) * 100);
              const cessBp = Math.round(Number(edit.cess || 0) * 100);
              if (!Number.isFinite(rateBp) || rateBp < 0 || rateBp > 10000 || !Number.isFinite(cessBp)) return toast.error("Enter a rate between 0 and 100");
              save.run({ id: edit.id, name: edit.name, rateBp, cessBp, isDefault: edit.isDefault }, { success: "Tax rate saved", onSuccess: () => { setEdit(null); router.refresh(); } });
            }}>
              <div className="space-y-1.5"><Label htmlFor="tr-name">Name</Label><Input id="tr-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required maxLength={60} placeholder="GST 18%" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="tr-rate">Rate %</Label><Input id="tr-rate" inputMode="decimal" value={edit.rate} onChange={(e) => setEdit({ ...edit, rate: e.target.value })} required /></div>
                {gst && <div className="space-y-1.5"><Label htmlFor="tr-cess">Cess % (optional)</Label><Input id="tr-cess" inputMode="decimal" value={edit.cess} onChange={(e) => setEdit({ ...edit, cess: e.target.value })} /></div>}
              </div>
              <div className="flex items-center justify-between"><Label htmlFor="tr-def" className="font-normal">Default for new products</Label><Switch id="tr-def" checked={edit.isDefault} onCheckedChange={(v) => setEdit({ ...edit, isDefault: v })} /></div>
              <DialogFooter><Button type="submit" disabled={save.pending}>{save.pending && <Spinner />} Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface Loc { id: string; name: string; kind: "store" | "warehouse"; isDefault: boolean; active: boolean }

export function LocationEditor({ locations }: { locations: Loc[] }) {
  const router = useRouter();
  const save = useAction(saveLocation);
  const [edit, setEdit] = useState<(Omit<Loc, "id"> & { id: string | null }) | null>(null);
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEdit({ id: null, name: "", kind: "store", isDefault: false, active: true })}><Plus /> Add location</Button></div>
      <Card className="divide-y py-0">
        {locations.map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{l.name} {l.isDefault && <Badge variant="secondary">Default</Badge>} {!l.active && <Badge variant="outline">Inactive</Badge>}</p>
              <p className="text-xs capitalize text-muted-foreground">{l.kind}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${l.name}`} onClick={() => setEdit(l)}><Pencil /></Button>
          </div>
        ))}
      </Card>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit location" : "New location"}</DialogTitle></DialogHeader>
          {edit && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run(edit, { success: "Location saved", onSuccess: () => { setEdit(null); router.refresh(); } }); }}>
              <div className="space-y-1.5"><Label htmlFor="loc-name">Name</Label><Input id="loc-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required maxLength={80} autoFocus /></div>
              <div className="space-y-1.5"><Label htmlFor="loc-kind">Type</Label><SelectField id="loc-kind" value={edit.kind} onValueChange={(v) => setEdit({ ...edit, kind: v as "store" })} options={[["store", "Store / outlet"], ["warehouse", "Warehouse"]]} /></div>
              <div className="flex items-center justify-between"><Label htmlFor="loc-def" className="font-normal">Default location</Label><Switch id="loc-def" checked={edit.isDefault} onCheckedChange={(v) => setEdit({ ...edit, isDefault: v })} /></div>
              {edit.id && <div className="flex items-center justify-between"><Label htmlFor="loc-act" className="font-normal">Active</Label><Switch id="loc-act" checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /></div>}
              <DialogFooter><Button type="submit" disabled={save.pending}>{save.pending && <Spinner />} Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
