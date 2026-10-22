"use client";
import { toast } from "sonner";
import { receiptToEscPos, type ReceiptData } from "@/lib/receipt";
import { receiptHtml } from "@/lib/receipt-html";
import { receiptData } from "@/server/actions/sales";
import { browserPrint, loadProfile, sendRaw } from "./printer";

/** Prints a sale with this device's printer profile, falling back to the browser dialog. */
export async function printSale(saleId: string, opts: { format?: "thermal" | "a4"; drawer?: boolean } = {}) {
  const p = loadProfile();
  const format = opts.format ?? p.invoiceFormat;
  if (format === "a4") return browserPrint(`/print/invoice/${saleId}?auto=1`);
  if (p.transport === "browser") return browserPrint(`/print/receipt/${saleId}?auto=1&w=${p.width}`);
  const res = await receiptData({ saleId });
  if (!res.ok) return toast.error(res.error);
  try {
    await sendRaw(p, receiptToEscPos({ ...res.data, org: { ...res.data.org, paperWidth: p.width } }, { openDrawer: opts.drawer ?? p.openDrawer }));
    toast.success("Receipt sent to printer");
  } catch (e) {
    toast.error((e as Error).message || "Printer not reachable", { description: "Opening the browser print dialog instead." });
    browserPrint(`/print/receipt/${saleId}?auto=1&w=${p.width}`);
  }
}

/** Opens the cash drawer without printing (kick pulse only). */
export async function kickDrawer() {
  const p = loadProfile();
  if (p.transport === "browser") return toast.error("Opening the drawer needs a directly connected printer (USB, Serial, Bluetooth or bridge).");
  try {
    await sendRaw(p, Uint8Array.from([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]));
  } catch (e) {
    toast.error((e as Error).message);
  }
}

/** Prints a receipt built on this device (offline bills): ESC/POS when available, else a local page. */
export async function printLocal(receipt: ReceiptData, opts: { drawer?: boolean } = {}) {
  const p = loadProfile();
  const data = { ...receipt, org: { ...receipt.org, paperWidth: p.width } };
  if (p.transport !== "browser") {
    try {
      await sendRaw(p, receiptToEscPos(data, { openDrawer: opts.drawer ?? p.openDrawer }));
      return;
    } catch (e) {
      toast.error((e as Error).message || "Printer not reachable", { description: "Opening the browser print dialog instead." });
    }
  }
  document.getElementById("print-frame")?.remove();
  const f = document.createElement("iframe");
  f.id = "print-frame";
  f.title = "Print";
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  f.srcdoc = receiptHtml(data);
  f.onload = () => f.contentWindow?.print();
  document.body.appendChild(f);
}
