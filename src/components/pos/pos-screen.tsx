"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CirclePause, History, Package, Percent, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatQty } from "@/lib/format";
import { fromMinor, toMinor } from "@/lib/money";
import { computeBill } from "@/lib/tax";
import { searchProducts, lookupCode } from "@/server/actions/products";
import { checkout, holdBill, resumeHeldBill } from "@/server/actions/sales";
import type { VariantHit } from "@/server/services/products";
import { useOrg } from "@/components/app/org-context";
import { SelectField } from "@/components/app/select-field";
import { useSearch } from "@/components/app/use-search";
import { CameraScanButton, PhoneScanButton } from "@/components/scanner/scan-tools";
import { scanFeedback, useScanner } from "@/components/scanner/use-scanner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { CartLineRow } from "./cart-line";
import { CustomerPicker } from "./customer-picker";
import { HeldBills } from "./held-bills";
import { PaymentDialog, type Tender } from "./payment-dialog";
import { SerialDialog } from "./serial-dialog";
import { OfflineStatus } from "@/components/offline/offline-status";
import { useOfflinePos } from "@/components/offline/use-offline-pos";
import { isNetworkError } from "@/components/offline/use-online";
import { SaleComplete, type CompletedSale } from "./sale-complete";
import type { CartLine, PosConfig, PosCustomer } from "./types";

const LOC_KEY = "stockpilot.pos.location";
const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const readStorage = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export function PosScreen({ locations, quick, config }: { locations: { id: string; name: string }[]; quick: VariantHit[]; config: PosConfig }) {
  const org = useOrg();
  const router = useRouter();
  const storedLoc = useSyncExternalStore(subscribeStorage, () => readStorage(LOC_KEY), () => null);
  const [pickedLoc, setLocationId] = useState<string | null>(null);
  const locationId = pickedLoc ?? (storedLoc && locations.some((l) => l.id === storedLoc) ? storedLoc : (locations[0]?.id ?? ""));
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [billDiscount, setBillDiscount] = useState(0);
  const [kind, setKind] = useState<"receipt" | "tax_invoice">("receipt");
  const [heldId, setHeldId] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [done, setDone] = useState<CompletedSale | null>(null);
  const [paying, startPay] = useTransition();
  const [holding, startHold] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const offline = useOfflinePos(org.orgId, locationId);
  const term = q.trim();
  const search = useSearch(term ? `${term}|${locationId}|${offline.online}` : null, async () => {
    if (!navigator.onLine) return offline.searchLocal(term);
    try {
      const r = await searchProducts({ q: term, locationId });
      return r.ok ? r.data : [];
    } catch {
      return offline.searchLocal(term);
    }
  }, 180);
  const results = term ? search.data : null;
  const searching = search.loading;

  const interState = org.taxMode === "GST" && !!customer?.stateCode && !!config.orgStateCode && customer.stateCode !== config.orgStateCode;
  const bill = useMemo(
    () =>
      computeBill({
        lines: lines.map((l) => ({ unitPrice: l.unitPrice, qty: l.qty, scale: l.hit.scale, discount: l.discount, rateBp: l.hit.rateBp, cessBp: l.hit.cessBp, inclusive: l.hit.inclusive })),
        billDiscount, mode: org.taxMode, interState, roundOff: config.roundOff,
      }),
    [lines, billDiscount, org.taxMode, interState, config.roundOff],
  );
  const itemCount = lines.reduce((a, l) => a + (l.hit.scale === 1 ? l.qty : 1), 0);

  const [serialFor, setSerialFor] = useState<{ hit: VariantHit; key: string | null; serials: string[] } | null>(null);

  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  });

  const addHit = useCallback((hit: VariantHit, qty?: number) => {
    if (hit.trackSerial) {
      const existing = linesRef.current.find((l) => l.hit.variantId === hit.variantId);
      if (!hit.serial) {
        // No specific unit scanned: ask which serial(s) are being sold.
        setSerialFor({ hit, key: existing?.key ?? null, serials: existing?.serials ?? [] });
        return;
      }
      if (existing?.serials.includes(hit.serial)) {
        toast.error(`${hit.serial} is already in the cart`);
        return;
      }
      const serial = hit.serial;
      setLines((ls) => {
        const cur = ls.find((l) => l.hit.variantId === hit.variantId);
        if (cur) {
          const serials = [...cur.serials, serial];
          return [{ ...cur, serials, qty: serials.length }, ...ls.filter((l) => l.key !== cur.key)];
        }
        return [{ key: crypto.randomUUID(), hit, qty: 1, discount: 0, unitPrice: hit.salePrice, batchId: null, serials: [serial] }, ...ls];
      });
      return;
    }
    setLines((ls) => {
      const i = ls.findIndex((l) => l.hit.variantId === hit.variantId && !l.batchId);
      if (i >= 0) {
        const copy = [...ls];
        copy[i] = { ...copy[i], qty: copy[i].qty + (qty ?? hit.scale) };
        return [copy[i], ...copy.filter((_, j) => j !== i)];
      }
      return [{ key: crypto.randomUUID(), hit, qty: qty ?? hit.scale, discount: 0, unitPrice: hit.salePrice, batchId: null, serials: [] }, ...ls];
    });
  }, []);

  const handleCode = useCallback(
    async (code: string) => {
      let found: VariantHit | null = null;
      if (navigator.onLine) {
        try {
          const res = await lookupCode({ code, locationId });
          found = res.ok ? res.data : null;
        } catch (e) {
          if (!isNetworkError(e)) throw e;
          found = offline.lookupLocal(code);
        }
      } else found = offline.lookupLocal(code);
      if (found) {
        scanFeedback(true);
        addHit(found);
        return;
      }
      scanFeedback(false);
      toast.error(`No product with code ${code}`, {
        action: org.can("products:write") ? { label: "Create", onClick: () => router.push(`/products/new?barcode=${encodeURIComponent(code)}`) } : undefined,
      });
    },
    [locationId, addHit, org, router, offline],
  );

  useScanner(handleCode, !payOpen && !done && !serialFor);

  function payload() {
    return {
      locationId, customerId: customer?.id ?? null, billDiscount, kind, notes: "", heldId,
      lines: lines.map((l) => ({ variantId: l.hit.variantId, qty: l.qty, discount: l.discount, batchId: l.batchId, ...(l.serials.length ? { serials: l.serials } : {}), ...(l.unitPrice !== l.hit.salePrice ? { unitPrice: l.unitPrice } : {}) })),
    };
  }

  function reset() {
    setLines([]);
    setCustomer(null);
    setBillDiscount(0);
    setKind("receipt");
    setHeldId(undefined);
    setQ("");
    setCartOpen(false);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function pay(tenders: Tender[]) {
    startPay(async () => {
      const paid = tenders.reduce((a, t) => a + t.amount, 0);
      const clientId = crypto.randomUUID();
      const finish = (saleId: string | null, number: string, local?: CompletedSale["local"]) => {
        setPayOpen(false);
        setDone({ saleId, number, total: bill.grandTotal, change: Math.max(0, paid - bill.grandTotal), paidCash: tenders.some((t) => t.method === "cash"), customerPhone: customer?.phone ?? "", local });
      };
      const sellOffline = async () => {
        const r = await offline.checkoutOffline({ lines, customer, billDiscount, kind, payments: tenders, locationId, cashierName: org.userName, clientId });
        if (r) finish(null, r.number, r.receipt);
      };
      if (!navigator.onLine) return void (await sellOffline());
      try {
        const res = await checkout({ ...payload(), payments: tenders, clientId });
        if (!res.ok) return void toast.error(res.error);
        finish(res.data.saleId, res.data.number);
        router.refresh();
      } catch (e) {
        // Connection dropped mid-sale: save it offline with the same clientId (sync de-duplicates).
        if (isNetworkError(e)) await sellOffline();
        else toast.error("Something went wrong. Please try again.");
      }
    });
  }

  function hold() {
    if (!lines.length) return;
    if (!offline.online) return void toast.error("Holding bills needs an internet connection.");
    startHold(async () => {
      const res = await holdBill({ ...payload(), payments: [] });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Bill held. Find it under Held bills (F9).");
      reset();
    });
  }

  async function resume(id: string) {
    if (lines.length && !confirm("Replace the current cart with the held bill?")) return;
    const res = await resumeHeldBill({ id });
    if (!res.ok) return void toast.error(res.error);
    setLines(res.data.lines.map((l) => ({ key: crypto.randomUUID(), hit: l.hit!, qty: l.qty, discount: l.discount, unitPrice: l.unitPrice, batchId: null, serials: l.serials ?? [] })));
    setCustomer(res.data.customer);
    setBillDiscount(res.data.billDiscount);
    setKind(res.data.kind);
    setHeldId(res.data.id);
    setHeldOpen(false);
  }

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F4" && lines.length) {
        e.preventDefault();
        setPayOpen(true);
      } else if (e.key === "F8") {
        e.preventDefault();
        hold();
      } else if (e.key === "F9") {
        e.preventDefault();
        setHeldOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const grid = results ?? quick;
  const cart = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b p-3">
        <CustomerPicker offlineSearch={offline.online ? undefined : offline.customersLocal} value={customer} onChange={(c) => { setCustomer(c); if (!c) setKind("receipt"); }} />
      </div>
      {lines.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingCart />
            </EmptyMedia>
            <EmptyTitle>Cart is empty</EmptyTitle>
            <EmptyDescription>Scan a barcode or tap a product to start a bill.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto" aria-label="Cart items">
          {lines.map((l, i) => (
            <CartLineRow
              key={l.key}
              line={l}
              total={bill.lines[i]?.total ?? 0}
              locationId={locationId}
              allowNegative={config.allowNegativeStock}
              onChange={(patch) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))}
              onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              onEditSerials={() => setSerialFor({ hit: l.hit, key: l.key, serials: l.serials })}
            />
          ))}
        </ul>
      )}
      <div className="space-y-1.5 border-t bg-muted/30 p-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal · {itemCount} item{itemCount === 1 ? "" : "s"}</span>
          <span className="tabular-nums">{org.money(bill.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <BillDiscount value={billDiscount} onChange={setBillDiscount} disabled={!lines.length} />
          <span className="tabular-nums">{bill.discountTotal ? `−${org.money(bill.discountTotal)}` : org.money(0)}</span>
        </div>
        {bill.taxTotal > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>{org.taxMode === "GST" ? (interState ? "IGST" : "GST (CGST + SGST)") : "Tax"}</span>
            <span className="tabular-nums">{org.money(bill.taxTotal)}</span>
          </div>
        )}
        {bill.roundOff !== 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Round off</span>
            <span className="tabular-nums">{org.money(bill.roundOff)}</span>
          </div>
        )}
        <div className="flex items-end justify-between pt-1">
          <span className="font-medium">Total</span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{org.money(bill.grandTotal)}</span>
        </div>
        <div className="grid grid-cols-[auto_auto_1fr] gap-2 pt-2">
          <Button variant="outline" size="lg" onClick={hold} disabled={!lines.length || holding} aria-label="Hold bill (F8)" title="Hold bill (F8)">
            {holding ? <Spinner /> : <CirclePause />}
          </Button>
          <Button variant="outline" size="lg" onClick={() => lines.length && confirm("Clear this bill?") && reset()} disabled={!lines.length} aria-label="Clear bill" title="Clear bill">
            <Trash2 />
          </Button>
          <Button size="lg" className="h-11 text-base" onClick={() => setPayOpen(true)} disabled={!lines.length}>
            Pay {org.money(bill.grandTotal)} <Kbd className="ml-1 hidden bg-primary-foreground/20 text-primary-foreground sm:inline-flex">F4</Kbd>
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0" data-offline-ready={offline.ready || undefined}>
      <h1 className="sr-only">Point of Sale</h1>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <InputGroup className="h-10 min-w-0 flex-1 basis-60">
            <InputGroupAddon>{searching ? <Spinner /> : <Search />}</InputGroupAddon>
            <InputGroupInput
              ref={searchRef}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) {
                  e.preventDefault();
                  if (results?.length === 1) {
                    addHit(results[0]);
                    setQ("");
                  } else handleCode(q.trim()).then(() => setQ(""));
                }
                if (e.key === "Escape") setQ("");
              }}
              placeholder="Search product or scan barcode"
              aria-label="Search product or scan barcode"
            />
            <InputGroupAddon align="inline-end" className="hidden sm:flex">
              <Kbd>F2</Kbd>
            </InputGroupAddon>
          </InputGroup>
          <CameraScanButton onScan={handleCode} />
          <PhoneScanButton onScan={handleCode} />
          <OfflineStatus online={offline.online} pending={offline.pending} syncing={offline.syncing} ready={offline.ready} onSync={offline.sync} />
          <Button variant="outline" onClick={() => setHeldOpen(true)} aria-label="Held bills (F9)" disabled={!offline.online}>
            <History /> <span className="hidden xl:inline">Held</span>
          </Button>
          {locations.length > 1 && (
            <SelectField
              aria-label="Selling location"
              className="w-40"
              value={locationId}
              onValueChange={(v) => {
                if (lines.length) return void toast.error("Finish or clear the current bill before switching location.");
                setLocationId(v);
                try {
                  localStorage.setItem(LOC_KEY, v);
                } catch {}
              }}
              options={locations.map((l) => [l.id, l.name] as const)}
            />
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 lg:pb-3">
          {grid.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Package />
                </EmptyMedia>
                <EmptyTitle>{results ? "No products found" : "No products yet"}</EmptyTitle>
                <EmptyDescription>
                  {results ? "Try another name, SKU or barcode." : (
                    <>Add products first. <Link href="/products/new" className="underline">Create a product</Link></>
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" aria-label={results ? "Search results" : "Products"}>
              {grid.map((h) => (
                <li key={h.variantId}>
                  <button
                    type="button"
                    onClick={() => {
                      addHit(h);
                      if (results) setQ("");
                    }}
                    className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
                  >
                    <span className="grid aspect-[4/3] w-full place-items-center bg-muted/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {h.image ? <img src={h.image} alt="" className="size-full object-cover" /> : <span className="text-2xl font-semibold text-muted-foreground/60">{h.name.slice(0, 2).toUpperCase()}</span>}
                    </span>
                    <span className="flex flex-1 flex-col gap-0.5 p-2.5">
                      <span className="line-clamp-2 text-sm font-medium leading-snug">
                        {h.name}
                        {h.variantName && <span className="text-muted-foreground"> · {h.variantName}</span>}
                      </span>
                      <span className="mt-auto flex items-end justify-between gap-1 pt-1">
                        <span className="font-semibold tabular-nums">{org.money(h.salePrice)}</span>
                        <span className={`text-xs tabular-nums ${h.stock <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {formatQty(h.stock, h.scale)} {h.unit}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <aside className="hidden w-[400px] shrink-0 border-l bg-background lg:block xl:w-[440px]" aria-label="Current bill">
        {cart}
      </aside>

      {/* Mobile: floating cart bar + sheet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
        <Button size="lg" className="h-12 w-full justify-between text-base" onClick={() => setCartOpen(true)}>
          <span className="flex items-center gap-2">
            <ShoppingCart /> {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          <span className="tabular-nums">{org.money(bill.grandTotal)}</span>
        </Button>
      </div>
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="h-[92dvh] gap-0 p-0 lg:hidden">
          <SheetHeader className="border-b">
            <SheetTitle>Current bill</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1">{cart}</div>
        </SheetContent>
      </Sheet>

      <PaymentDialog
        key={payOpen ? `open-${bill.grandTotal}` : "closed"}
        open={payOpen}
        onOpenChange={setPayOpen}
        total={bill.grandTotal}
        hasCustomer={!!customer}
        upiId={config.upiId}
        orgName={config.orgName}
        pending={paying}
        kind={kind}
        onKindChange={setKind}
        onPay={pay}
      />
      {serialFor && (
        <SerialDialog
          hit={serialFor.hit}
          locationId={locationId}
          initial={serialFor.serials}
          onClose={() => setSerialFor(null)}
          onDone={(serials) => {
            const { hit, key } = serialFor;
            setLines((ls) => {
              const rest = ls.filter((l) => l.key !== key);
              const line = ls.find((l) => l.key === key);
              return [{ ...(line ?? { key: crypto.randomUUID(), hit, discount: 0, unitPrice: hit.salePrice, batchId: null }), serials, qty: serials.length }, ...rest];
            });
            setSerialFor(null);
          }}
        />
      )}
      <HeldBills open={heldOpen} onOpenChange={setHeldOpen} locationId={locationId} onResume={resume} />
      <SaleComplete sale={done} onNext={() => { setDone(null); reset(); }} />
    </div>
  );
}

function BillDiscount({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setText(value ? fromMinor(value) : ""); }}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none">
          <Percent className="size-3.5" /> {value ? "Bill discount" : "Add discount"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              onChange(text.trim() ? toMinor(text) : 0);
              setOpen(false);
            } catch {
              toast.error("Enter an amount like 50 or 12.50");
            }
          }}
        >
          <label htmlFor="bill-discount" className="text-sm font-medium">Discount on whole bill</label>
          <Input id="bill-discount" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="0.00" autoFocus />
          <Button type="submit" size="sm" className="w-full">Apply</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
