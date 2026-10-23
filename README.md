# StockPilot — Inventory & POS for any business

Multi-tenant inventory, billing and point-of-sale web app built with **Next.js 16, React 19, MongoDB (Mongoose) and Better Auth**. It works with USB/Bluetooth barcode scanners and thermal receipt printers. If a business has no hardware, it falls back to the **phone camera** for scanning and **any printer** (or a PDF) for bills.

## Features

| Area | What you get |
|---|---|
| **Point of sale** | Scan-to-bill, search, product tiles, editable qty/price/discount, bill discount, hold & recall bills (F8/F9), split payments (cash/card/UPI/on account), change calculation, UPI QR for the exact amount, keyboard shortcuts (F2 search, F4 pay), mobile layout with a bottom cart bar |
| **Scanning** | USB/Bluetooth “keyboard” scanners detected anywhere on the page (adjustable speed) · phone/laptop camera (native BarcodeDetector, ZXing fallback for iPhone) · **pair a phone as a wireless scanner** for a PC by scanning a QR code |
| **Printing** | 58/80 mm thermal receipts by browser print *or* silent direct ESC/POS over **USB, Serial, Bluetooth** (Chrome/Edge) · **LAN printers** via the included print bridge · cash-drawer kick · A4 GST tax invoice with amount in words · barcode label sheets (A4 21/65-up, 50×25 and 38×25 mm thermal) |
| **Products** | Barcode by scanner, camera or typed product number, variants (size/colour…), units incl. kg/litre with decimals, HSN, tax rates, MRP, cost, images, categories, auto-generated EAN-13/SKU, archive |
| **Offline POS** | Keeps billing when the internet drops: the POS opens from cache (service worker), finds products, serials and customers locally, numbers bills from the till's own GST-compliant series (e.g. `ST2/2627/00001`), prints receipts, and syncs automatically when back online. Conflicts (stock, credit limit, serials, price changes) are flagged for review, never lost |
| **Serial numbers / IMEI** | Scan serials in on purchase, sell by scanning the IMEI, every unit tracked through returns, transfers, write-offs and counts; warranty lookup by serial; serials printed on bills |
| **GST e-invoice & e-way bill** | Direct NIC IRP API (sandbox/production): IRN + signed QR on B2B invoices and credit notes, cancel within 24 h, e-way bill by IRN; pre-checks GSTIN checksum, HSN, PIN and totals; JSON downloads for manual portal upload; credentials encrypted at rest |
| **Inventory** | Multiple shops/warehouses, batches & expiry with first-expiry-first-out selling, adjustments with reasons, transfers, scan-to-count stock takes, full movement history, low-stock alerts |
| **Purchasing** | Purchase orders from your product list (add a new product right from the order, or by scanning an unknown barcode), scan-to-receive (partial deliveries), batch/expiry capture, supplier returns, supplier statement with every item and quantity, pay part or all of a chosen supplier invoice with date, method, reference and note |
| **Customers** | Credit (on account) sales with credit limits, dues, receive payments against the bills you choose (or oldest first) with date and note, purchase history |
| **Khata (Udhaar)** | Udhaar given / received with date and details, per-person statement with running balance (every bill, return, payment and udhaar), "you'll get / you'll give" totals, WhatsApp payment reminders |
| **WhatsApp bills** | Type any mobile number after a sale (or on any bill) and WhatsApp opens on that number with the items, total, balance due and a secure link to the full bill, which opens without logging in |
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
| `RESEND_API_KEY` | production* | [Resend](https://resend.com) API key (`re_…`). Sends over HTTPS, so it works on Railway, which blocks SMTP on the Hobby plan |
| `SMTP_URL` | | *or SMTP instead, e.g. `smtps://user:pass@smtp.example.com:465` |
| `MAIL_FROM` | | Sender, e.g. `StockPilot <no-reply@yourdomain.com>`. With Resend the domain must be verified in Resend |
| `UPLOAD_DIR` | | Where product images/logos are stored (default `./uploads`) |
| `ENCRYPTION_KEY` | | 32+ chars; encrypts stored GST API credentials (defaults to a key derived from `BETTER_AUTH_SECRET`; set it so rotating the auth secret doesn't invalidate them) |
| `NIC_EXTRA_HOSTS` | | Extra e-invoice API hosts allowed besides NIC's own (e.g. your GSP), comma separated |

## Deploy

**Docker (any VPS):**

```bash
cp env.example .env
```

```bash
docker compose up -d --build
```

This runs the app and MongoDB 8 as a replica set, with persistent volumes for data and uploads. Put it behind a reverse proxy with HTTPS (Caddy, Nginx, Traefik) and set `APP_URL` to the https address.

**Railway (recommended managed host):**

1. **Database:** create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas) (Atlas is a replica set, which the app needs for transactions). Under *Network Access* allow `0.0.0.0/0`, or Railway's static egress IPs if you have them. Copy the `mongodb+srv://…` connection string and add a database name, e.g. `…mongodb.net/stockpilot?retryWrites=true&w=majority`. Railway's one-click MongoDB template is a single server without a replica set and will not work.
2. **App:** in Railway choose *New project → Deploy from GitHub repo*. It finds `railway.json` and builds the `Dockerfile`.
3. **Variables:** run `bash scripts/railway-env.sh`. It prints every variable with fresh secrets. Paste the output into service → *Variables* → *Raw Editor* and fill in the `REPLACE_ME` values:

   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | the Atlas string from step 1 |
   | `BETTER_AUTH_SECRET` | output of `openssl rand -base64 48` |
   | `RESEND_API_KEY`, `MAIL_FROM` | Resend key and a sender on a domain verified in Resend (needed: sign-up sends a verification email) |
   | `ENCRYPTION_KEY` | another `openssl rand -base64 48` |
   | `RAILWAY_RUN_UID` | `0` (lets the app write to the mounted volume) |
   | `APP_URL` | only if you add a custom domain, e.g. `https://pos.example.com` (otherwise the Railway domain is used automatically) |

4. **Uploads:** service → *Settings → Volumes → Add volume*, mount path `/data`. Product images and logos survive redeploys.
5. **Domain:** *Settings → Networking → Generate domain* (or add your own). Railway serves it over HTTPS, which the camera scanner needs.

Each deploy waits for `/api/health` to pass. It returns 503 with a clear message if MongoDB is unreachable or not a replica set.

**Other hosts:** any Docker host (Render, Fly.io, a VM) works the same way: Atlas + the env variables + a persistent disk at `UPLOAD_DIR`. Without Docker run `npm ci && npm run build && npm start` (it listens on `$PORT`). Serverless hosts need an object store for uploads; the upload code is a single file, `src/app/api/uploads/route.ts`.

## GST e-invoice setup

1. On the e-invoice portal ([sandbox](https://einv-apisandbox.nic.in/) first), register for API access and note the **client ID, client secret, API username and password**. Download the **NIC public key** file for that environment.
2. In StockPilot open **Settings → E-invoice & e-way bill**, paste these in, then click **Test saved connection**.
3. Make sure Business profile has your GSTIN, legal name, address and PIN, that products carry HSN codes, and that B2B customers have a GSTIN, address and PIN.
4. On any B2B tax invoice or credit note, click **Generate IRN**. The A4 invoice then prints the IRN, acknowledgement and signed QR code. Use **E-way bill** for consignments over ₹50,000.

The client follows NIC's published scheme (RSA-encrypted login, AES-256 session key). It was verified against a mock IRP that uses the same encryption, not against the live portal. Test with your sandbox credentials before switching to production. If NIC or your GSP publishes different endpoint versions, change them under *Advanced: API paths*.

## Offline billing

Open the POS once while online on each till. That registers the till (T1, T2…) and downloads products, stock, serials and customers. After that the POS keeps working without internet: bills get their final number from the till's own series and print as usual. They sync automatically when the connection returns, and any that hit a conflict show up under **Sales → Needs review (offline)**. Returns, voids, held bills and creating new customers need a connection.

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

- **Unit tests:** tax engine (GST/VAT, inclusive, cess, discounts, rounding), money, scanner detection, ESC/POS encoding, receipt layout, CSV escaping, import parsing, print bridge, GSTIN checksum, e-invoice JSON builder/validator, offline numbering and receipts.
- **Integration tests** (in-memory MongoDB replica set):
  - concurrent sales can never oversell
  - gap-free numbering under load
  - tenant isolation
  - returns, voids, credit limits, FEFO batches, purchase receiving
  - serial numbers (including two tills racing to sell the same IMEI)
  - offline sync (duplicates, stock conflicts, wrong-till numbers)
  - e-invoice against a **mock NIC server** (login, IRN, duplicate IRN, e-way bill, cancel, SSRF guard, encrypted credentials)
  - a **role matrix** that calls every server action as every role
- **End-to-end tests** (Playwright, production build): owner sign-up → onboarding → sale → return → team invites; then each invited role checks every page it may and may not open. Also covered: serial lifecycle, offline selling with a page reload and sync, GST e-invoice + e-way bill through the UI, product creation and scan-to-sell, unknown-barcode flow, credit sale & payment collection, purchase receiving, CSV import, labels, device settings and phone-sized POS. **Every e2e test fails on any browser console error.** A device pass then opens every page, checks nothing scrolls sideways, and completes a sale and opens its sale page on **Safari (macOS), iPhone, iPad, Android phone and a 1280×720 laptop**, plus Firefox where Playwright's Firefox runs (not yet on macOS 27).

Project layout: `src/lib` holds pure logic (tax, money, scanner, ESC/POS). `src/server/services` holds business rules and transactions. `src/server/actions` holds the authorised server actions (`withAuth(permission, schema, fn)`). `src/app` holds pages, and `print-bridge/` holds the LAN printer relay.

> On exFAT/external drives macOS creates `._*` files; they are ignored everywhere, and `npm run clean:mac` removes them.
