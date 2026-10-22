"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, PlugZap } from "lucide-react";
import { saveEinvoice, testEinvoice } from "@/server/actions/einvoice";
import { FormField } from "@/components/app/form-field";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_URL = { sandbox: "https://einv-apisandbox.nic.in", production: "https://api.einvoice1.gst.gov.in" } as const;

interface Initial {
  enabled: boolean;
  environment: "sandbox" | "production";
  baseUrl: string;
  paths: { auth: string; invoice: string; cancel: string; ewb: string };
  clientId: string;
  username: string;
  hasClientSecret: boolean;
  hasPassword: boolean;
  hasPublicKey: boolean;
}

export function EinvoiceSettingsForm({ initial, gstin }: { initial: Initial; gstin: string }) {
  const router = useRouter();
  const save = useAction(saveEinvoice);
  const test = useAction(testEinvoice);
  const [f, setF] = useState({ ...initial, clientSecret: "", password: "", publicKey: "" });
  const [tested, setTested] = useState(false);
  const set = (patch: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...patch }));
    setTested(false);
  };
  const saved = (has: boolean) => (has ? "Saved — leave blank to keep" : undefined);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      {!gstin && <Alert variant="destructive"><AlertDescription>Add your GSTIN in Business profile first — the API logs in with it.</AlertDescription></Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Create API credentials on the e-invoice portal (API registration → “Through own ERP” or via your GSP), and download the NIC public key file for the same environment.{" "}
            <a href="https://einv-apisandbox.nic.in/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">Sandbox portal <ExternalLink className="size-3" /></a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <Label htmlFor="einv-on" className="flex flex-col items-start gap-0.5">
                Generate e-invoices for B2B sales
                <span className="text-xs font-normal text-muted-foreground">Required when your turnover exceeds the e-invoicing threshold.</span>
              </Label>
              <Switch id="einv-on" checked={f.enabled} onCheckedChange={(v) => set({ enabled: v })} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Environment">
                <SelectField value={f.environment} onValueChange={(v) => set({ environment: v as "sandbox", baseUrl: DEFAULT_URL[v as "sandbox"] })} options={[["sandbox", "Sandbox (testing)"], ["production", "Production (live)"]]} />
              </FormField>
              <FormField label="API address" error={save.fieldErrors.baseUrl}>
                <Input value={f.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} className="font-mono text-sm" />
              </FormField>
              <FormField label="Client ID"><Input value={f.clientId} onChange={(e) => set({ clientId: e.target.value })} autoComplete="off" /></FormField>
              <FormField label="Client secret" description={saved(initial.hasClientSecret)}><Input type="password" value={f.clientSecret} onChange={(e) => set({ clientSecret: e.target.value })} autoComplete="new-password" /></FormField>
              <FormField label="API username"><Input value={f.username} onChange={(e) => set({ username: e.target.value })} autoComplete="off" /></FormField>
              <FormField label="API password" description={saved(initial.hasPassword)}><Input type="password" value={f.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" /></FormField>
            </div>
            <FormField label="NIC public key" description={saved(initial.hasPublicKey) ?? "Open the .pem/.key file in a text editor and paste everything, including the BEGIN and END lines."} error={save.fieldErrors.publicKey}>
              <Textarea value={f.publicKey} onChange={(e) => set({ publicKey: e.target.value })} rows={4} className="font-mono text-xs" placeholder="-----BEGIN PUBLIC KEY-----" />
            </FormField>
            <details className="rounded-lg border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Advanced: API paths</summary>
              <p className="mt-2 text-xs text-muted-foreground">Change only if NIC or your GSP publishes different endpoint versions.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["auth", "invoice", "cancel", "ewb"] as const).map((k) => (
                  <FormField key={k} label={{ auth: "Authenticate", invoice: "Generate IRN", cancel: "Cancel IRN", ewb: "E-way bill by IRN" }[k]} error={save.fieldErrors[`paths.${k}`]}>
                    <Input value={f.paths[k]} onChange={(e) => set({ paths: { ...f.paths, [k]: e.target.value } })} className="font-mono text-xs" />
                  </FormField>
                ))}
              </div>
            </details>
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={test.pending || save.pending} onClick={() => test.run({}, { success: "Connected to the e-invoice system", onSuccess: () => setTested(true) })}>
          {test.pending ? <Spinner /> : tested ? <CheckCircle2 className="text-success" /> : <PlugZap />} Test saved connection
        </Button>
        <Button type="submit" disabled={save.pending}>{save.pending && <Spinner />} Save</Button>
      </div>
    </form>
  );

  function run() {
    save.run(
      {
        enabled: f.enabled, environment: f.environment, baseUrl: f.baseUrl, paths: f.paths, clientId: f.clientId, username: f.username,
        ...(f.clientSecret ? { clientSecret: f.clientSecret } : {}), ...(f.password ? { password: f.password } : {}), ...(f.publicKey ? { publicKey: f.publicKey } : {}),
      },
      { success: "E-invoice settings saved", onSuccess: () => { setF((x) => ({ ...x, clientSecret: "", password: "", publicKey: "" })); router.refresh(); } },
    );
  }
}
