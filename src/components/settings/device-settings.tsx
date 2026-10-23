"use client";
import { useState } from "react";
import { Bluetooth, Cable, CheckCircle2, Globe, MonitorSmartphone, Printer, ScanBarcode, Usb } from "lucide-react";
import { toast } from "sonner";
import { EscPos } from "@/lib/escpos";
import { useOrg } from "@/components/app/org-context";
import { kickDrawer } from "@/components/print/use-print-sale";
import { pairPrinter, saveProfile, sendRaw, usePrinterProfile, usePrinterSupport, type PrinterProfile, type Transport } from "@/components/print/printer";
import { CameraScanButton } from "@/components/scanner/scan-tools";
import { useScanner } from "@/components/scanner/use-scanner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const TRANSPORTS: { id: Transport; label: string; icon: typeof Printer; text: string }[] = [
  { id: "browser", label: "Any printer", icon: Globe, text: "Uses the system print dialog. Works with every installed printer (thermal or A4), in every browser." },
  { id: "usb", label: "USB (direct)", icon: Usb, text: "Silent printing to a USB thermal printer. Chrome/Edge on desktop or Android." },
  { id: "serial", label: "Serial / COM", icon: Cable, text: "For printers that appear as a COM / serial port (most Windows USB thermal printers with a driver)." },
  { id: "bluetooth", label: "Bluetooth", icon: Bluetooth, text: "Portable BLE receipt printers. Chrome on Android, Windows, macOS." },
  { id: "bridge", label: "Network (LAN)", icon: MonitorSmartphone, text: "Ethernet/Wi-Fi printers via the StockPilot print bridge running on a shop PC." },
];

export function DeviceSettings() {
  const org = useOrg();
  const p = usePrinterProfile();
  const caps = usePrinterSupport();
  const [lastScan, setLastScan] = useState<string | null>(null);
  useScanner((code) => setLastScan(code));

  const update = (patch: Partial<PrinterProfile>) => saveProfile({ ...p, ...patch });

  async function pair() {
    try {
      toast.success(await pairPrinter(p.transport));
    } catch (e) {
      if ((e as DOMException).name !== "NotFoundError") toast.error((e as Error).message || "Could not connect");
    }
  }

  async function testPrint() {
    if (p.transport === "browser") return toast.info("Complete a sale and use “Receipt”, or open any sale and click Receipt to test browser printing.");
    const e = new EscPos({ width: p.width === 58 ? 32 : 48 }).init().align("center").bold(true).size(2, 2).line(org.orgName.slice(0, 16)).size(1, 1).bold(false)
      .line("Printer test").divider().align("left").cols("Paper width", `${p.width} mm`).cols("Connection", p.transport).cols("Rs. symbol", "₹ -> Rs.").divider()
      .align("center").qr("https://stockpilot.app", 5).line("If you can read this, printing works!").feed(3).cut();
    try {
      await sendRaw(p, e.bytes());
      toast.success("Test page sent");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const unsupported = p.transport !== "browser" && p.transport !== "bridge" && !caps[p.transport];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Printer className="size-4" /> Receipt printer</CardTitle>
          <CardDescription>How this device prints bills.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {TRANSPORTS.map((t) => (
              <button key={t.id} type="button" onClick={() => update({ transport: t.id })} aria-pressed={p.transport === t.id} className={`flex gap-3 rounded-lg border p-3 text-left transition ${p.transport === t.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}>
                <t.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span><span className="block text-sm font-medium">{t.label}</span><span className="block text-xs text-muted-foreground">{t.text}</span></span>
              </button>
            ))}
          </div>
          {unsupported && (
            <Alert variant="destructive"><AlertDescription>This browser can&apos;t talk to {p.transport} printers. Use Chrome or Edge, or choose “Any printer”.</AlertDescription></Alert>
          )}
          {p.transport === "bridge" && (
            <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="br-url">Bridge address</Label><Input id="br-url" value={p.bridgeUrl} onChange={(e) => update({ bridgeUrl: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="br-key">Bridge key</Label><Input id="br-key" type="password" value={p.bridgeKey} onChange={(e) => update({ bridgeKey: e.target.value })} /></div>
              <p className="text-xs text-muted-foreground sm:col-span-2">Run <code className="rounded bg-background px-1">node print-bridge/bridge.mjs --printer 192.168.1.50 --key YOUR-KEY</code> on a computer in the shop. See print-bridge/README.md.</p>
            </div>
          )}
          {p.transport === "serial" && (
            <div className="max-w-48 space-y-1.5"><Label htmlFor="baud">Baud rate</Label><Input id="baud" inputMode="numeric" value={p.baudRate} onChange={(e) => update({ baudRate: Number(e.target.value.replace(/\D/g, "")) || 9600 })} /></div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <ToggleGroup type="single" variant="outline" value={String(p.width)} onValueChange={(v) => v && update({ width: Number(v) as 58 | 80 })} aria-label="Paper width">
              <ToggleGroupItem value="58" className="px-4">58 mm</ToggleGroupItem>
              <ToggleGroupItem value="80" className="px-4">80 mm</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup type="single" variant="outline" value={p.invoiceFormat} onValueChange={(v) => v && update({ invoiceFormat: v as "thermal" })} aria-label="Default bill format">
              <ToggleGroupItem value="thermal" className="px-4">Thermal receipt</ToggleGroupItem>
              <ToggleGroupItem value="a4" className="px-4">A4 invoice</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><Label htmlFor="auto" className="font-normal">Print automatically after each sale</Label><Switch id="auto" checked={p.autoPrint} onCheckedChange={(v) => update({ autoPrint: v })} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="drawer" className="flex flex-col items-start gap-0.5 font-normal">Open cash drawer on cash sales<span className="text-xs text-muted-foreground">Drawer must be plugged into the printer (direct connections only).</span></Label><Switch id="drawer" checked={p.openDrawer} onCheckedChange={(v) => update({ openDrawer: v })} disabled={p.transport === "browser"} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {["usb", "serial", "bluetooth"].includes(p.transport) && <Button variant="outline" onClick={pair} disabled={unsupported}>Connect printer…</Button>}
            <Button variant="outline" onClick={testPrint}>Print test page</Button>
            {p.transport !== "browser" && <Button variant="outline" onClick={() => kickDrawer()}>Open drawer</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ScanBarcode className="size-4" /> Barcode scanner</CardTitle>
          <CardDescription>USB and Bluetooth scanners work automatically — no setup needed. Scan any barcode now to test.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`flex items-center gap-3 rounded-lg border p-4 ${lastScan ? "border-success bg-success/5" : "border-dashed"}`} aria-live="polite">
            {lastScan ? <CheckCircle2 className="size-5 text-success" /> : <ScanBarcode className="size-5 text-muted-foreground" />}
            <span className="text-sm">{lastScan ? <>Scanner works. Read: <code className="font-mono font-semibold">{lastScan}</code></> : "Waiting for a scan…"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CameraScanButton onScan={(c) => setLastScan(c)} label="Test camera" />
            <p className="text-xs text-muted-foreground">No scanner? The phone or laptop camera works too, and on the POS you can pair a phone as a wireless scanner.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
