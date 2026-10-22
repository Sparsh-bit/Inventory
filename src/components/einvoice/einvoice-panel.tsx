"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileCheck2, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createEwb, createIrn, downloadGstJson, voidIrn } from "@/server/actions/einvoice";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export interface EinvoiceState {
  status: "none" | "generated" | "cancelled" | "failed";
  irn?: string;
  ackNo?: string;
  ackDt?: string;
  ewbNo?: string;
  ewbValidTill?: string;
  errors: string[];
}

function save(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EinvoicePanel({ saleId, number, state, enabled, canManage }: { saleId: string; number: string; state: EinvoiceState; enabled: boolean; canManage: boolean }) {
  const router = useRouter();
  const gen = useAction(createIrn);
  const cancel = useAction(voidIrn);
  const ewb = useAction(createEwb);
  const dl = useAction(downloadGstJson);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [ewbOpen, setEwbOpen] = useState<"api" | "json" | null>(null);
  const [reason, setReason] = useState<"1" | "2" | "3" | "4">("2");
  const [remark, setRemark] = useState("");
  const [d, setD] = useState({ transMode: "1", distance: "", vehNo: "", transId: "", transName: "" });
  const file = number.replace(/[^\w-]/g, "_");
  const details = () => ({
    transMode: d.transMode as "1", distance: Number(d.distance) || 0,
    ...(d.vehNo ? { vehNo: d.vehNo, vehType: "R" as const } : {}), ...(d.transId ? { transId: d.transId } : {}), ...(d.transName ? { transName: d.transName } : {}),
  });
  const badge = { none: ["Not registered", "outline"], generated: ["IRN generated", "default"], cancelled: ["IRN cancelled", "destructive"], failed: ["Needs fixing", "destructive"] } as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <FileCheck2 className="size-4" /> GST e-invoice <Badge variant={badge[state.status][1]}>{badge[state.status][0]}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state.status === "generated" || state.status === "cancelled" ? (
          <dl className="space-y-1">
            <div><dt className="text-xs text-muted-foreground">IRN</dt><dd className="break-all font-mono text-xs">{state.irn}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Ack no.</dt><dd className="font-mono">{state.ackNo}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Ack date</dt><dd>{state.ackDt}</dd></div>
            {state.ewbNo && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">E-way bill</dt><dd className="font-mono">{state.ewbNo}</dd></div>}
            {state.ewbValidTill && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Valid till</dt><dd>{state.ewbValidTill}</dd></div>}
          </dl>
        ) : state.errors.length ? (
          <ul className="list-inside list-disc space-y-1 text-destructive">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        ) : (
          <p className="text-muted-foreground">{enabled ? "Register this invoice with the GST portal to get its IRN and signed QR code." : "E-invoicing is off. Download the JSON for the portal, or turn on the API in Settings → E-invoice."}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {canManage && enabled && state.status !== "generated" && (
            <Button size="sm" disabled={gen.pending} onClick={() => gen.run({ saleId }, { success: "IRN generated", onSuccess: () => router.refresh(), onError: () => router.refresh() })}>
              {gen.pending && <Spinner />} Generate IRN
            </Button>
          )}
          {canManage && enabled && state.status === "generated" && !state.ewbNo && (
            <Button size="sm" variant="outline" onClick={() => setEwbOpen("api")}><Truck /> E-way bill</Button>
          )}
          {canManage && state.status === "generated" && (
            <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}><XCircle /> Cancel IRN</Button>
          )}
          <Button size="sm" variant="ghost" disabled={dl.pending} onClick={() => dl.run({ saleId, type: "einvoice" }, { onSuccess: (r) => save(`einvoice-${file}.json`, r.json) })}>
            <Download /> E-invoice JSON
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEwbOpen("json")}><Download /> E-way bill JSON</Button>
        </div>
      </CardContent>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel IRN</DialogTitle>
            <DialogDescription>Allowed within 24 hours of generation. After that, issue a credit note.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="cnl-rsn">Reason</Label><SelectField id="cnl-rsn" value={reason} onValueChange={(v) => setReason(v as "1")} options={[["1", "Duplicate"], ["2", "Data entry mistake"], ["3", "Order cancelled"], ["4", "Other"]]} /></div>
            <div className="space-y-1.5"><Label htmlFor="cnl-rem">Remark</Label><Input id="cnl-rem" value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={100} /></div>
          </div>
          <DialogFooter>
            <Button variant="destructive" disabled={cancel.pending} onClick={() => cancel.run({ saleId, reason, remark }, { success: "IRN cancelled", onSuccess: () => { setCancelOpen(false); router.refresh(); } })}>
              {cancel.pending && <Spinner />} Cancel IRN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ewbOpen} onOpenChange={(o) => !o && setEwbOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>E-way bill</DialogTitle>
            <DialogDescription>Needed for moving goods worth more than ₹50,000. Leave distance 0 to let the portal calculate it from PIN codes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ewb-mode">Mode</Label><SelectField id="ewb-mode" value={d.transMode} onValueChange={(v) => setD({ ...d, transMode: v })} options={[["1", "Road"], ["2", "Rail"], ["3", "Air"], ["4", "Ship"]]} /></div>
            <div className="space-y-1.5"><Label htmlFor="ewb-km">Distance (km)</Label><Input id="ewb-km" inputMode="numeric" value={d.distance} onChange={(e) => setD({ ...d, distance: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="0" /></div>
            <div className="space-y-1.5"><Label htmlFor="ewb-veh">Vehicle no.</Label><Input id="ewb-veh" value={d.vehNo} onChange={(e) => setD({ ...d, vehNo: e.target.value.toUpperCase() })} placeholder="MH12AB1234" /></div>
            <div className="space-y-1.5"><Label htmlFor="ewb-tid">Transporter ID</Label><Input id="ewb-tid" value={d.transId} onChange={(e) => setD({ ...d, transId: e.target.value.toUpperCase() })} placeholder="Optional" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ewb-tname">Transporter name</Label><Input id="ewb-tname" value={d.transName} onChange={(e) => setD({ ...d, transName: e.target.value })} placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            {ewbOpen === "api" ? (
              <Button disabled={ewb.pending} onClick={() => ewb.run({ saleId, details: details() }, { success: "E-way bill generated", onSuccess: () => { setEwbOpen(null); router.refresh(); } })}>
                {ewb.pending && <Spinner />} Generate e-way bill
              </Button>
            ) : (
              <Button disabled={dl.pending} onClick={() => dl.run({ saleId, type: "ewaybill", details: details() }, { onSuccess: (r) => { save(`ewaybill-${file}.json`, r.json); setEwbOpen(null); toast.success("Upload this file on the e-way bill portal (Bulk generation)."); } })}>
                <Download /> Download JSON
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
