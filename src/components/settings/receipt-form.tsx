"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import type { receiptSettingsInput } from "@/lib/schemas";
import { updateReceipt } from "@/server/actions/settings";
import { FormField } from "@/components/app/form-field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Form = z.input<typeof receiptSettingsInput>;

export function ReceiptForm({ initial, gst }: { initial: Form; gst: boolean }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction(updateReceipt);
  const [f, setF] = useState<Form>(initial);
  const year = new Date().getFullYear() % 100;
  const fy = `${year}-${year + 1}`;
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(f, { success: "Saved", onSuccess: () => router.refresh() }); }} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Receipt</CardTitle><CardDescription>Default paper width. Each counter can still override it in Printer & scanner.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <ToggleGroup type="single" variant="outline" value={String(f.paperWidth)} onValueChange={(v) => v && setF({ ...f, paperWidth: Number(v) as 58 | 80 })} aria-label="Paper width">
              <ToggleGroupItem value="58" className="px-6">58 mm (2 inch)</ToggleGroupItem>
              <ToggleGroupItem value="80" className="px-6">80 mm (3 inch)</ToggleGroupItem>
            </ToggleGroup>
            <FormField label="Header line" optional description="e.g. opening hours or a tagline"><Input value={f.header} onChange={(e) => setF({ ...f, header: e.target.value })} maxLength={300} /></FormField>
            <FormField label="Footer line" optional><Input value={f.footer} onChange={(e) => setF({ ...f, footer: e.target.value })} maxLength={300} /></FormField>
            {gst && <div className="flex items-center justify-between"><Label htmlFor="hsn" className="font-normal">Print HSN codes on receipts</Label><Switch id="hsn" checked={f.showHsn} onCheckedChange={(v) => setF({ ...f, showHsn: v })} /></div>}
            <div className="flex items-center justify-between"><Label htmlFor="upiqr" className="flex flex-col items-start gap-0.5 font-normal">Print a UPI payment QR<span className="text-xs text-muted-foreground">Customers scan it with any UPI app to pay the exact amount.</span></Label><Switch id="upiqr" checked={f.showUpiQr} onCheckedChange={(v) => setF({ ...f, showUpiQr: v })} /></div>
            <FormField label="UPI ID" optional error={fieldErrors.upiId} description="Also shows a QR on the payment screen when UPI is chosen."><Input value={f.upiId} onChange={(e) => setF({ ...f, upiId: e.target.value.trim() })} placeholder="yourshop@okbank" /></FormField>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Document numbers</CardTitle><CardDescription>Numbers restart every financial year and never skip (GST compliant).</CardDescription></CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {([["sale", "Bills / receipts"], ["invoice", "Tax invoices"], ["return", "Credit notes (returns)"], ["purchase", "Purchase orders"]] as const).map(([k, label]) => (
            <FormField key={k} label={label} error={fieldErrors[`prefixes.${k}`]} description={`Next: ${f.prefixes[k]}/${fy}/00001`}>
              <Input value={f.prefixes[k]} onChange={(e) => setF({ ...f, prefixes: { ...f.prefixes, [k]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) } })} />
            </FormField>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Barcode scanner</CardTitle><CardDescription>Only change these if your USB/Bluetooth scanner is missed or ordinary typing is mistaken for a scan.</CardDescription></CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField label="Max gap between keystrokes (ms)" description="Scanners type fast (usually under 30 ms). Increase for slow Bluetooth scanners.">
            <Input inputMode="numeric" value={f.scanner.interKeyMs} onChange={(e) => setF({ ...f, scanner: { ...f.scanner, interKeyMs: Number(e.target.value.replace(/\D/g, "")) || 0 } })} />
          </FormField>
          <FormField label="Minimum barcode length" description="Shorter bursts are treated as typing.">
            <Input inputMode="numeric" value={f.scanner.minLength} onChange={(e) => setF({ ...f, scanner: { ...f.scanner, minLength: Number(e.target.value.replace(/\D/g, "")) || 0 } })} />
          </FormField>
        </CardContent>
      </Card>
      <div className="flex justify-end"><Button type="submit" size="lg" disabled={pending}>{pending && <Spinner />} Save</Button></div>
    </form>
  );
}
