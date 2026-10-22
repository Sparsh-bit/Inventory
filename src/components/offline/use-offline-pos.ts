"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fiscalYear, offlineNumber } from "@/lib/numbering";
import type { ReceiptData } from "@/lib/receipt";
import { computeBill } from "@/lib/tax";
import { getPosSnapshot, registerTill, syncOfflineSales } from "@/server/actions/offline";
import type { VariantHit } from "@/server/services/products";
import type { PosSnapshot } from "@/server/services/offline";
import type { CartLine, PosCustomer } from "@/components/pos/types";
import { getSnapshot, getTill, listQueued, nextOfflineSeq, queueSale, removeQueued, setSnapshot, setTill, type QueuedSale, type Till } from "./store";
import { useOnline } from "./use-online";

const REFRESH_MS = 10 * 60 * 1000;

function deviceName() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Device";
  return `Till on ${os}`;
}

export interface OfflineCheckout {
  lines: CartLine[];
  customer: PosCustomer | null;
  billDiscount: number;
  kind: "receipt" | "tax_invoice";
  payments: { method: "cash" | "card" | "upi" | "credit" | "other"; amount: number; reference: string }[];
  locationId: string;
  cashierName: string;
  clientId?: string;
}

export function useOfflinePos(orgId: string, locationId: string) {
  const online = useOnline();
  const [till, setTillState] = useState<Till | null>(null);
  const [snapshot, setSnap] = useState<PosSnapshot | null>(null);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshPending = useCallback(() => listQueued(orgId).then((q) => setPending(q.length)).catch(() => undefined), [orgId]);

  // Till identity + catalogue snapshot (cached copy first, fresh copy when online).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let t = await getTill(orgId);
        if (!t && navigator.onLine) {
          const r = await registerTill({ name: deviceName() });
          if (r.ok) {
            t = r.data;
            await setTill(orgId, t);
          }
        }
        if (alive && t) setTillState(t);
        const cached = await getSnapshot(orgId, locationId);
        if (alive && cached) setSnap(cached);
        await refreshPending();
      } catch {
        /* IndexedDB unavailable (private mode): offline selling is simply not offered */
      }
    })();
    return () => {
      alive = false;
    };
  }, [orgId, locationId, refreshPending]);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await getPosSnapshot({ locationId });
        if (r.ok && alive) {
          setSnap(r.data);
          await setSnapshot(orgId, r.data);
        }
      } catch {
        /* network blip: keep the cached snapshot */
      }
    };
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [online, orgId, locationId]);

  const sync = useCallback(async () => {
    if (syncingRef.current || !till || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const queue = (await listQueued(orgId)).filter((q) => !q.error);
      let done = 0;
      const review: string[] = [];
      for (let i = 0; i < queue.length; i += 20) {
        const batch = queue.slice(i, i + 20);
        const r = await syncOfflineSales({ deviceToken: till.token, sales: batch.map((b) => b.payload) as never });
        if (!r.ok) {
          toast.error(`Sync paused: ${r.error}`);
          break;
        }
        for (const res of r.data) {
          const q = batch.find((b) => b.clientId === res.clientId)!;
          if (res.status === "rejected") await queueSale({ ...q, error: res.error });
          else {
            await removeQueued(res.clientId);
            done++;
            if (res.issues?.length) review.push(res.number);
          }
        }
      }
      if (done) toast.success(`${done} offline bill${done === 1 ? "" : "s"} synced`, review.length ? { description: `${review.length} need a manager's review (Sales → Needs review).` } : undefined);
    } catch {
      /* still offline; will retry */
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refreshPending();
    }
  }, [orgId, till, refreshPending]);

  // Auto-sync whenever we're online with queued bills.
  useEffect(() => {
    if (online && pending > 0 && till) void sync();
  }, [online, pending, till, sync]);

  const lookupLocal = useCallback(
    (code: string): VariantHit | null => {
      if (!snapshot) return null;
      const c = code.trim();
      const hit = snapshot.variants.find((v) => v.barcode === c || v.sku === c);
      if (hit) return hit;
      const sn = snapshot.serials.find((s) => s.serial === c);
      const v = sn && snapshot.variants.find((x) => x.variantId === sn.variantId);
      return v ? { ...v, serial: sn.serial } : null;
    },
    [snapshot],
  );

  const searchLocal = useCallback(
    (q: string) => {
      if (!snapshot) return [];
      const t = q.trim().toLowerCase();
      return snapshot.variants.filter((v) => !t || v.name.toLowerCase().includes(t) || v.variantName.toLowerCase().includes(t) || v.sku.toLowerCase().includes(t) || v.barcode === q.trim()).slice(0, 40);
    },
    [snapshot],
  );

  const customersLocal = useCallback(
    (q: string): PosCustomer[] => {
      if (!snapshot) return [];
      const t = q.trim().toLowerCase();
      return snapshot.customers.filter((c) => !t || c.name.toLowerCase().includes(t) || c.phone.includes(t) || c.taxId.toLowerCase().includes(t)).slice(0, 20);
    },
    [snapshot],
  );

  /** Saves a bill on this device with its final number from the till's own series. */
  const checkoutOffline = useCallback(
    async (o: OfflineCheckout): Promise<{ number: string; receipt: ReceiptData; total: number } | null> => {
      if (!till || !snapshot) {
        toast.error("This device isn't ready for offline billing yet. Open the POS once while online.");
        return null;
      }
      const s = snapshot.settings;
      const now = new Date();
      const fy = fiscalYear(now, s.fiscalYearStartMonth, s.timezone);
      const prefix = o.kind === "tax_invoice" ? s.prefixes.invoice : s.prefixes.sale;
      const seq = await nextOfflineSeq(orgId, `${prefix}:${fy}`);
      const number = offlineNumber(prefix, till.code, fy, seq);
      const interState = s.taxMode === "GST" && !!o.customer?.stateCode && !!s.stateCode && o.customer.stateCode !== s.stateCode;
      const bill = computeBill({
        lines: o.lines.map((l) => ({ unitPrice: l.unitPrice, qty: l.qty, scale: l.hit.scale, discount: l.discount, rateBp: l.hit.rateBp, cessBp: l.hit.cessBp, inclusive: l.hit.inclusive })),
        billDiscount: o.billDiscount, mode: s.taxMode, interState, roundOff: s.roundOff,
      });
      const tendered = o.payments.reduce((a, p) => a + p.amount, 0);
      const cash = o.payments.filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0);
      const credit = o.payments.filter((p) => p.method === "credit").reduce((a, p) => a + p.amount, 0);
      const change = Math.min(cash, Math.max(0, tendered - bill.grandTotal));
      const balanceDue = Math.max(0, bill.grandTotal - (tendered - credit - change));
      const clientId = o.clientId ?? crypto.randomUUID();

      const summary = new Map<number, { rateBp: number; taxable: number; cgst: number; sgst: number; igst: number; vat: number; cess: number }>();
      bill.lines.forEach((bl, i) => {
        const r = summary.get(o.lines[i].hit.rateBp) ?? { rateBp: o.lines[i].hit.rateBp, taxable: 0, cgst: 0, sgst: 0, igst: 0, vat: 0, cess: 0 };
        r.taxable += bl.taxable; r.cgst += bl.cgst; r.sgst += bl.sgst; r.igst += bl.igst; r.vat += bl.vat; r.cess += bl.cess;
        summary.set(r.rateBp, r);
      });
      const receipt: ReceiptData = {
        org: {
          name: s.orgName, legalName: s.legalName, address: s.address, phone: s.phone, email: s.email, taxId: s.taxId, taxMode: s.taxMode, logoUrl: s.logoUrl,
          header: s.receipt.header, footer: s.receipt.footer, terms: "", upiId: s.receipt.upiId, showUpiQr: s.receipt.showUpiQr, showHsn: s.receipt.showHsn,
          currency: s.currency, locale: s.locale, timezone: s.timezone, paperWidth: s.receipt.paperWidth,
        },
        sale: {
          id: clientId, number, kind: o.kind, status: "completed", cashier: o.cashierName, location: "",
          date: now.toLocaleString(s.locale, { timeZone: s.timezone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
          customer: o.customer ? { name: o.customer.name, phone: o.customer.phone, taxId: o.customer.taxId, address: "" } : null, placeOfSupply: o.customer?.stateCode || s.stateCode, interState,
          lines: o.lines.map((l, i) => ({
            name: [l.hit.name, l.hit.variantName].filter(Boolean).join(" - "), sku: l.hit.sku, hsn: l.hit.hsn, qty: l.qty, scale: l.hit.scale, unit: l.hit.unit, unitPrice: l.unitPrice,
            mrp: l.hit.mrp, discount: bill.lines[i].discount, taxable: bill.lines[i].taxable, rateBp: l.hit.rateBp, tax: bill.lines[i].tax, total: bill.lines[i].total, batchNo: "", serials: l.serials,
          })),
          subtotal: bill.subtotal, discountTotal: bill.discountTotal, taxableTotal: bill.taxableTotal, cgst: bill.cgst, sgst: bill.sgst, igst: bill.igst, vat: bill.vat, cess: bill.cess,
          taxTotal: bill.taxTotal, roundOff: bill.roundOff, grandTotal: bill.grandTotal, payments: o.payments.filter((p) => p.amount > 0), change,
          balanceDue: o.customer ? balanceDue : 0, returnOfNumber: null, notes: "", taxSummary: [...summary.values()].filter((t) => t.cgst || t.sgst || t.igst || t.vat || t.cess),
        },
      };
      const queued: QueuedSale = {
        clientId, orgId, number, createdAt: now.toISOString(), receipt,
        payload: {
          clientId, number, createdAt: now.toISOString(), locationId: o.locationId, customerId: o.customer?.id ?? null, kind: o.kind, billDiscount: o.billDiscount, notes: "",
          lines: o.lines.map((l) => ({ variantId: l.hit.variantId, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, serials: l.serials })),
          payments: o.payments.filter((p) => p.amount > 0), grandTotal: bill.grandTotal,
        },
      };
      await queueSale(queued);
      // Keep the local snapshot honest so the next offline bill sees reduced stock and sold serials.
      const sold = new Set(o.lines.flatMap((l) => l.serials));
      const qty = new Map<string, number>();
      for (const l of o.lines) qty.set(l.hit.variantId, (qty.get(l.hit.variantId) ?? 0) + l.qty);
      const next = { ...snapshot, variants: snapshot.variants.map((v) => (qty.has(v.variantId) ? { ...v, stock: v.stock - qty.get(v.variantId)! } : v)), serials: snapshot.serials.filter((x) => !sold.has(x.serial)) };
      setSnap(next);
      await setSnapshot(orgId, next);
      await refreshPending();
      return { number, receipt, total: bill.grandTotal };
    },
    [orgId, till, snapshot, refreshPending],
  );

  return { online, ready: !!till && !!snapshot, till, snapshot, pending, syncing, sync, lookupLocal, searchLocal, customersLocal, checkoutOffline };
}
