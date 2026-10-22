"use client";
import { useState } from "react";
import { CheckCircle2, Keyboard, MonitorSmartphone, XCircle } from "lucide-react";
import { CameraScanner } from "@/components/scanner/camera-scanner";
import { scanFeedback } from "@/components/scanner/use-scanner";
import { LogoMark } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Sent {
  code: string;
  ok: boolean;
  at: number;
}

export function PhoneScanner({ token, valid, orgName }: { token: string; valid: boolean; orgName: string }) {
  const [sent, setSent] = useState<Sent[]>([]);
  const [expired, setExpired] = useState(!valid);
  const [manual, setManual] = useState("");

  async function send(code: string) {
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      if (res.status === 410) setExpired(true);
      if (!res.ok) scanFeedback(false);
      setSent((s) => [{ code, ok: res.ok, at: Date.now() }, ...s].slice(0, 30));
    } catch {
      scanFeedback(false);
      setSent((s) => [{ code, ok: false, at: Date.now() }, ...s].slice(0, 30));
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <LogoMark className="size-7" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{orgName}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MonitorSmartphone className="size-3" /> Scanning to your computer
          </p>
        </div>
      </header>
      {expired ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <XCircle className="size-10 text-destructive" />
          <h1 className="text-lg font-semibold">Pairing expired</h1>
          <p className="text-sm text-muted-foreground">Open “Use phone as scanner” on the computer and scan the new QR code.</p>
        </div>
      ) : (
        <main className="flex flex-1 flex-col gap-4 p-4">
          <CameraScanner onScan={send} className="aspect-[3/4] w-full sm:aspect-video" />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) send(manual.trim());
              setManual("");
            }}
          >
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type a barcode" aria-label="Type a barcode" inputMode="text" />
            <Button type="submit" variant="secondary">
              <Keyboard /> Send
            </Button>
          </form>
          <section aria-live="polite">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Sent ({sent.length})</h2>
            <ul className="divide-y rounded-lg border">
              {sent.length === 0 && <li className="p-3 text-sm text-muted-foreground">Point the camera at a barcode.</li>}
              {sent.map((s) => (
                <li key={s.at} className="flex items-center gap-2 p-3 font-mono text-sm">
                  {s.ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}
                  {s.code}
                </li>
              ))}
            </ul>
          </section>
        </main>
      )}
    </div>
  );
}
