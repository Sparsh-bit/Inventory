# StockPilot Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a multi-tenant inventory + POS web app with hardware/camera/remote-phone scanning and browser/ESC-POS/LAN printing.

**Architecture:** One Next.js 16 App Router app. Server Components render pages; mutations are server actions wrapped by `withAuth(permission, schema, fn)` which resolves session → active org → role → Zod-parsed input. Domain logic lives in `src/server/services/*` and runs money/stock writes inside Mongo transactions. Pure logic (tax, scan detection, ESC/POS, CSV, EAN-13) lives in `src/lib/*` with unit tests.

**Tech Stack:** next 16.4.2, react 19.3.1, typescript (version bundled/supported by Next; use the one `create-next-app` installs), mongoose 9.11.3, mongodb 7.x (driver for Better Auth adapter), better-auth 1.7.12, zod 4.6.7, tailwindcss 4.3.3 + shadcn 4.22.1 (radix-ui), next-themes, sonner, lucide-react, cmdk, recharts 3.10.1, @zxing/browser 0.2.1, bwip-js 4.11.4, qrcode 1.5.4, exceljs 4.4.0, papaparse 5.7.0, nodemailer, vitest 5.0.5, mongodb-memory-server 11.3.0, @playwright/test 1.64.1.

**Spec:** `docs/superpowers/specs/2026-10-22-stockpilot-design.md`

## Global Constraints

- Money: integer minor units everywhere (`number`, `Number.isSafeInteger`). Tax rates: basis points (1800 = 18%).
- Quantities: integer in base unit × `unit.scale` (scale 1 for pcs, 1000 for kg/l).
- Every tenant document has `orgId` (ObjectId string) first in every compound index; every service query filters by `ctx.orgId`.
- Every server action / mutating route goes through `withAuth`. No direct model access from components.
- Stock decrements only via `stockService.applyMoves`, conditional `$inc` with `qty: {$gte}`; sale/purchase/return/transfer/adjust each in one transaction.
- Env validated with Zod at boot: `MONGODB_URI`, `BETTER_AUTH_SECRET` (≥32 chars), `APP_URL`; optional `SMTP_URL`, `MAIL_FROM`, `UPLOAD_DIR`.
- Security headers + CSP nonce set in `src/middleware.ts`; `Permissions-Policy: camera=(self), usb=(self), serial=(self), bluetooth=(self)`.
- CSV/XLSX export escapes cells beginning with `= + - @ \t \r`.
- Quality gates: `npm run typecheck`, `npm run lint` (0 warnings), `npm test`, `npm run build`, `npm run e2e` (fails on any browser console error).
- MongoDB must be a replica set (local: `npm run db` starts single-node RS in `.data/`).

---

## File Structure

```
src/env.ts                         Zod-validated env
src/lib/utils.ts                   cn()
src/lib/money.ts                   toMinor, fromMinor, formatMoney, allocateProportionally
src/lib/tax.ts                     computeBill() pure tax engine
src/lib/scan-detector.ts           createScanDetector() keyboard-wedge detector
src/lib/escpos.ts                  EscPos encoder class
src/lib/ean13.ts                   ean13CheckDigit, makeInternalEan13, isValidEan13
src/lib/csv.ts                     toCsv(), escapeCell()
src/lib/permissions.ts             Role, Permission, can()
src/lib/receipt.ts                 receiptToEscPos(sale, org, width)
src/server/db.ts                   connectDb() cached mongoose connection
src/server/auth.ts                 betterAuth instance (mongodb adapter, organization, twoFactor)
src/server/auth-client.ts          (client) createAuthClient with org + 2FA plugins  → lives in src/lib/auth-client.ts
src/server/context.ts              getCtx(): session+org+member → Ctx | redirect
src/server/with-auth.ts            withAuth(), ActionResult, AppError
src/server/tenant-plugin.ts        mongoose plugin: require orgId in filters
src/server/models/*.ts             Location, Category, TaxRate, Product, Batch, SerialNumber,
                                   StockLevel, StockMove, Party, PurchaseOrder, Sale, Payment,
                                   Counter, AuditLog, ScanSession, OrgSettings, ImportJob
src/server/services/numbering.ts   nextNumber(ctx, docType, session)
src/server/services/audit.ts       audit(ctx, action, entity, id, diff, session?)
src/server/services/stock.ts       applyMoves(ctx, moves, session), pickBatchesFefo()
src/server/services/products.ts    CRUD, findByCode()
src/server/services/sales.ts       completeSale(), holdSale(), returnSale(), voidSale()
src/server/services/purchases.ts   create/update PO, receivePO()
src/server/services/parties.ts     CRUD, recordPayment()
src/server/services/reports.ts     aggregations
src/server/services/imports.ts     parse + validate + apply
src/server/services/onboarding.ts  createOrgWithDefaults(), seedSampleData()
src/server/services/scan.ts        createScanSession, pushScan, subscribe
src/server/actions/*.ts            thin withAuth wrappers per module
src/app/(auth)/…                   sign-in, sign-up, forgot, reset, verify, 2fa
src/app/onboarding/page.tsx
src/app/(app)/layout.tsx           sidebar shell
src/app/(app)/{dashboard,pos,sales,products,inventory,purchases,customers,suppliers,reports,import,settings}/…
src/app/scan/[token]/page.tsx      phone remote scanner
src/app/print/{receipt,invoice}/[id]/page.tsx, print/labels/page.tsx
src/app/api/auth/[...all]/route.ts
src/app/api/scan/[token]/route.ts (POST), stream/route.ts (SSE)
src/app/api/export/[report]/route.ts, api/uploads/route.ts, api/files/[name]/route.ts
src/components/ui/*                shadcn
src/components/app/*               sidebar, header, command palette, data-table, page-header, empty-state
src/components/scanner/*           use-scanner.ts, camera-scanner.tsx, remote-pair-dialog.tsx
src/components/print/*             printer-transports.ts, use-printer.ts, receipt-view.tsx, invoice-view.tsx
src/components/pos/*               pos-screen.tsx, cart.tsx, payment-dialog.tsx, product-search.tsx
print-bridge/bridge.mjs
tests/unit/*.test.ts, tests/integration/*.test.ts, e2e/*.spec.ts
```

---

### Task 1: Scaffold, env, DB, tooling

**Files:** Create project via `create-next-app` (TS, ESLint, Tailwind, App Router, `src/`, alias `@/*`); `src/env.ts`, `src/server/db.ts`, `scripts/db.sh`, `vitest.config.ts`, `.env.example`, `.gitignore` additions (`.data/`, `.env*.local`, `uploads/`).

**Interfaces — Produces:** `env` object; `connectDb(): Promise<typeof mongoose>`; npm scripts `dev build start lint typecheck test test:int e2e db seed`.

- [ ] Scaffold: `npx create-next-app@16.4.2 . --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --no-turbopack=false`
- [ ] Install deps listed in Tech Stack; `npx shadcn@latest init` then add components: button input label card dialog sheet dropdown-menu select table tabs badge separator skeleton tooltip popover command avatar checkbox switch textarea form sidebar breadcrumb scroll-area alert alert-dialog radio-group calendar.
- [ ] `scripts/db.sh`: `mkdir -p .data/db && mongod --dbpath .data/db --replSet rs0 --port 27017 --bind_ip 127.0.0.1 --fork --logpath .data/mongod.log && mongosh --quiet --eval 'try{rs.status()}catch(e){rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})}'`
- [ ] `src/env.ts` with Zod schema per Global Constraints, `server-only` import.
- [ ] `src/server/db.ts`: global-cached `mongoose.connect(env.MONGODB_URI)`, `mongoose.set('strictQuery', true)`, `mongoose.set('sanitizeFilter', true)`.
- [ ] Verify `npm run dev` serves `/` with no console errors. Commit.

### Task 2: Pure libraries with unit tests (money, tax, ean13, csv, scan detector, escpos, permissions)

**Files:** `src/lib/{money,tax,ean13,csv,scan-detector,escpos,permissions}.ts`; `tests/unit/{money,tax,ean13,csv,scan-detector,escpos,permissions}.test.ts`.

**Interfaces — Produces:**
```ts
// money.ts
formatMoney(minor: number, currency: string, locale?: string): string
toMinor(major: string | number): number            // "12.34" -> 1234 (2-decimal currencies)
fromMinor(minor: number): string                   // 1234 -> "12.34"
allocateProportionally(total: number, weights: number[]): number[] // sums exactly to total
// tax.ts
type TaxMode = 'GST' | 'VAT' | 'NONE'
interface BillLineInput { unitPrice: number; qty: number; scale: number; discount: number; rateBp: number; inclusive: boolean; cessBp?: number }
interface BillInput { lines: BillLineInput[]; billDiscount: number; mode: TaxMode; interState: boolean; roundOff: boolean }
interface BillLine { gross: number; discount: number; taxable: number; cgst: number; sgst: number; igst: number; vat: number; cess: number; tax: number; total: number }
interface Bill { lines: BillLine[]; subtotal: number; discountTotal: number; taxableTotal: number; cgst: number; sgst: number; igst: number; vat: number; cess: number; taxTotal: number; roundOff: number; grandTotal: number }
computeBill(input: BillInput): Bill
// ean13.ts
ean13CheckDigit(d12: string): number; isValidEan13(code: string): boolean; makeInternalEan13(seq: number): string // "2" + 11-digit seq + check
// csv.ts
escapeCell(v: unknown): string; toCsv(rows: Record<string, unknown>[], columns: {key: string; label: string}[]): string
// scan-detector.ts
createScanDetector(opts: {interKeyMs: number; minLength: number; onScan: (code: string) => void; now?: () => number}): { handleKey(e: {key: string; timeStamp?: number}): boolean /* true = consumed as part of a scan terminator */; reset(): void }
// escpos.ts
class EscPos { constructor(opts?: {width?: 32 | 48}); init(); text(s); line(s?); bold(on); align('left'|'center'|'right'); size(w:1|2,h:1|2); cols(left, right); divider(ch?); feed(n?); cut(); drawer(); qr(data, size?); bytes(): Uint8Array }
// permissions.ts
type Role = 'owner' | 'manager' | 'cashier' | 'stockkeeper'
type Permission = 'settings:manage'|'members:manage'|'products:read'|'products:write'|'stock:read'|'stock:write'|'purchases:read'|'purchases:write'|'pos:sell'|'sales:read'|'sales:return'|'sales:void'|'parties:read'|'parties:write'|'reports:read'|'cost:read'|'audit:read'|'import:run'
can(role: Role, p: Permission): boolean
```

Required test cases (write first, watch fail, implement):
- tax: exclusive 18% GST intra-state, 2 × 10000 → taxable 20000, cgst 1800, sgst 1800, total 23600; inclusive 11800 @18% → taxable 10000 tax 1800; odd tax split (cgst floor, sgst remainder); inter-state → igst only; bill discount 1000 over lines 30000/10000 pro-rated 750/250 before tax; VAT mode → `vat` component; NONE → zero tax; roundOff: 23649 → grandTotal 23600 roundOff −49, 23650 → 23700 +50; qty with scale 1000 (1.5 kg = 1500) × 4000/kg → gross 6000.
- money: allocateProportionally(100, [1,1,1]) → [34,33,33] sums 100; zero weights → even split.
- ean13: check digit of "400638133393" = 1; makeInternalEan13(42) starts with "2", length 13, valid.
- csv: `=SUM(A1)` → `'=SUM(A1)`; quotes/commas/newlines quoted.
- scan-detector: keys "1","2","3","4","Enter" at 5 ms gaps → onScan("1234"); same keys at 120 ms gaps → not a scan; 3 chars + Enter → not a scan.
- escpos: `new EscPos().init().text("A").cut().bytes()` equals `[0x1b,0x40,0x41,0x1d,0x56,0x42,0x00]`; `drawer()` emits `1b 70 00 19 fa`.
- permissions: cashier can `pos:sell`, cannot `cost:read`; owner can everything.

- [ ] Write tests → run `npx vitest run tests/unit` (FAIL) → implement → PASS → commit.

### Task 3: Auth, organizations, roles, context, withAuth

**Files:** `src/server/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`, `src/server/mail.ts`, `src/server/context.ts`, `src/server/with-auth.ts`, `src/server/tenant-plugin.ts`, `src/middleware.ts` (headers + auth cookie gate), `src/app/(auth)/*` pages, `src/app/onboarding/page.tsx`, `src/server/services/onboarding.ts`, `src/server/models/{location,tax-rate,org-settings,counter,audit-log}.ts`, `src/server/services/{audit,numbering}.ts`.

**Interfaces — Produces:**
```ts
interface Ctx { userId: string; orgId: string; role: Role; memberId: string; locationIds: string[]; ip?: string; ua?: string }
getCtx(): Promise<Ctx>                         // redirects to /sign-in or /onboarding
requireCtx(p: Permission): Promise<Ctx>        // for server components; throws/redirects if denied
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
withAuth<S extends z.ZodType, T>(perm: Permission, schema: S, fn: (ctx: Ctx, input: z.infer<S>) => Promise<T>): (input: unknown) => Promise<ActionResult<T>>
class AppError extends Error { constructor(code: string, message: string) }
nextNumber(ctx: Ctx, docType: 'sale'|'invoice'|'return'|'purchase'|'barcode', session?: ClientSession): Promise<{ seq: number; number: string }>
audit(ctx: Ctx, action: string, entity: string, entityId: string, diff?: unknown, session?: ClientSession): Promise<void>
createOrgWithDefaults(userId, input: {name, businessType, currency, taxMode, gstin?, stateCode?, locationName, sample: boolean}): Promise<{orgId}>
```
- Better Auth: `emailAndPassword {enabled, requireEmailVerification: true, minPasswordLength: 10}`, `emailVerification.sendVerificationEmail` via `mail.ts` (SMTP if `SMTP_URL` else log link to server stdout), `rateLimit {enabled: true, storage: 'database', customRules: {'/sign-in/email': {window: 900, max: 5}}}`, plugins `organization({ ac, roles: {owner, manager, cashier, stockkeeper}, creatorRole: 'owner' })`, `twoFactor()`, `nextCookies()`.
- Org-specific settings stored in `OrgSettings` collection keyed by orgId (Better Auth org holds name/slug/logo only).
- Integration test `tests/integration/tenant.test.ts`: service call with ctx of org B cannot read org A product; `nextNumber` 50 concurrent calls → 50 unique consecutive seqs.
- [ ] Implement → sign-up, verify (log link), sign-in, onboarding creates org + default location + tax rates (GST: 0, 5, 12, 18, 28; VAT: 0, standard) → lands on /dashboard. Commit.

### Task 4: App shell & shared UI

**Files:** `src/app/(app)/layout.tsx`, `src/components/app/{app-sidebar,site-header,command-menu,page-header,empty-state,data-table,pagination,search-input,theme-toggle,org-switcher,user-menu,money,confirm-button}.tsx`, `src/app/providers.tsx`.
- Server-side tables driven by `searchParams` (`q`, `page`, `sort`, filters); `DataTable` is a presentational component taking `columns` + `rows`.
- ⌘K menu navigates to all pages + "New product", "New sale".
- [ ] Implement, check light/dark and 375 px width, commit.

### Task 5: Products, categories, tax rates, barcodes & labels

**Files:** models `category, product, batch, serial-number`; `services/products.ts`; `actions/products.ts`; pages `products/page.tsx`, `products/new/page.tsx`, `products/[id]/page.tsx`, `products/categories/page.tsx`, `components/products/product-form.tsx`, `app/print/labels/page.tsx`, `components/print/barcode-svg.tsx` (bwip-js `toSVG`), `api/uploads/route.ts`, `api/files/[name]/route.ts`.

**Interfaces — Produces:**
```ts
findByCode(ctx, code: string): Promise<{ product: ProductDoc; variant: VariantDoc } | null>
searchVariants(ctx, q: string, limit?: number): Promise<VariantHit[]>
// VariantHit = { productId, variantId, name, sku, barcode, salePrice, mrp, rateBp, inclusive, unit: {code, scale}, trackBatch, trackSerial, hsn, stock: number }
```
- Variant without barcode → `makeInternalEan13(nextNumber(ctx,'barcode').seq)`. Duplicate barcode/SKU → field error.
- Product form: simple product = one variant; "Has variants" toggles attribute builder (e.g. Size: S,M,L × Color) generating variant rows.
- Opening stock field on create (per default location) → `applyMoves` type `opening`.
- [ ] Integration test: duplicate barcode within org rejected, allowed across orgs. Commit.

### Task 6: Inventory — stock service, locations, adjustments, transfers, counts, history

**Files:** models `stock-level, stock-move`; `services/stock.ts`; `actions/inventory.ts`; pages `inventory/page.tsx` (levels by location, low stock filter), `inventory/adjust/page.tsx`, `inventory/transfers/page.tsx`, `inventory/count/page.tsx` (scan-to-count), `inventory/history/page.tsx`, `settings/locations/page.tsx`.

**Interfaces — Produces:**
```ts
interface MoveInput { variantId: string; productId: string; locationId: string; batchId?: string | null; qtyDelta: number; unitCost?: number; type: MoveType; ref?: { kind: string; id: string; number?: string }; reason?: string }
applyMoves(ctx, moves: MoveInput[], session: ClientSession, opts?: { allowNegative?: boolean }): Promise<void>  // throws AppError('INSUFFICIENT_STOCK', "<name> has only N left")
pickBatchesFefo(ctx, variantId, locationId, qty, session): Promise<{ batchId: string; qty: number }[]>
```
- Integration test: 10 concurrent sales of qty 1 against stock 3 → exactly 3 succeed, final qty 0, 3 sale moves.
- [ ] Implement, commit.

### Task 7: Parties (customers, suppliers, payments)

**Files:** model `party, payment`; `services/parties.ts`; `actions/parties.ts`; pages `customers/page.tsx`, `customers/[id]/page.tsx`, `suppliers/page.tsx`, `suppliers/[id]/page.tsx`, `components/parties/party-form.tsx`, `components/parties/payment-dialog.tsx`.
- `recordPayment(ctx, {partyId, direction, amount, method, ref})` adjusts balance in a transaction, allocates FIFO to open sales/POs with `balanceDue > 0`.
- [ ] Commit.

### Task 8: Purchasing

**Files:** model `purchase-order`; `services/purchases.ts`; `actions/purchases.ts`; pages `purchases/page.tsx`, `purchases/new/page.tsx`, `purchases/[id]/page.tsx`, `purchases/[id]/receive/page.tsx` (scan-to-receive with batch/expiry when trackBatch).
- `receivePurchase(ctx, poId, lines[{variantId, qty, batchNo?, expiry?, unitCost}])` → upsert Batch, `applyMoves` type `purchase`, update `qtyReceived`, status partial/received, supplier balance += received value incl. tax, update variant `costPrice` (latest cost).
- `returnPurchase(ctx, poId, lines[{variantId, batchId?, qty}])` → `applyMoves` type `purchase_return` (conditional decrement), supplier balance −= value.
- [ ] Integration test: partial receive then full → status transitions and stock. Commit.

### Task 9: Scanner (wedge hook, camera, remote phone)

**Files:** `components/scanner/use-scanner.ts`, `camera-scanner.tsx`, `remote-pair-dialog.tsx`, `scan-button.tsx`; model `scan-session`; `services/scan.ts`; `app/api/scan/[token]/route.ts`, `app/api/scan/[token]/stream/route.ts`; `app/scan/[token]/page.tsx`.
- `useScanner(onScan, {enabled})` uses `createScanDetector` with org scanner settings; ignores events while a dialog with `data-scan-ignore` is open.
- Camera: `BarcodeDetector` if `'BarcodeDetector' in window` and formats supported, else `BrowserMultiFormatReader` from `@zxing/browser`; stop all tracks on unmount; error states for denied/no camera/insecure context.
- Remote: create session → token (base64url 32 bytes), store sha256; POST appends `{code, at}` to session `events` (capped 200) and bumps `seq`; SSE route polls every 500 ms for `seq` change (works on any Mongo, no change streams), heartbeat 15 s, closes on abort.
- [ ] Commit.

### Task 10: POS & sales

**Files:** model `sale`; `services/sales.ts`; `actions/sales.ts`; `components/pos/*`; pages `pos/page.tsx`, `sales/page.tsx`, `sales/[id]/page.tsx`, `sales/[id]/return/page.tsx`.

**Interfaces — Produces:**
```ts
interface SaleInput { locationId: string; customerId?: string | null; lines: { variantId: string; qty: number; unitPrice: number; discount: number; batchId?: string | null; serials?: string[] }[]; billDiscount: number; payments: { method: 'cash'|'card'|'upi'|'credit'|'other'; amount: number; ref?: string }[]; kind: 'receipt' | 'tax_invoice'; notes?: string; heldId?: string }
completeSale(ctx, input: SaleInput): Promise<{ saleId: string; number: string }>
holdSale(ctx, input): Promise<{ saleId: string }>; listHeld(ctx, locationId); deleteHeld(ctx, id)
returnSale(ctx, saleId, lines: { lineIndex: number; qty: number }[], refundMethod): Promise<{ saleId: string; number: string }>
voidSale(ctx, saleId, reason): Promise<void>   // only same-day, restocks
```
- Server recomputes prices from DB (client prices accepted only if user has `sales:return`-level role for price override; otherwise use variant salePrice) and recomputes tax via `computeBill`; payments must sum ≥ grandTotal unless `credit` used with customer; credit increases customer balance, blocked above creditLimit (limit 0 = unlimited).
- Interstate = customer.stateCode && customer.stateCode !== org.stateCode.
- POS UI: search (debounced server action), scanner hook adds/increments, cart editable qty/price(if allowed)/discount, customer picker with quick-create, hold/recall, pay dialog with quick cash buttons and change due, after success → print via printer profile (ESC/POS or browser) and new bill. Keyboard shortcuts F2/F4/F8/F9.
- [ ] Integration tests: return cap; void restocks; credit limit. Commit.

### Task 11: Printing (views, ESC/POS transports, bridge)

**Files:** `lib/receipt.ts`, `components/print/{printer-transports,use-printer,receipt-view,invoice-view,printer-settings}.tsx`, `app/print/receipt/[id]/page.tsx`, `app/print/invoice/[id]/page.tsx`, `app/(app)/settings/printers/page.tsx`, `print-bridge/bridge.mjs`, `print-bridge/README.md`.
- Transports: `serial` (`navigator.serial.requestPort()`, baud 9600 default, configurable), `usb` (`navigator.usb.requestDevice({filters: []})`, claim first interface with bulk OUT endpoint), `bluetooth` (services `000018f0-0000-1000-8000-00805f9b34fb`, `e7810a71-73ae-499d-8c15-faa9aef0c3f2`, write characteristic in 180-byte chunks), `bridge` (`fetch('http://127.0.0.1:9123/print', {headers: {'X-Bridge-Key'}})`), `browser` (open print page).
- Profile in `localStorage` key `stockpilot.printer` `{transport, width: 58|80, baud?, bridgeKey?, autoPrint, openDrawer}`; previously-granted devices re-acquired via `getPorts()/getDevices()`.
- UPI QR: `upi://pay?pa=<upiId>&pn=<name>&am=<amount>&cu=INR&tn=<billNo>`.
- Unit test `receipt.test.ts`: 32-col output lines never exceed width.
- [ ] Commit.

### Task 12: Dashboard & reports & export

**Files:** `services/reports.ts`, pages `dashboard/page.tsx`, `reports/page.tsx` (tabs: sales, gst, stock, expiry, purchases, receivables, profit), `components/reports/*`, `api/export/[report]/route.ts` (CSV & XLSX).
- Date range via `from`/`to` search params, default this month; timezone from org settings.
- GST report: HSN summary (hsn, rate, qty, taxable, cgst, sgst, igst), B2B (customer GSTIN) vs B2C split.
- [ ] Commit.

### Task 13: Import

**Files:** `services/imports.ts`, `actions/imports.ts`, `app/(app)/import/page.tsx`, template CSV downloads.
- Kinds: products (name, sku, barcode, category, unit, hsn, tax_rate, cost_price, sale_price, mrp, reorder_level, opening_stock), customers, suppliers. Parse with papaparse (CSV) or exceljs (XLSX), preview first 20 rows with per-row errors, apply in batches of 200 inside transactions, max 5 000 rows / 5 MB.
- [ ] Unit test row validation. Commit.

### Task 14: Settings, members, audit, security headers, PWA

**Files:** `settings/{page,business,tax,receipt,members,security,audit,scanner}/page.tsx`, `src/middleware.ts`, `app/manifest.ts`, icons, `app/(app)/settings/security` (2FA enable/disable, sessions list/revoke).
- [ ] Verify headers with `curl -I`. Commit.

### Task 15: Seed, Docker, README, E2E

**Files:** `scripts/seed.ts`, `Dockerfile`, `docker-compose.yml`, `README.md`, `playwright.config.ts`, `e2e/{fixtures.ts,auth-and-onboarding.spec.ts,pos.spec.ts,purchase.spec.ts}`.
- Fixture attaches `page.on('console', m => m.type()==='error' && errors.push(...))` and `pageerror`; `afterEach` expects `errors` empty.
- E2E simulate wedge scan via `page.keyboard.type(code, {delay: 5})` + Enter.
- Verification email in E2E: read link from a test-only mail sink (`MAIL_SINK=file` writes to `.data/mail.log`).
- [ ] Run all gates. Commit.
