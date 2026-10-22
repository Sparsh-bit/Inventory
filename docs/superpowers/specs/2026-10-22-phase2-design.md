# StockPilot Phase 2 — Serial numbers, offline POS, GST e-invoice & e-way bill

Date: 2026-10-22 · Status: approved in chat

## 1. Serial-number tracking
- `Product.trackSerial` (unit scale 1 only, mutually exclusive with `trackBatch`), `Product.warrantyMonths`.
- `SerialNumber` {orgId, productId, variantId, serial, status `in_stock|sold|returned|written_off`, locationId, purchaseId, saleId, customerId, soldAt, warrantyUntil}; unique (orgId, variantId, serial).
- Receive: serial lines require exactly `qty` unique serials. Sale lines for serial items carry `serials[]` with length = qty; the sale transaction flips each serial `in_stock → sold` with a conditional update (`status: in_stock, locationId`), so a serial can never be sold twice.
- Return/void → `in_stock`; purchase return → `returned`; transfer moves `locationId`; negative adjustment → `written_off` (serials chosen); positive adjustment of serial items needs serials entered.
- POS: a scan that matches a serial adds the variant with that serial. Serial lookup page `/inventory/serials` shows full history + warranty.

## 2. Offline POS
- Hand-written `public/sw.js`: cache-first for `/_next/static`, icons, fonts; network-first for navigations to `/pos` (fallback to the cached copy). Registered in production only.
- Device registration (`Device` {orgId, code `T1..`, name, lastSeq}) → per-device bill series `<prefix>-<code>/<fy>/<seq>`.
- Local IndexedDB stores: `snapshot` (variants, customers, settings, serials-in-stock for this location), `outbox` (offline sales), `meta` (device code, next seq).
- Offline checkout uses the shared tax engine; sale saved to outbox with `clientId` (UUID) and final device number; receipt printed via ESC/POS or a locally rendered receipt (iframe `srcdoc`).
- Sync (`syncOfflineSales`) is idempotent (unique `clientId`), validates number format/device ownership, applies stock with negative fallback, records `syncIssues[]` (stock_short, credit_limit, serial_unavailable, price_changed) → "Needs review" filter on Sales.
- Offline excludes: new customers, returns, voids. Banner shows offline state and pending count; sign-out warns about unsynced bills.

## 3. GST e-invoice & e-way bill (NIC IRP)
- Settings (owner): enabled, environment, base URL + endpoint paths (defaults: sandbox `https://einv-apisandbox.nic.in`, `/eivital/v1.04/auth`, `/eicore/v1.03/Invoice`, `/eicore/v1.03/Invoice/Cancel`, `/eiewb/v1.03/ewaybill`), client id/secret, API username/password, NIC public key (PEM). Secrets encrypted with AES-256-GCM (key from `ENCRYPTION_KEY`, else derived from `BETTER_AUTH_SECRET`).
- `buildEinvoice(sale, org)` → INV-01 v1.1 JSON: TranDtls(B2B), DocDtls(INV/CRN, dd/mm/yyyy), Seller/Buyer, ItemList (UQC mapping, IsServc from HSN `99…`), ValDtls. `validateEinvoice` checks GSTIN checksum, HSN, PIN, state codes, required lengths, totals.
- NIC client: auth (Data = base64(RSA-PKCS1(base64(JSON{UserName,Password,AppKey,ForceRefreshAccessToken})))), SEK = AES-256-ECB-decrypt(base64 Sek, AppKey); payloads = base64(AES-256-ECB(SEK, JSON)); token cached until expiry. Generate IRN, cancel (24 h, reason codes 1-4), EWB by IRN.
- `Sale.einvoice` {status none|generated|cancelled|failed, irn, ackNo, ackDt, signedQr, ewbNo, ewbDt, ewbValidTill, errors[]}. JSON downloads for portal upload (e-invoice and e-way bill). A4 invoice prints IRN, Ack no/date, signed QR, EWB no.

## Testing
Unit: serial rules, device numbering, e-invoice builder/validator, GSTIN checksum, NIC crypto round-trips. Integration: serial race, offline sync idempotency/conflicts, mock NIC server (auth/IRN/cancel/EWB). Role matrix extended. E2E: offline sell → reload → sync; serial lifecycle; e-invoice via mock NIC.
