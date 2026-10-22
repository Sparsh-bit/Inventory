# StockPilot — Inventory & POS for any business

Multi-tenant inventory, billing and point-of-sale web app built with **Next.js 16, React 19, MongoDB (Mongoose) and Better Auth**. It works with USB/Bluetooth barcode scanners and thermal receipt printers. If a business has no hardware, it falls back to the **phone camera** for scanning and **any printer** (or a PDF) for bills.

## Features

| Area | What you get |
|---|---|
| **Point of sale** | Scan-to-bill, search, product tiles, editable qty/price/discount, bill discount, hold & recall bills (F8/F9), split payments (cash/card/UPI/on account), change calculation, UPI QR for the exact amount, keyboard shortcuts (F2 search, F4 pay), mobile layout with a bottom cart bar |
| **Scanning** | USB/Bluetooth “keyboard” scanners detected anywhere on the page (adjustable speed) · phone/laptop camera (native BarcodeDetector, ZXing fallback for iPhone) · **pair a phone as a wireless scanner** for a PC by scanning a QR code |
| **Printing** | 58/80 mm thermal receipts by browser print *or* silent direct ESC/POS over **USB, Serial, Bluetooth** (Chrome/Edge) · **LAN printers** via the included print bridge · cash-drawer kick · A4 GST tax invoice with amount in words · barcode label sheets (A4 21/65-up, 50×25 and 38×25 mm thermal) |
| **Products** | Variants (size/colour…), units incl. kg/litre with decimals, HSN, tax rates, MRP, cost, images, categories, auto-generated EAN-13/SKU, archive |
| **Inventory** | Multiple shops/warehouses, batches & expiry with first-expiry-first-out selling, adjustments with reasons, transfers, scan-to-count stock takes, full movement history, low-stock alerts |
| **Purchasing** | Purchase orders, scan-to-receive (partial deliveries), batch/expiry capture, supplier returns, supplier balances & payments |
| **Customers** | Credit (on account) sales with credit limits, dues, receive payments (oldest bills first), purchase history, WhatsApp bill sharing |
| **Tax** | GST: CGST+SGST within your state, IGST inter-state (automatic from the customer's state), cess, inclusive/exclusive prices, round-off; VAT / sales tax; or no tax |
| **Documents** | Gap-free numbering per financial year (`INV/26-27/00001`), credit notes for returns, same-day void |
| **Reports** | Sales, profit, payment methods, categories, cashiers, GST rate-wise & HSN-wise (GSTR-1 Table 12), B2B/B2C split, stock valuation, expiry, receivables/payables · Excel & CSV export |
| **Import** | Products, customers and suppliers from Excel/CSV with flexible column names, preview and row-level errors |
| **Team** | Owner, Manager, Cashier and Stock-keeper roles, email invitations, multiple businesses per account |
| **Security** | Email verification, two-factor login (TOTP + backup codes), account lockout + IP rate limits, session management, strict CSP with nonces, HSTS, tenant isolation enforced at the database layer, audit log of every change |

### Roles

| | Owner | Manager | Cashier | Stock keeper |
|---|:-:|:-:|:-:|:-:|
| POS billing, customers, collect dues | ✔ | ✔ | ✔ | – |
| Returns, voids, price override, discounts > 10 % | ✔ | ✔ | – | – |
| Products, stock adjust/transfer/count, purchases, suppliers | ✔ | ✔ | – | ✔ |
| Reports, cost & profit, audit log | ✔ | ✔ | – | – |
| Business settings, tax, locations, team | ✔ | – | – | – |

## Quick start (local)

Requirements: Node.js ≥ 20.9 and MongoDB ≥ 7 (`mongod` on your PATH). MongoDB must run as a **replica set** because sales, stock and numbering use transactions.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` starts a local single-node replica set in `.data/` and the app on http://localhost:3000. It generates a local secret automatically. Emails (verification, invites, password reset) go to `.data/mail.log` until you configure SMTP.

To use your own settings, copy `env.example` to `.env.local` and fill it in:

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | ✔ | Replica set URI, e.g. MongoDB Atlas (replica set by default) |
| `BETTER_AUTH_SECRET` | ✔ | 32+ random characters: `openssl rand -base64 48` |
| `APP_URL` | ✔ | Public URL. Must be **https** in production (camera access and secure cookies need it) |
| `SMTP_URL` | production | e.g. `smtps://user:pass@smtp.example.com:465` |
| `MAIL_FROM` | | Sender address |
| `UPLOAD_DIR` | | Where product images/logos are stored (default `./uploads`) |

## Deploy

**Docker (any VPS):**

```bash
cp env.example .env
```

```bash
docker compose up -d --build
```

This runs the app and MongoDB 8 as a replica set, with persistent volumes for data and uploads. Put it behind a reverse proxy with HTTPS (Caddy, Nginx, Traefik) and set `APP_URL` to the https address.

**Managed:** MongoDB Atlas + any Node host (Render, Railway, Fly.io, a VM). Run `npm ci && npm run build && npm start`, set the env variables, and give `UPLOAD_DIR` a persistent disk. (Serverless hosts need an object store for uploads; the upload code is a single file, `src/app/api/uploads/route.ts`.)

## Hardware guide

**Barcode scanners:** any USB or Bluetooth scanner in its default *keyboard (HID)* mode works with no setup. Test one in **Settings → Printer & scanner**. If scans are missed (slow Bluetooth scanners), raise the keystroke gap in **Settings → Receipts & numbering**.

**No scanner?** Tap **Camera** on the POS to scan with the phone or laptop camera, or tap **Phone** on a PC to show a QR code. Scan it with your phone and every barcode the phone reads lands in the PC's cart.

**Receipt printers:** set up each counter in **Settings → Printer & scanner** (saved per device):

| Connection | Browsers | Notes |
|---|---|---|
| Any printer (system dialog) | All | Works with every installed printer. Choose your thermal printer, margins “None” |
| USB direct | Chrome/Edge (desktop, Android) | Silent printing. On Windows, printers with a vendor driver often show up as *Serial* instead |
| Serial / COM | Chrome/Edge desktop | Most USB thermal printers on Windows; default 9600 baud |
| Bluetooth | Chrome on Android/Windows/macOS | BLE receipt printers; reconnect after reloading the page |
| Network (LAN) | All | Run the [print bridge](print-bridge/README.md) on a shop PC |

Thermal receipts print ₹ as “Rs.” because receipt printers lack the glyph.

## Development

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run test:int
```

```bash
npm run e2e
```

- **Unit tests:** tax engine (GST/VAT, inclusive, cess, discounts, rounding), money, scanner detection, ESC/POS encoding, receipt layout, CSV escaping, import parsing, print bridge.
- **Integration tests** (in-memory MongoDB replica set):
  - concurrent sales can never oversell
  - gap-free numbering under load
  - tenant isolation
  - returns, voids, credit limits, FEFO batches, purchase receiving
  - a **role matrix** that calls every server action as every role
- **End-to-end tests** (Playwright, production build): owner sign-up → onboarding → sale → return → team invites; then each invited role checks every page it may and may not open. Also covered: product creation and scan-to-sell, unknown-barcode flow, credit sale & payment collection, purchase receiving, CSV import, labels, device settings and phone-sized POS. **Every e2e test fails on any browser console error.**

Project layout: `src/lib` holds pure logic (tax, money, scanner, ESC/POS). `src/server/services` holds business rules and transactions. `src/server/actions` holds the authorised server actions (`withAuth(permission, schema, fn)`). `src/app` holds pages, and `print-bridge/` holds the LAN printer relay.

> On exFAT/external drives macOS creates `._*` files; they are ignored everywhere, and `npm run clean:mac` removes them.
