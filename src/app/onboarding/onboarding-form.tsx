"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, MailOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { BUSINESS_TYPES, INDIAN_STATES } from "@/lib/schemas";
import { createBusiness } from "@/server/actions/onboarding";
import { FormField } from "@/components/app/form-field";
import { SelectField } from "@/components/app/select-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const REGIONS = {
  IN: { label: "India", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", taxMode: "GST" },
  AE: { label: "United Arab Emirates", currency: "AED", locale: "en-AE", timezone: "Asia/Dubai", taxMode: "VAT" },
  GB: { label: "United Kingdom", currency: "GBP", locale: "en-GB", timezone: "Europe/London", taxMode: "VAT" },
  US: { label: "United States", currency: "USD", locale: "en-US", timezone: "America/New_York", taxMode: "VAT" },
  EU: { label: "Eurozone", currency: "EUR", locale: "en-IE", timezone: "Europe/Berlin", taxMode: "VAT" },
  OTHER: { label: "Other (no tax)", currency: "USD", locale: "en-US", timezone: "UTC", taxMode: "NONE" },
} as const;
type RegionKey = keyof typeof REGIONS;

export function OnboardingForm({ userName, invitations }: { userName: string; invitations: { id: string; organizationName: string; role: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [region, setRegion] = useState<RegionKey>("IN");
  const [businessType, setBusinessType] = useState<string>(BUSINESS_TYPES[0]);
  const [stateCode, setStateCode] = useState("");
  const [sample, setSample] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const r = REGIONS[region];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    start(async () => {
      setError(null);
      const res = await createBusiness({
        name: String(f.get("name")),
        businessType: businessType as (typeof BUSINESS_TYPES)[number],
        currency: r.currency,
        locale: r.locale,
        timezone: region === "IN" ? r.timezone : browserTz || r.timezone,
        taxMode: r.taxMode,
        taxId: String(f.get("taxId") ?? ""),
        stateCode,
        locationName: String(f.get("locationName")),
        sample,
      });
      if (!res.ok) return setError(res.error);
      toast.success("Your business is ready!");
      router.replace("/dashboard");
      router.refresh();
    });
  }

  async function accept(id: string) {
    const res = await authClient.organization.acceptInvitation({ invitationId: id });
    if (res.error) return toast.error(res.error.message ?? "Could not accept the invitation");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {userName.split(" ")[0]} 👋</h1>
        <p className="text-muted-foreground">Tell us a little about your business. You can change everything later in Settings.</p>
      </div>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailOpen className="size-4" /> You&apos;ve been invited
            </CardTitle>
            <CardDescription>Join an existing business instead of creating a new one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {invitations.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg border p-3">
                <span>
                  <span className="font-medium">{i.organizationName}</span> <span className="text-sm text-muted-foreground">as {i.role}</span>
                </span>
                <Button size="sm" onClick={() => accept(i.id)}>
                  Join
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4" /> Your business
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Business name">
                  <Input name="name" required minLength={2} maxLength={120} placeholder="e.g. Sharma General Store" autoFocus />
                </FormField>
                <FormField label="Type of business">
                  <SelectField value={businessType} onValueChange={setBusinessType} options={BUSINESS_TYPES.map((t) => [t, t] as const)} />
                </FormField>
                <FormField label="Country / region" description={`Currency ${r.currency} · ${r.taxMode === "GST" ? "GST" : r.taxMode === "VAT" ? "VAT / sales tax" : "No tax"}`}>
                  <SelectField value={region} onValueChange={(v) => setRegion(v as RegionKey)} options={Object.entries(REGIONS).map(([k, v]) => [k, v.label] as const)} />
                </FormField>
                <FormField label="First location" description="Your shop, outlet or warehouse.">
                  <Input name="locationName" required defaultValue="Main Store" maxLength={80} />
                </FormField>
                {r.taxMode === "GST" && (
                  <>
                    <FormField label="GSTIN" optional description="Printed on tax invoices.">
                      <Input name="taxId" maxLength={15} placeholder="27ABCDE1234F1Z5" className="uppercase" />
                    </FormField>
                    <FormField label="State" description="Decides CGST+SGST vs IGST.">
                      <SelectField value={stateCode} onValueChange={setStateCode} options={INDIAN_STATES} placeholder="Select state" />
                    </FormField>
                  </>
                )}
                {r.taxMode === "VAT" && (
                  <FormField label="VAT / Tax number" optional>
                    <Input name="taxId" maxLength={20} />
                  </FormField>
                )}
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
                <Checkbox id="sample" checked={sample} onCheckedChange={(v) => setSample(v === true)} className="mt-0.5" />
                <Label htmlFor="sample" className="flex flex-col items-start gap-1 font-normal">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles className="size-3.5 text-primary" /> Add sample products
                  </span>
                  <span className="text-sm text-muted-foreground">A few demo items, a customer and a supplier so you can try billing right away. Delete them anytime.</span>
                </Label>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" size="lg" disabled={pending}>
              {pending && <Spinner />} Create business
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
