// Galla REST API v1: the single list of endpoints, shared by the server and every client.
//
// The server (src/server/api/routes.ts) attaches exactly one handler to each name below; TypeScript
// refuses to compile if a route has no handler or a handler has no route. Native apps import this
// file at runtime to build URLs, and import the server's `ApiTypes` (types only) for request and
// response shapes, so a renamed path, a new required field or a changed response breaks the app's
// type check instead of breaking users. Keep this file free of server-only imports.
//
// Path parameters are named after the action input field they fill (":saleId" fills `saleId`), so
// clients send one flat input object: path fields go into the URL, the rest into the JSON body
// (or the query string for GET).

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export interface RouteSpec {
  method: Method;
  path: string;
  summary: string;
  /** Query-string keys a GET route reads. */
  query?: readonly string[];
  /** Needs no session (sign-in style routes). */
  public?: boolean;
  /** Body is multipart/form-data instead of JSON. */
  multipart?: boolean;
}

const PAGE = ["page"] as const;

export const API_ROUTES = {
  /* ---------- auth & account (Better Auth's own endpoints live under /api/auth/*) ---------- */
  "auth.signIn": { method: "POST", path: "/auth/sign-in", summary: "Sign in with email + password. Returns { token } for native apps (send as Authorization: Bearer).", public: true },
  "auth.signUp": { method: "POST", path: "/auth/sign-up", summary: "Create an account; a verification email is sent.", public: true },
  "auth.resendVerification": { method: "POST", path: "/auth/verification-email", summary: "Resend the verification email.", public: true },
  "auth.requestPasswordReset": { method: "POST", path: "/auth/password-reset", summary: "Email a password reset link.", public: true },
  "auth.resetPassword": { method: "POST", path: "/auth/password-reset/confirm", summary: "Set a new password with the emailed token.", public: true },
  "auth.verifyTwoFactor": { method: "POST", path: "/auth/two-factor/verify", summary: "Finish a sign-in that needs a 2FA code.", public: true },
  "auth.signOut": { method: "POST", path: "/auth/sign-out", summary: "End this session (the bearer token stops working)." },
  "account.updateName": { method: "PUT", path: "/account/name", summary: "Change your display name ({ name })." },
  "account.changePassword": { method: "POST", path: "/account/password", summary: "Change password." },
  "account.enableTwoFactor": { method: "POST", path: "/account/two-factor/enable", summary: "Start 2FA setup (returns the TOTP URI and backup codes)." },
  "account.confirmTwoFactor": { method: "POST", path: "/account/two-factor/confirm", summary: "Confirm 2FA with a code." },
  "account.disableTwoFactor": { method: "POST", path: "/account/two-factor/disable", summary: "Turn 2FA off." },
  "account.deletionPreview": { method: "GET", path: "/account/deletion", summary: "What deleting this account would remove, and what blocks it." },
  "account.delete": { method: "POST", path: "/account/delete", summary: "Permanently delete this account ({ password, confirm: \"DELETE\" })." },
  "invitations.accept": { method: "POST", path: "/invitations/:invitationId/accept", summary: "Accept a team invitation." },
  me: { method: "GET", path: "/me", summary: "Signed-in user, active business (currency, locale, role, settings) and all their businesses." },

  /* ---------- businesses ---------- */
  "businesses.create": { method: "POST", path: "/businesses", summary: "Create a business (onboarding)." },
  "businesses.switch": { method: "POST", path: "/businesses/:organizationId/switch", summary: "Make another business active." },

  /* ---------- dashboard & reports ---------- */
  dashboard: { method: "GET", path: "/dashboard", summary: "Today vs yesterday, 30-day sales, top products, low stock, expiring batches, dues, recent bills." },
  reports: { method: "GET", path: "/reports", summary: "All reports for ?from=YYYY-MM-DD&to=YYYY-MM-DD (sales, payments, cashiers, categories, GST/HSN, stock, expiry, dues).", query: ["from", "to"] },

  /* ---------- products ---------- */
  "products.list": { method: "GET", path: "/products", summary: "List products (?q, ?category, ?status=archived, ?page).", query: ["q", "category", "status", ...PAGE] },
  "products.formData": { method: "GET", path: "/products/form-data", summary: "Categories, tax rates, locations and defaults for the product form." },
  "products.search": { method: "GET", path: "/products/search", summary: "POS search (?q, ?locationId).", query: ["q", "locationId"] },
  "products.lookup": { method: "GET", path: "/products/lookup", summary: "Find by barcode/SKU/serial (?code, ?locationId).", query: ["code", "locationId"] },
  "products.get": { method: "GET", path: "/products/:id", summary: "Product with stock by location and recent movements." },
  "products.create": { method: "POST", path: "/products", summary: "Create a product." },
  "products.update": { method: "PUT", path: "/products/:id", summary: "Update a product." },
  "products.setActive": { method: "PUT", path: "/products/:id/active", summary: "Archive or restore ({ active })." },
  "variants.serials": { method: "GET", path: "/variants/:variantId/serials", summary: "Serials in stock (?locationId).", query: ["locationId"] },
  "variants.batches": { method: "GET", path: "/variants/:variantId/batches", summary: "Batches with stock (?locationId).", query: ["locationId"] },

  "categories.list": { method: "GET", path: "/categories", summary: "List categories." },
  "categories.create": { method: "POST", path: "/categories", summary: "Create a category." },
  "categories.update": { method: "PUT", path: "/categories/:id", summary: "Rename/move a category." },
  "categories.delete": { method: "DELETE", path: "/categories/:id", summary: "Delete an empty category." },

  "taxRates.list": { method: "GET", path: "/tax-rates", summary: "List tax rates." },
  "taxRates.create": { method: "POST", path: "/tax-rates", summary: "Create a tax rate." },
  "taxRates.update": { method: "PUT", path: "/tax-rates/:id", summary: "Update a tax rate." },
  "taxRates.delete": { method: "DELETE", path: "/tax-rates/:id", summary: "Delete a tax rate." },

  "locations.list": { method: "GET", path: "/locations", summary: "Shops and warehouses." },
  "locations.create": { method: "POST", path: "/locations", summary: "Add a location." },
  "locations.update": { method: "PUT", path: "/locations/:id", summary: "Update a location." },

  /* ---------- inventory ---------- */
  "stock.list": { method: "GET", path: "/stock", summary: "Stock by product and location (?q, ?location, ?filter=low, ?page).", query: ["q", "location", "filter", ...PAGE] },
  "stock.moves": { method: "GET", path: "/stock/moves", summary: "Movement history (?from, ?to, ?type, ?product, ?page).", query: ["from", "to", "type", "product", ...PAGE] },
  "serials.list": { method: "GET", path: "/serials", summary: "Serial / IMEI register (?q, ?status, ?page).", query: ["q", "status", ...PAGE] },
  "stock.adjust": { method: "POST", path: "/stock/adjustments", summary: "Adjust stock with a reason." },
  "stock.transfer": { method: "POST", path: "/stock/transfers", summary: "Transfer stock between locations." },
  "stock.count": { method: "POST", path: "/stock/counts", summary: "Post a stock count." },

  /* ---------- point of sale & sales ---------- */
  "sales.checkout": { method: "POST", path: "/sales", summary: "Complete a sale (checkout)." },
  "sales.list": { method: "GET", path: "/sales", summary: "Bills (?from, ?to, ?q, ?type=return|credit|void|invoice|review, ?page).", query: ["from", "to", "q", "type", ...PAGE] },
  "sales.get": { method: "GET", path: "/sales/:saleId", summary: "Full bill: lines, taxes, payments, customer, e-invoice." },
  "sales.detail": { method: "GET", path: "/sales/:saleId/detail", summary: "Bill screen: the bill plus returned quantities, credit notes, sync issues and what this role may do." },
  "sales.refund": { method: "POST", path: "/sales/:saleId/refund", summary: "Return items (credit note)." },
  "sales.void": { method: "POST", path: "/sales/:saleId/void", summary: "Void a same-day sale ({ reason })." },
  "sales.shareLink": { method: "POST", path: "/sales/:saleId/share-link", summary: "Secure link for WhatsApp bills." },
  "sales.markReviewed": { method: "POST", path: "/sales/:saleId/reviewed", summary: "Mark an offline-sync issue as reviewed." },
  "sales.einvoice": { method: "POST", path: "/sales/:saleId/einvoice", summary: "Generate IRN + signed QR." },
  "sales.einvoiceCancel": { method: "POST", path: "/sales/:saleId/einvoice/cancel", summary: "Cancel the IRN ({ reason, remark })." },
  "sales.ewayBill": { method: "POST", path: "/sales/:saleId/eway-bill", summary: "Generate an e-way bill ({ details })." },
  "sales.gstJson": { method: "POST", path: "/sales/:saleId/gst-json", summary: "GST JSON for manual upload ({ type, details? })." },

  "heldBills.list": { method: "GET", path: "/held-bills", summary: "Parked bills (?locationId).", query: ["locationId"] },
  "heldBills.hold": { method: "POST", path: "/held-bills", summary: "Park a bill (F8)." },
  "heldBills.resume": { method: "POST", path: "/held-bills/:id/resume", summary: "Bring a parked bill back (F9)." },
  "heldBills.discard": { method: "DELETE", path: "/held-bills/:id", summary: "Discard a parked bill." },
  "pos.batches": { method: "GET", path: "/pos/batches", summary: "Batches a cashier can sell from (?variantId, ?locationId).", query: ["variantId", "locationId"] },
  "pos.customers": { method: "GET", path: "/pos/customers", summary: "Customer picker search (?q).", query: ["q"] },
  "pos.addCustomer": { method: "POST", path: "/pos/customers", summary: "Quick-add a customer at the till." },
  "pos.snapshot": { method: "GET", path: "/pos/snapshot", summary: "Offline catalogue snapshot for a till (?locationId).", query: ["locationId"] },
  "pos.registerTill": { method: "POST", path: "/pos/tills", summary: "Register this device as a till ({ name })." },
  "pos.syncOffline": { method: "POST", path: "/pos/offline-sales", summary: "Sync bills made offline ({ deviceToken, sales })." },
  "scanSessions.start": { method: "POST", path: "/scan-sessions", summary: "Pair a phone as a wireless scanner (returns a token; phones push to /api/scan/:token)." },
  "scanSessions.stop": { method: "DELETE", path: "/scan-sessions/:token", summary: "End a phone-scanner pairing." },

  /* ---------- customers, suppliers, khata ---------- */
  "customers.list": { method: "GET", path: "/customers", summary: "Customers (?q, ?due=1, ?page).", query: ["q", "due", ...PAGE] },
  "customers.get": { method: "GET", path: "/customers/:id", summary: "Customer with bills, running-balance statement and totals." },
  "customers.create": { method: "POST", path: "/customers", summary: "Add a customer." },
  "customers.update": { method: "PUT", path: "/customers/:id", summary: "Update a customer." },
  "suppliers.list": { method: "GET", path: "/suppliers", summary: "Suppliers (?q, ?due=1, ?page).", query: ["q", "due", ...PAGE] },
  "suppliers.get": { method: "GET", path: "/suppliers/:id", summary: "Supplier with purchases, statement and totals." },
  "suppliers.create": { method: "POST", path: "/suppliers", summary: "Add a supplier." },
  "suppliers.update": { method: "PUT", path: "/suppliers/:id", summary: "Update a supplier." },
  "parties.setActive": { method: "PUT", path: "/parties/:id/active", summary: "Archive or restore a customer/supplier ({ active })." },
  "parties.openBills": { method: "GET", path: "/parties/:partyId/open-bills", summary: "Unpaid bills a payment can be set against." },
  "parties.addPayment": { method: "POST", path: "/parties/:partyId/payments", summary: "Record a payment (optionally against chosen bills)." },
  "parties.addUdhaar": { method: "POST", path: "/parties/:partyId/udhaar", summary: "Khata: udhaar given/taken without a bill." },
  "ledger.reverse": { method: "POST", path: "/ledger/:entryId/reverse", summary: "Undo a khata entry or payment ({ reason }); owners/managers." },
  khata: { method: "GET", path: "/khata", summary: "Khata balances (?tab=suppliers, ?q, ?page) with you'll get / you'll give totals.", query: ["tab", "q", ...PAGE] },

  /* ---------- purchases ---------- */
  "purchases.list": { method: "GET", path: "/purchases", summary: "Purchase orders and bills (?q, ?status, ?page).", query: ["q", "status", ...PAGE] },
  "purchases.get": { method: "GET", path: "/purchases/:id", summary: "Purchase with receipts, payments and attachments." },
  "purchases.create": { method: "POST", path: "/purchases", summary: "Create a purchase order." },
  "purchases.update": { method: "PUT", path: "/purchases/:id", summary: "Edit a purchase order." },
  "purchases.receive": { method: "POST", path: "/purchases/:id/receive", summary: "Receive goods (partial allowed)." },
  "purchases.return": { method: "POST", path: "/purchases/:id/return", summary: "Return goods to the supplier." },
  "purchases.cancel": { method: "POST", path: "/purchases/:id/cancel", summary: "Cancel a purchase order." },
  "purchases.attach": { method: "POST", path: "/purchases/:id/attachments", summary: "Attach uploaded bill photos/PDFs ({ files })." },
  "purchases.detach": { method: "DELETE", path: "/purchases/:id/attachments", summary: "Remove an attachment ({ url })." },
  "purchaseBills.create": { method: "POST", path: "/purchase-bills", summary: "Record a supplier bill in one step (stock in + payment)." },

  /* ---------- settings, team, audit, import ---------- */
  "settings.get": { method: "GET", path: "/settings", summary: "Business, receipt, scanner and e-invoice settings (owner)." },
  "settings.updateBusiness": { method: "PUT", path: "/settings/business", summary: "Update business details." },
  "settings.updateReceipt": { method: "PUT", path: "/settings/receipt", summary: "Update receipt and scanner settings." },
  "settings.updateEinvoice": { method: "PUT", path: "/settings/einvoice", summary: "Save GST e-invoice API settings." },
  "settings.testEinvoice": { method: "POST", path: "/settings/einvoice/test", summary: "Test the e-invoice connection." },
  "members.list": { method: "GET", path: "/members", summary: "Team members and pending invitations." },
  "members.invite": { method: "POST", path: "/members/invitations", summary: "Invite by email ({ email, role })." },
  "members.cancelInvitation": { method: "DELETE", path: "/members/invitations/:invitationId", summary: "Cancel an invitation." },
  "members.updateRole": { method: "PUT", path: "/members/:memberId/role", summary: "Change a member's role ({ role })." },
  "members.remove": { method: "DELETE", path: "/members/:memberId", summary: "Remove a member." },
  audit: { method: "GET", path: "/audit", summary: "Audit log (?entity, ?q, ?page).", query: ["entity", "q", ...PAGE] },
  "inventory.reorder": { method: "GET", path: "/inventory/reorder", summary: "Low-stock items grouped by supplier with suggested order quantities." },
  "imports.preview": { method: "POST", path: "/imports/preview", summary: "Preview an Excel/CSV import (multipart: kind, file).", multipart: true },
  "ai.menu": { method: "POST", path: "/ai/menu", summary: "Read a menu / price list from a photo or PDF into draft product rows (multipart: file). Nothing is saved.", multipart: true },
  "ai.chat": { method: "POST", path: "/ai/chat", summary: "Ask Galla: a read-only assistant ({ messages: [{ role, content }] } -> { reply })." },
  "ai.addProducts": { method: "POST", path: "/ai/menu/products", summary: "Save reviewed menu rows as products." },
  "imports.run": { method: "POST", path: "/imports", summary: "Run an Excel/CSV import (multipart: kind, file).", multipart: true },
} as const satisfies Record<string, RouteSpec>;

export type RouteName = keyof typeof API_ROUTES;

/** ":saleId" style placeholders of a path, as a union of names. */
export type PathParams<P extends string> = P extends `${string}:${infer K}/${infer Rest}` ? K | PathParams<`/${Rest}`> : P extends `${string}:${infer K}` ? K : never;

export const pathParams = (path: string) => [...path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]);

/** Fills ":name" placeholders; throws when one is missing so a bad call never hits the wrong URL. */
export function buildPath(path: string, values: Record<string, unknown>) {
  return path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    const v = values[k];
    if (v === undefined || v === null || v === "") throw new Error(`Missing path parameter "${k}" for ${path}`);
    return encodeURIComponent(String(v));
  });
}

/**
 * Oldest app build each platform may use. The server rejects older apps with 426 UPGRADE_REQUIRED
 * once an operator raises these (MIN_ANDROID_VERSION / MIN_IOS_VERSION / MIN_DESKTOP_VERSION).
 * Header sent by clients: `X-Galla-Client: android/1.4.0`.
 */
export const CLIENT_HEADER = "x-galla-client";
export const API_VERSION = 1;

/** "1.10.2" > "1.9.9"; non-numeric parts count as 0. */
export function compareVersions(a: string, b: string) {
  const pa = a.split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
