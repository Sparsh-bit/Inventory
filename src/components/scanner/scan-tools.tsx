"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Camera, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { startRemoteScan, stopRemoteScan } from "@/server/actions/sales";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { CameraScanner } from "./camera-scanner";

/** "Scan with camera" button + dialog. Stays open for continuous scanning unless `single`. */
export function CameraScanButton({ onScan, single = false, label = "Camera", variant = "outline" }: { onScan: (code: string) => void; single?: boolean; label?: string; variant?: "outline" | "default" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)} aria-label="Scan with camera">
        <Camera /> <span className="hidden sm:inline">{label}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Scan barcode</DialogTitle>
            <DialogDescription>Hold the barcode inside the frame. {single ? "" : "Keep scanning — items are added as they're read."}</DialogDescription>
          </DialogHeader>
          {open && (
            <CameraScanner
              className="aspect-video w-full"
              onScan={(code) => {
                onScan(code);
                if (single) setOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Pair a phone as a wireless scanner for this screen (QR → /scan/{token} → SSE back here). */
export function PhoneScanButton({ onScan }: { onScan: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<{ token: string; qr: string } | null>(null);
  const [connected, setConnected] = useState(false);
  const cb = useRef(onScan);
  useEffect(() => {
    cb.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!session) return;
    const es = new EventSource(`/api/scan/${encodeURIComponent(session.token)}/stream`);
    es.addEventListener("ready", () => setConnected(true));
    es.addEventListener("scan", (e) => cb.current(JSON.parse((e as MessageEvent).data).code));
    es.addEventListener("expired", () => {
      es.close();
      setSession(null);
      setConnected(false);
      toast.info("Phone scanner disconnected");
    });
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [session]);

  async function start() {
    setOpen(true);
    if (session) return;
    const res = await startRemoteScan({});
    if (!res.ok) return toast.error(res.error);
    const url = `${window.location.origin}/scan/${res.data.token}`;
    setSession({ token: res.data.token, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }) });
  }

  async function stop() {
    if (session) await stopRemoteScan({ token: session.token });
    setSession(null);
    setConnected(false);
    setOpen(false);
  }

  return (
    <>
      <Button type="button" variant={session ? "secondary" : "outline"} onClick={start} aria-label="Use phone as scanner">
        <Smartphone className={session && connected ? "text-success" : ""} /> <span className="hidden lg:inline">{session ? "Phone linked" : "Phone"}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Use your phone as a scanner</DialogTitle>
            <DialogDescription>Scan this QR code with your phone camera. Sign in with an account from this business, then every barcode your phone reads appears here.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {session ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.qr} alt="Pairing QR code" className="size-60 rounded-lg border bg-white p-2" />
            ) : (
              <div className="grid size-60 place-items-center"><Spinner /></div>
            )}
            <p className="text-sm text-muted-foreground">{connected ? "Listening for scans…" : "Connecting…"}</p>
            {session && (
              <Button variant="outline" onClick={stop} className="w-full">
                Disconnect phone
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
