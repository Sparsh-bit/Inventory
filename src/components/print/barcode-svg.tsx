"use client";
import { useMemo } from "react";
import { toSVG } from "bwip-js/browser";
import { isValidEan13 } from "@/lib/ean13";

/** Renders EAN-13 when the code is a valid EAN-13, otherwise Code 128. */
export function BarcodeSvg({ code, height = 10, className, showText = true }: { code: string; height?: number; className?: string; showText?: boolean }) {
  const svg = useMemo(() => {
    const text = code.replace(/[^\x20-\x7e]/g, "");
    if (!text) return "";
    try {
      return toSVG({ bcid: isValidEan13(text) ? "ean13" : "code128", text, height, includetext: showText, textxalign: "center", textsize: 9 });
    } catch {
      return "";
    }
  }, [code, height, showText]);
  if (!svg) return <span className="text-xs text-destructive">Invalid barcode</span>;
  // SVG produced locally by bwip-js from a sanitised ASCII string (no user markup).
  return <span className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}
