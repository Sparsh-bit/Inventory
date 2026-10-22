"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Flashlight, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { scanFeedback } from "./use-scanner";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o?: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
const WANTED = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code", "data_matrix"];

/**
 * Live camera barcode scanner. Uses the native BarcodeDetector (Android/Chrome) and falls back
 * to ZXing (iOS Safari, desktop Firefox). Calls onScan for each new code; ignores repeats
 * of the same code within `repeatMs`.
 */
export function CameraScanner({ onScan, repeatMs = 1500, className = "" }: { onScan: (code: string) => void; repeatMs?: number; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "running" | "denied" | "unavailable" | "insecure">("starting");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdx, setDeviceIdx] = useState(-1);
  const [torch, setTorch] = useState<boolean | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const stream = useRef<MediaStream | null>(null);
  const cb = useRef(onScan);
  useEffect(() => {
    cb.current = onScan;
  }, [onScan]);

  const emit = useCallback(
    (code: string) => {
      const now = Date.now();
      if (code === last.current.code && now - last.current.at < repeatMs) return;
      last.current = { code, at: now };
      scanFeedback(true);
      cb.current(code);
    },
    [repeatMs],
  );

  useEffect(() => {
    let cancelled = false;
    let stopLoop: (() => void) | undefined;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus(window.isSecureContext ? "unavailable" : "insecure");
        return;
      }
      try {
        const deviceId = deviceIdx >= 0 ? devices[deviceIdx]?.deviceId : undefined;
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const el = video.current!;
        el.srcObject = s;
        await el.play().catch(() => undefined);
        const track = s.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(caps.torch ? false : null);
        if (!devices.length) {
          const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
          if (!cancelled) setDevices(all);
        }
        setStatus("running");

        const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        const supported = Native?.getSupportedFormats ? (await Native.getSupportedFormats()).filter((f) => WANTED.includes(f)) : [];
        if (Native && supported.length) {
          const detector = new Native({ formats: supported });
          let busy = false;
          const timer = setInterval(async () => {
            if (busy || el.readyState < 2) return;
            busy = true;
            try {
              const found = await detector.detect(el);
              if (found[0]?.rawValue) emit(found[0].rawValue.trim());
            } catch {}
            busy = false;
          }, 120);
          stopLoop = () => clearInterval(timer);
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120 });
          const controls = await reader.decodeFromStream(s, el, (result) => {
            if (result) emit(result.getText().trim());
          });
          stopLoop = () => controls.stop();
        }
        if (cancelled) stopLoop?.();
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException)?.name;
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      }
    })();
    return () => {
      cancelled = true;
      stopLoop?.();
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
    // devices is only read to choose a camera; changing deviceIdx restarts the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIdx, emit]);

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {}
  }

  return (
    <div className={`relative overflow-hidden rounded-xl bg-black ${className}`}>
      <video ref={video} className="size-full object-cover" muted playsInline autoPlay aria-label="Camera preview" />
      {status === "running" && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[38%] -translate-y-1/2 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
            <div className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-red-500/80" />
          </div>
          <div className="absolute bottom-3 right-3 flex gap-2">
            {torch !== null && (
              <Button type="button" size="icon" variant="secondary" onClick={toggleTorch} aria-label={torch ? "Turn off flashlight" : "Turn on flashlight"} aria-pressed={torch}>
                <Flashlight />
              </Button>
            )}
            {devices.length > 1 && (
              <Button type="button" size="icon" variant="secondary" onClick={() => setDeviceIdx((i) => (i + 1) % devices.length)} aria-label="Switch camera">
                <SwitchCamera />
              </Button>
            )}
          </div>
        </>
      )}
      {status !== "running" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white">
          {status === "starting" ? (
            <>
              <Spinner className="size-6" /> Starting camera…
            </>
          ) : (
            <>
              {status === "denied" ? <CameraOff className="size-8" /> : <Camera className="size-8" />}
              <p className="max-w-xs">
                {status === "denied" && "Camera access was blocked. Allow camera permission for this site in your browser settings, then try again."}
                {status === "unavailable" && "No camera found on this device."}
                {status === "insecure" && "The camera only works over HTTPS. Open the app using its https:// address."}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
