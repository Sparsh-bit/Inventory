"use client";
import { useEffect, useRef } from "react";
import { createScanDetector } from "@/lib/scan-detector";
import { useOrg } from "@/components/app/org-context";

const isEditable = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !el.readOnly;

/** Remove scanner keystrokes that landed in a focused text box, keeping React state in sync. */
function stripFromInput(el: HTMLInputElement | HTMLTextAreaElement, code: string) {
  if (!el.value.endsWith(code)) return;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  setter?.call(el, el.value.slice(0, -code.length));
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Listens for USB/Bluetooth keyboard-wedge scanners anywhere on the page.
 * Fields marked `data-scan-field` keep the scanned text (e.g. a barcode input) and never
 * submit their form on the scanner's Enter.
 */
export function useScanner(onScan: (code: string) => void, enabled = true) {
  const { scanner } = useOrg();
  const cb = useRef(onScan);
  useEffect(() => {
    cb.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    let target: Element | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const detector = createScanDetector({
      interKeyMs: scanner.interKeyMs,
      minLength: scanner.minLength,
      onScan: (code) => {
        const el = target;
        if (el?.closest("[data-scan-field]")) return;
        if (isEditable(el)) stripFromInput(el, code);
        cb.current(code);
      },
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      target = document.activeElement;
      clearTimeout(flushTimer);
      if (detector.handleKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key.length === 1) flushTimer = setTimeout(() => detector.flush(), scanner.interKeyMs * 3);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(flushTimer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [enabled, scanner.interKeyMs, scanner.minLength]);
}

let audioCtx: AudioContext | null = null;
/** Short confirmation beep + haptic tick. */
export function scanFeedback(ok = true) {
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = ok ? 1250 : 320;
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (ok ? 0.09 : 0.25));
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + (ok ? 0.1 : 0.26));
  } catch {}
  // Browsers reject vibration before the first user tap (and log an error), so check first.
  if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) navigator.vibrate?.(ok ? 40 : [60, 40, 60]);
}
