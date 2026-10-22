# StockPilot — Universal Inventory & POS (Phase 1) — Design

Date: 2026-10-22 · Status: approved in chat, pending written review
Working name "StockPilot" (rename freely).

## 1. Goal

A multi-tenant SaaS inventory + billing system any business (retail, grocery, pharmacy, hardware, apparel, wholesale, warehouse) can use. It works with hardware barcode scanners and thermal receipt printers, and falls back to the phone camera and any browser-printable printer when the business has no hardware.

### Learnings from reference repos

| Source | Adopt | Avoid |
|---|---|---|
| InvenTree | Keyboard-wedge input pair + camera (`BarcodeDetector` → library fallback); barcode on every stock entity; label sheets | Single-tenant; throttling disabled in DEBUG |
| ankit-mama-erp | `orgId` on every row; single `recordInventoryTransaction` entry with conditional decrement; atomic numbering; `withAuth(permission)` wrapper; line snapshots | No GST split; batch flags with no batch table; no rate limit / lockout; CSV formula injection |
| Warehouse NextJS | Order-line snapshots; import validator + history; rate limiting | Float money; hard-coded JWT fallback; no transactions; flat 7% tax |
| simple-stock-management | CSV/XLSX formula-injection guard; CSP; login lockout | SQLite; scattered role checks |

Gaps in all four, which this product fills: POS screen, thermal ESC/POS, GST CGST/SGST/IGST + HSN, phone-as-remote-scanner.

## 2. Decisions

- **Deployment:** multi-tenant SaaS (one deploy; each business = organization).
- **Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Mongoose 8 on MongoDB (replica set required for transactions — Atlas or local single-node RS), Better Auth (organization, 2FA, rate-limit plugins), Tailwind CSS v4 + shadcn/ui, Zod, TanStack Table, Recharts, `@zxing/browser`, `bwip-js` (barcode rendering), SheetJS-free CSV + `exceljs` for XLSX.
- **Money:** integers in minor units (paise/cents). Tax rates in basis points (1800 = 18%). Quantities: integer in the product's base unit × `unitScale` (e.g. 1000 for kg → grams) so fractional units stay exact.
- **Tax:** per-org mode `GST | VAT | NONE`; GST supports CGST/SGST/IGST split, HSN/SAC, GSTIN on invoices.
- **Printers:** browser print (all printers), direct ESC/POS via WebUSB / Web Serial / Web Bluetooth, LAN printers via local `print-bridge`.
- **Scope:** Phase 1 core (§3). Phase 2 deferred: offline POS, e-commerce sync, double-entry accounting, GST e-invoice/IRN & e-way bill, manufacturing/BOM, multi-currency per document, translations.

## 3. Phase 1 modules

1. **Auth & org:** sign-up, email verification, login, password reset, TOTP 2FA, invite members, roles, session management, onboarding wizard (business type, tax mode, GSTIN/state, first location, optional sample data).
2. **Dashboard:** today's sales, gross profit, bills count, low-stock, expiring-soon, top products, 30-day sales chart, receivables.
3. **Products:** categories (tree), brands, units, variants (attributes → SKU/barcode/prices), HSN, tax rate, tax-inclusive flag, reorder level, images, batch/expiry tracking, serial tracking, active/archived, barcode label printing.
4. **Inventory:** locations (store/warehouse), stock levels per location/batch, adjustments (with reason), transfers between locations, stock count (scan-to-count, variance post), full movement history.
5. **Purchasing:** suppliers, purchase orders, receive (scan to receive, partial receipts, batch/expiry capture), purchase returns, supplier balance.
6. **POS & sales:** fast POS (scan/search, qty, line & bill discount, customer select, hold/resume, split payments cash/card/UPI/credit, change due, round-off), receipts & A4 tax invoices, sales returns/refunds with restock, void, invoice list, customer payments against credit.
7. **Customers:** profile, GSTIN/state, credit limit, balance, purchase history.
8. **Reports:** sales (by day/product/category/cashier/payment method), GST summary (HSN-wise, rate-wise, B2B/B2C), stock valuation, low stock, expiry, movement, purchases, receivables/payables, profit. CSV/XLSX export.
9. **Import:** CSV/XLSX import of products, opening stock, customers, suppliers with preview + row-level errors.
10. **Settings:** business profile, logo, tax rates, document prefixes, receipt template options, printer profiles per device, scanner sensitivity, members & roles, audit log viewer.

## 4. Architecture

```
app/(auth)/…            sign-in, sign-up, verify, reset
app/(app)/[org]/…       authenticated, org-scoped pages
app/scan/[token]        phone remote-scanner page
app/print/…             print-only pages (receipt, invoice, labels)
app/api/…               route handlers (auth, SSE scan stream, uploads, exports)
server/actions/*.ts     server actions, each wrapped by withAuth(permission, schema)
server/services/*.ts    domain logic (stock, sales, purchases, tax, numbering, audit)
server/models/*.ts      Mongoose models
lib/…                   pure shared code: tax engine, money, escpos encoder, scanner detector, csv
components/…            UI (shadcn), pos/, scanner/, print/
print-bridge/           standalone Node LAN print relay
```

- Pages are React Server Components; mutations go through server actions; client state via React state + TanStack Query only where live updates are needed (POS search, scan stream).
- **`withAuth(permission, zodSchema, handler)`** — resolves session → active org membership → checks role permission → parses input → runs handler with `ctx {userId, orgId, role, locationIds}` → maps errors to safe messages → writes AuditLog for mutations.
- **Tenant isolation:** services receive `ctx` and always filter by `ctx.orgId`. A Mongoose plugin throws if a query on a tenant model lacks `orgId` (defence in depth).

### Roles & permissions

| Permission group | Owner | Manager | Cashier | Stock-keeper |
|---|---|---|---|---|
| settings, members, billing of org | ✔ | – | – | – |
| products & categories write | ✔ | ✔ | – | ✔ |
| stock adjust / transfer / count | ✔ | ✔ | – | ✔ |
| purchases | ✔ | ✔ | – | ✔ |
| POS sell, hold, customer create | ✔ | ✔ | ✔ | – |
| returns, void, discounts above limit | ✔ | ✔ | – | – |
| reports, cost/profit visibility | ✔ | ✔ | – | – |
| audit log | ✔ | ✔ | – | – |

Cashier/stock-keeper may be restricted to assigned locations.

## 5. Data model

All tenant collections: `orgId` (indexed, first in every compound index), `createdAt`, `updatedAt`.

- **Organization** (Better Auth org + metadata): name, legalName, gstin/vatNumber, stateCode, address, phone, email, logo, currency (ISO 4217), locale, taxMode, pricesIncludeTax default, receipt {paperWidth 58|80, header, footer, showHsn, showUpiQr, upiId}, prefixes {sale, invoice, return, purchase}, fiscalYearStartMonth, scanner {interKeyMs=30, minLength=4}.
- **Member / Invitation / Session / User** — Better Auth collections; member adds `role`, `locationIds[]`.
- **Location:** name, kind store|warehouse, address, isDefault, active.
- **Category:** name, parentId, path (materialized).
- **TaxRate:** name, rateBp, kind GST|VAT|CESS|NONE. GST split derived (half CGST/half SGST intra-state, full IGST inter-state).
- **Product:** name, description, categoryId, brand, unit {code, scale}, hsn, taxRateId, priceIncludesTax, trackBatch, trackSerial, reorderLevel, images[], active, variants[] {_id, sku, barcodes[], attributes{}, costPrice, salePrice, mrp, active}. Unique index `(orgId, variants.barcodes)` and `(orgId, variants.sku)`.
- **Batch:** variantId, batchNo, expiry, costPrice. Unique `(orgId, variantId, batchNo)`.
- **SerialNumber:** variantId, serial, locationId, status in_stock|sold|returned, saleId.
- **StockLevel:** locationId, variantId, batchId|null, qty, reserved. Unique `(orgId, locationId, variantId, batchId)`.
- **StockMove** (append-only): type opening|purchase|purchase_return|sale|sale_return|adjust|transfer_out|transfer_in|count, variantId, locationId, batchId, qtyDelta, unitCost, ref {kind, id, number}, reason, userId.
- **Party:** kind customer|supplier|both, name, phone, email, gstin, stateCode, address, creditLimit, openingBalance, balance (positive = they owe us). Unique `(orgId, phone)` sparse.
- **PurchaseOrder:** number, supplierId, locationId, status draft|ordered|partial|received|cancelled, lines[] {variantId, name, qtyOrdered, qtyReceived, unitCost, taxRateBp}, totals, receipts[] {date, lines[{variantId, qty, batchNo, expiry}]}.
- **Sale:** number, kind receipt|tax_invoice|return, status held|completed|void, locationId, customerId|null, customerSnapshot, placeOfSupply, lines[] {variantId, name, sku, hsn, qty, unitPrice, discount, taxableValue, taxRateBp, cgst, sgst, igst, cess, lineTotal, batchId, serials[]}, billDiscount, subtotal, taxTotal, roundOff, grandTotal, payments[] {method cash|card|upi|credit|other, amount, ref}, amountPaid, balanceDue, returnOf|null, cashierId, notes.
- **Payment:** partyId, direction in|out, amount, method, allocations[] {docKind, docId, amount}, ref.
- **Counter:** key `{orgId, docType, fy}` → seq. `findOneAndUpdate($inc, upsert)` inside the sale transaction ⇒ gap-free.
- **AuditLog:** userId, action, entity, entityId, diff, ip, userAgent. TTL none.
- **ScanSession:** token (random 32 bytes, stored hashed), userId, orgId, expiresAt (TTL index), events streamed via change stream or in-memory pub/sub with Mongo fallback polling.
- **ImportJob:** kind, fileName, rows, errors[], status.

### Core invariants

- Stock changes only via `stockService.move(ctx, session, moves[])`: for decrements, `updateOne({…, qty: {$gte: n}}, {$inc: {qty: -n}})`; if `matchedCount === 0` → abort with `INSUFFICIENT_STOCK` (per-org setting may allow negative stock for non-batch items).
- Sale completion = one Mongo transaction: counter → stock moves → sale insert → party balance → audit.
- FEFO batch allocation when the cashier does not pick a batch.
- Sale lines snapshot everything needed to reprint; reprints never read live product data.
- Returns reference the original sale line; returnable qty = sold − already returned.

## 6. Tax engine (`lib/tax.ts`, pure)

Input: lines {unitPrice, qty, discount, rateBp, inclusive}, billDiscount, orgStateCode, placeOfSupply, mode. Output: per-line taxable value, components, totals, roundOff.
- Inclusive: taxable = round(gross × 10000 / (10000 + rateBp)).
- Bill discount pro-rated across lines by taxable value before tax (largest-remainder to keep sums exact).
- GST intra-state: cgst = floor(tax/2), sgst = tax − cgst; inter-state: igst = tax.
- Round-off to nearest whole currency unit when enabled.
- HSN summary grouped by (hsn, rateBp).

## 7. Scanning

`useScanner({onScan, enabled})` aggregates three sources:
1. **Keyboard wedge** — window `keydown` capture listener; buffers printable keys with inter-key gap ≤ `interKeyMs`; terminates on Enter/Tab/timeout; emits if length ≥ `minLength`; prevents the Enter from submitting forms and strips buffered chars from the focused input when it was a scan. Pure detector in `lib/scan-detector.ts` (unit-tested).
2. **Camera** — `CameraScanner` component: `BarcodeDetector` when supported, else `@zxing/browser`; formats EAN-13/8, UPC-A/E, Code128, Code39, ITF, QR, DataMatrix; dedupe same code within 1500 ms; beep (WebAudio) + `navigator.vibrate`; torch toggle where supported; camera picker; clean stream stop on unmount.
3. **Remote phone** — desktop creates ScanSession → shows QR of `/scan/{token}`; phone (logged into same org) posts codes to `/api/scan/{token}`; desktop subscribes to `/api/scan/{token}/stream` (SSE). Session revocable, TTL 12 h.

Lookup: barcode → variant (exact match on `variants.barcodes`, then SKU). Unknown → "Create product with this barcode?". Internal barcodes for products without one: EAN-13 with prefix `2` + org-local sequence + check digit.

## 8. Printing

- **Print pages** `/print/receipt/[id]`, `/print/invoice/[id]`, `/print/labels?…` — print CSS with `@page { size: 58mm auto | 80mm auto | A4 }`, auto `window.print()`, return to POS.
- **ESC/POS** `lib/escpos.ts` — encoder (init, text with codepage CP437/UTF-8 fallback transliteration, bold, double size, align, divider, columns, feed, cut, cash-drawer pulse, QR via GS ( k, raster logo). Transports: `WebUSB`, `Web Serial`, `Web Bluetooth` (common BLE printer service UUIDs) and `HTTP bridge`. Printer profile stored per device in `localStorage` (device-specific by nature) with paper width and transport.
- **print-bridge/** — Node ≥ 20 script, zero deps: listens on `127.0.0.1:9123`, requires `X-Bridge-Key`, CORS allowlist of the app origin, forwards body to `printerHost:9100` via `net.Socket`. Configured by env/CLI flags.
- Receipt content: logo, business, GSTIN, address, bill no/date/cashier, customer, lines (name, qty × price, amount, optional HSN), discounts, tax summary by rate, round-off, grand total, payments & change, UPI QR for balance due, footer.
- Labels: Code128/EAN-13 + name + price, A4 sheet presets (e.g. 3×8, 4×10) and 50×25 mm thermal labels, via `bwip-js` SVG.

## 9. Security

- Better Auth: scrypt hashing, email verification required, password policy (≥ 10 chars, breached-password check optional), TOTP 2FA (enforceable for owners), DB sessions in httpOnly Secure SameSite=Lax cookies, session list & revoke, built-in rate limit on auth endpoints + account lockout after 5 failures / 15 min.
- `withAuth` on every action/route; Zod `.strict()` schemas; Mongoose `sanitizeFilter` + `strictQuery`; ObjectId validation.
- Server actions CSRF protection (Next origin check) plus origin check on custom POST routes; SSE/scan endpoints require session + token.
- Headers via `middleware`/`next.config`: CSP with nonce, HSTS, `X-Content-Type-Options`, `Referrer-Policy strict-origin-when-cross-origin`, `X-Frame-Options DENY`, `Permissions-Policy camera=(self), usb=(self), serial=(self), bluetooth=(self)`.
- Uploads: images only (sniffed MIME), 2 MB, re-encoded, random names; stored on local disk volume or S3-compatible bucket via one adapter.
- CSV/XLSX export cells starting with `= + - @ \t \r` prefixed with `'`.
- Env validated at boot with Zod; app refuses to start without `MONGODB_URI`, `BETTER_AUTH_SECRET` (≥ 32 chars), `APP_URL`.
- Audit log on every mutation; no secrets in logs; generic error messages to clients.

## 10. UI/UX

- shadcn/ui, Tailwind v4, Inter, light/dark/system theme, collapsible sidebar, org switcher, ⌘K command palette, breadcrumb header.
- Data tables: search, filters, sort, column visibility, pagination (server-side), CSV export.
- POS: two-pane (cart left, search/products/quick tiles right) on desktop; single pane with bottom pay bar and camera FAB on mobile; shortcuts F2 search, F4 pay, F8 hold, F9 recall, +/- qty, Del remove; large tap targets.
- Feedback: skeletons, toasts (sonner), confirmation dialogs for destructive actions, empty states with CTA, form errors inline.
- PWA manifest + icons (installable); responsive at 360 px+.
- Accessibility: keyboard nav, focus rings, aria labels, AA contrast.
- English UI with strings kept in components (i18n deferred).

## 11. Testing & quality gates

- Vitest unit: tax engine (inclusive/exclusive, intra/inter-state, discounts, rounding), money formatting, scan detector, ESC/POS encoder bytes, CSV escaping, EAN-13 check digit.
- Vitest integration with `mongodb-memory-server` replica set: concurrent sales on last unit (exactly one succeeds), gap-free numbering under concurrency, tenant isolation (org B cannot read/modify org A), returns cap, FEFO.
- Playwright E2E: sign-up → onboarding → product with barcode → POS scan (simulated wedge keystrokes) → split payment → receipt print page → return; purchase receive; console-error listener fails any test that logs an error.
- Gates: `tsc --noEmit`, `eslint` (no warnings), `next build`, all tests green.

## 12. Delivery

- Repo at `/Volumes/T9/Inventree` (git).
- `README.md` (setup, env, local Mongo replica set, deploy to Vercel/Render + Atlas, print-bridge usage, hardware notes), `.env.example`, `docker-compose.yml` (app + mongo replica set), seed script with demo org.

## 13. Known constraints

- Web Serial/USB/Bluetooth printing works only in Chromium browsers (Chrome/Edge/Android Chrome); Safari/Firefox use browser print.
- LAN printers from a cloud deployment require the print-bridge on a shop PC.
- Camera requires HTTPS (or localhost).
- MongoDB must run as a replica set (Atlas does by default).
