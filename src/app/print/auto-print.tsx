"use client";
import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the print dialog once fonts/images are ready (used with ?auto=1). */
export function AutoPrint({ auto }: { auto: boolean }) {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    if (!auto) return;
    const go = () => setTimeout(() => window.print(), 150);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, [auto]);
  return (
    <div className="fixed right-4 top-4 flex gap-2 print:hidden">
      <Button onClick={() => window.print()}>
        <Printer /> Print
      </Button>
    </div>
  );
}
