"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Printer } from "lucide-react";
import { billMessage } from "@/lib/bill-message";
import { billShareLink } from "@/server/actions/sales";
import { useOrg } from "@/components/app/org-context";
import { loadProfile } from "@/components/print/printer";
import { printLocal, printSale } from "@/components/print/use-print-sale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { WhatsAppShare } from "@/components/sales/whatsapp-share";

export interface CompletedSale {
  /** null for bills saved offline on this device (printed from `local`). */
  saleId: string | null;
  local?: import("@/lib/receipt").ReceiptData;
  number: string;
  total: number;
  change: number;
  paidCash: boolean;
  customerPhone: string;
}

export function SaleComplete({ sale, onNext }: { sale: CompletedSale | null; onNext: () => void }) {
  useEffect(() => {
    if (!sale) return;
    const p = loadProfile();
    if (!p.autoPrint) return;
    if (sale.local) void printLocal(sale.local, { drawer: p.openDrawer && sale.paidCash });
    else if (sale.saleId) void printSale(sale.saleId, { drawer: p.openDrawer && sale.paidCash });
  }, [sale]);

  return <SaleCompleteDialog key={sale?.number ?? "none"} sale={sale} onNext={onNext} />;
}

function SaleCompleteDialog({ sale, onNext }: { sale: CompletedSale | null; onNext: () => void }) {
  const org = useOrg();
  const [shared, setShared] = useState<string | null>(null);

  // Online bills get the full message with a link to the bill; offline ones are built locally.
  useEffect(() => {
    if (!sale?.saleId) return;
    let live = true;
    billShareLink({ saleId: sale.saleId })
      .then((r) => live && r.ok && setShared(r.data.text))
      .catch(() => undefined); // offline or navigated away: the short message is used instead
    return () => {
      live = false;
    };
  }, [sale?.saleId]);

  const message = (sale?.local ? billMessage(sale.local, null) : shared) ?? `Thank you for shopping at ${org.orgName}! Your bill ${sale?.number} for ${org.money(sale?.total ?? 0)}.`;

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onNext()}>
      <DialogContent className="sm:max-w-md" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onNext(); } }}>
        <DialogHeader className="items-center text-center">
          <CheckCircle2 className="size-14 text-success" />
          <DialogTitle className="text-xl">Sale complete</DialogTitle>
          <DialogDescription>Bill {sale?.number}{sale?.local && " · saved on this device, will sync when online"}</DialogDescription>
        </DialogHeader>
        {sale && (
          <>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-semibold tabular-nums">{org.money(sale.total)}</p>
              </div>
              <div className={`rounded-lg p-3 ${sale.change ? "bg-warning/20" : "bg-muted/60"}`}>
                <p className="text-xs text-muted-foreground">Change</p>
                <p className="text-xl font-semibold tabular-nums">{org.money(sale.change)}</p>
              </div>
            </div>
            <WhatsAppShare text={message} defaultPhone={sale.customerPhone} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => (sale.local ? printLocal(sale.local) : sale.saleId && printSale(sale.saleId, { format: "thermal" }))}>
                <Printer /> Receipt
              </Button>
              <Button variant="outline" disabled={!sale.saleId} title={sale.saleId ? undefined : "Available after the bill syncs"} onClick={() => sale.saleId && printSale(sale.saleId, { format: "a4" })}>
                <FileText /> A4 invoice
              </Button>
            </div>
            <Button size="lg" className="h-11 w-full" onClick={onNext} autoFocus>
              New sale <Kbd className="ml-2 bg-primary-foreground/20 text-primary-foreground">Enter</Kbd>
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
