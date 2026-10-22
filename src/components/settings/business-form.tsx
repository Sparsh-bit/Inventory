"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { BUSINESS_TYPES, INDIAN_STATES, type SettingsInput } from "@/lib/schemas";
import { updateBusiness } from "@/server/actions/settings";
import { FormField } from "@/components/app/form-field";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SAR", "SGD", "AUD", "CAD", "NPR", "BDT", "LKR", "KES", "NGN", "ZAR", "MYR", "IDR", "PHP"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Form = SettingsInput & { logoUrl: string };

export function BusinessForm({ initial }: { initial: Form }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction(updateBusiness);
  const [f, setF] = useState<Form>(initial);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setAddr = (k: string, v: string) => setF((x) => ({ ...x, address: { ...x.address, [k]: v } }));
  const timezones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [f.timezone];

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body });
    const json = (await res.json()) as { url?: string; error?: string };
    setUploading(false);
    if (!res.ok || !json.url) return toast.error(json.error ?? "Upload failed");
    set("logoUrl", json.url);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); run(f, { success: "Settings saved", onSuccess: () => router.refresh() }); }} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="flex items-center gap-4">
              <div className="relative grid size-20 place-items-center overflow-hidden rounded-xl border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {f.logoUrl ? <img src={f.logoUrl} alt="Logo" className="size-full object-contain" /> : <ImagePlus className="size-6 text-muted-foreground" />}
                {f.logoUrl && <button type="button" aria-label="Remove logo" onClick={() => set("logoUrl", "")} className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-background shadow"><X className="size-3" /></button>}
              </div>
              <div className="space-y-1">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading && <Spinner />} Upload logo</Button>
                <p className="text-xs text-muted-foreground">Printed on receipts and invoices.</p>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Business name" error={fieldErrors.name}><Input value={f.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} /></FormField>
              <FormField label="Legal / registered name" optional><Input value={f.legalName} onChange={(e) => set("legalName", e.target.value)} maxLength={200} /></FormField>
              <FormField label="Type of business"><SelectField value={f.businessType} onValueChange={(v) => set("businessType", v)} options={BUSINESS_TYPES.map((t) => [t, t] as const)} /></FormField>
              <FormField label="Phone" optional><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={20} /></FormField>
              <FormField label="Email" optional error={fieldErrors.email}><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></FormField>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Address</CardTitle></CardHeader>
        <CardContent>
          <FieldGroup>
            <FormField label="Address line 1" optional><Input value={f.address?.line1 ?? ""} onChange={(e) => setAddr("line1", e.target.value)} maxLength={200} /></FormField>
            <FormField label="Address line 2" optional><Input value={f.address?.line2 ?? ""} onChange={(e) => setAddr("line2", e.target.value)} maxLength={200} /></FormField>
            <div className="grid gap-5 sm:grid-cols-3">
              <FormField label="City" optional><Input value={f.address?.city ?? ""} onChange={(e) => setAddr("city", e.target.value)} maxLength={100} /></FormField>
              <FormField label="State / region" optional><Input value={f.address?.state ?? ""} onChange={(e) => setAddr("state", e.target.value)} maxLength={100} /></FormField>
              <FormField label="PIN / ZIP" optional><Input value={f.address?.postalCode ?? ""} onChange={(e) => setAddr("postalCode", e.target.value)} maxLength={20} /></FormField>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tax & money</CardTitle></CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Tax system"><SelectField value={f.taxMode} onValueChange={(v) => set("taxMode", v as Form["taxMode"])} options={[["GST", "GST (India)"], ["VAT", "VAT / Sales tax"], ["NONE", "No tax"]]} /></FormField>
              <FormField label={f.taxMode === "GST" ? "GSTIN" : "Tax number"} optional error={fieldErrors.taxId}><Input value={f.taxId} onChange={(e) => set("taxId", e.target.value.toUpperCase())} maxLength={20} /></FormField>
              {f.taxMode === "GST" && <FormField label="GST state"><SelectField value={f.stateCode ?? ""} onValueChange={(v) => set("stateCode", v)} options={INDIAN_STATES} placeholder="Select state" /></FormField>}
              <FormField label="Currency"><SelectField value={f.currency} onValueChange={(v) => set("currency", v)} options={CURRENCIES.map((c) => [c, c] as const)} /></FormField>
              <FormField label="Number format"><SelectField value={f.locale} onValueChange={(v) => set("locale", v)} options={[["en-IN", "1,00,000.00 (India)"], ["en-US", "100,000.00"], ["en-GB", "100,000.00 (UK)"], ["de-DE", "100.000,00"], ["fr-FR", "100 000,00"], ["en-AE", "100,000.00 (UAE)"]]} /></FormField>
              <FormField label="Time zone"><SelectField value={f.timezone} onValueChange={(v) => set("timezone", v)} options={timezones.map((t) => [t, t] as const)} /></FormField>
              <FormField label="Financial year starts in"><SelectField value={String(f.fiscalYearStartMonth)} onValueChange={(v) => set("fiscalYearStartMonth", Number(v))} options={MONTHS.map((m, i) => [String(i + 1), m] as const)} /></FormField>
            </div>
            {[
              ["pricesIncludeTax", "New products: prices include tax", "Typical for retail (MRP-style pricing)."],
              ["roundOff", "Round bill totals to the nearest whole amount", "Shows a round-off line on bills."],
              ["allowNegativeStock", "Allow selling when stock shows zero", "Useful if you bill before entering purchases. Batch-tracked items are never allowed below zero."],
            ].map(([k, label, hint]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <Label htmlFor={k} className="flex flex-col items-start gap-0.5 font-normal">{label}<span className="text-xs text-muted-foreground">{hint}</span></Label>
                <Switch id={k} checked={f[k as "roundOff"]} onCheckedChange={(v) => set(k as "roundOff", v)} />
              </div>
            ))}
            <FormField label="Invoice terms & conditions" optional><Textarea value={f.invoiceTerms} onChange={(e) => set("invoiceTerms", e.target.value)} rows={3} maxLength={2000} placeholder="e.g. Goods once sold will not be taken back. Subject to Pune jurisdiction." /></FormField>
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="flex justify-end"><Button type="submit" size="lg" disabled={pending}>{pending && <Spinner />} Save changes</Button></div>
    </form>
  );
}
