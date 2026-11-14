import "server-only";
import { API_ROUTES, type PathParams, type RouteName, type RouteSpec } from "@/lib/api/routes";
import * as authA from "../actions/auth";
import * as ai from "../actions/ai";
import * as einvoice from "../actions/einvoice";
import * as imports from "../actions/imports";
import * as inventory from "../actions/inventory";
import * as offline from "../actions/offline";
import * as onboarding from "../actions/onboarding";
import * as parties from "../actions/parties";
import * as products from "../actions/products";
import * as purchases from "../actions/purchases";
import * as sales from "../actions/sales";
import * as settingsA from "../actions/settings";
import type { Ctx } from "../context";
import type { ActionResult } from "../with-auth";
import type { Json } from "./json";
import * as Q from "./queries";

// Galla REST API v1: one handler for every route in src/lib/api/routes.ts (the shared list).
// Writes call the exact same validated, permission-checked actions the web app uses, so every
// business rule (stock, GST, khata, serials, offline sync) lives in one place.
//
// `ApiTypes` (bottom) is what native apps type-check against: for each route, the input a client
// sends and the `data` it gets back. It is derived from the actions and queries themselves, so it
// cannot fall out of date.

export interface Req {
  params: Record<string, string>;
  query: Q.Query;
  body: Record<string, unknown>;
  form: FormData | null;
}

type AnyAction = (input: never) => Promise<ActionResult<unknown>>;
type In<F> = F extends (input: infer I) => unknown ? I : never;
type Out<F> = F extends (...args: never[]) => Promise<infer R> ? Extract<R, { ok: true }> extends { data: infer D } ? D : never : never;

/** Type-only marker carrying what clients send and receive. Never set at runtime. */
interface Types<I, O> {
  readonly __types?: { input: I; output: O };
}
export interface ActionHandler<I = unknown, O = unknown> extends Types<I, O> {
  kind: "action";
  run: (r: Req, spec: RouteSpec) => Promise<ActionResult<unknown>>;
}
export interface QueryHandler<O = unknown> extends Types<never, O> {
  kind: "query";
  run: (ctx: Ctx, r: Req) => Promise<O>;
}
type Handler = ActionHandler<unknown, unknown> | QueryHandler<unknown>;

const pick = (src: Record<string, unknown>, keys: readonly string[] = []) => Object.fromEntries(keys.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]));

/**
 * A route backed by an action. By default the action input is the JSON body (or, for GET, the
 * route's declared query keys) plus the path parameters, which are named after input fields.
 */
function act<F extends AnyAction>(fn: F, map?: (r: Req) => In<F>): ActionHandler<In<F>, Out<F>> {
  return {
    kind: "action",
    run: (r, spec) => fn((map ? map(r) : { ...(spec.method === "GET" ? pick(r.query, spec.query) : r.body), ...r.params }) as never),
  };
}
/** An action whose REST input differs in shape from the action's own input (declared as `I`). */
const actAs =
  <I>() =>
  <F extends AnyAction>(fn: F, map: (r: Req) => In<F>): ActionHandler<I, Out<F>> => ({ kind: "action", run: (r) => fn(map(r) as never) });
/** A read; errors and permissions are handled by the dispatcher and the query itself. */
const get = <O>(run: (ctx: Ctx, r: Req) => Promise<O>): QueryHandler<O> => ({ kind: "query", run });

const body = <T>(r: Req) => r.body as T;
type Without<T, K extends string> = Omit<T, K>;
type ProductData = In<typeof products.saveProduct>["data"];
type PartyData = Without<In<typeof parties.upsertParty>["data"], "kind">;
type PoData = In<typeof purchases.savePO>["data"];
type CategoryInput = Without<In<typeof products.saveCategory>, "id" | "parentId"> & { parentId?: string | null };
type MultipartImport = { kind: "products" | "customers" | "suppliers"; file: Blob };

const HANDLERS = {
  /* ---------- auth & account ---------- */
  "auth.signIn": act(authA.signInAction),
  "auth.signUp": actAs<Without<In<typeof authA.signUpAction>, "next"> & { next?: string }>()(authA.signUpAction, (r) => ({ next: "/onboarding", ...body<{ name: string; email: string; password: string }>(r) })),
  "auth.resendVerification": act(authA.resendVerificationAction),
  "auth.requestPasswordReset": act(authA.requestResetAction),
  "auth.resetPassword": act(authA.resetPasswordAction),
  "auth.verifyTwoFactor": act(authA.verifyTwoFactorAction),
  "auth.signOut": actAs<Record<string, never>>()(authA.signOutAction, () => undefined as never),
  "account.updateName": act(authA.updateNameAction),
  "account.changePassword": act(authA.changePasswordAction),
  "account.enableTwoFactor": act(authA.enableTwoFactorAction),
  "account.confirmTwoFactor": act(authA.confirmTwoFactorAction),
  "account.disableTwoFactor": act(authA.disableTwoFactorAction),
  "account.deletionPreview": actAs<Record<string, never>>()(authA.accountDeletionPreview, () => undefined as never),
  "account.delete": act(authA.deleteAccountAction),
  "invitations.accept": act(authA.acceptInviteAction),
  me: get((ctx) => Q.me(ctx)),

  /* ---------- businesses ---------- */
  "businesses.create": act(onboarding.createBusiness),
  "businesses.switch": actAs<{ organizationId: string }>()(onboarding.switchBusiness, (r) => r.params.organizationId),

  /* ---------- dashboard & reports ---------- */
  dashboard: get((ctx) => Q.dashboard(ctx)),
  reports: get((ctx, r) => Q.reports(ctx, r.query)),

  /* ---------- products ---------- */
  "products.list": get((ctx, r) => Q.listProducts(ctx, r.query)),
  "products.formData": get((ctx) => Q.productFormData(ctx)),
  "products.search": act(products.searchProducts, (r) => ({ q: r.query.q ?? "", ...pick(r.query, ["locationId"]) })),
  "products.lookup": act(products.lookupCode, (r) => ({ code: r.query.code ?? "", ...pick(r.query, ["locationId"]) })),
  "products.get": get((ctx, r) => Q.getProduct(ctx, r.params.id)),
  "products.create": actAs<ProductData>()(products.saveProduct, (r) => ({ id: null, data: body<ProductData>(r) })),
  "products.update": actAs<ProductData & { id: string }>()(products.saveProduct, (r) => ({ id: r.params.id, data: body<ProductData>(r) })),
  "products.setActive": act(products.archiveProduct),
  "variants.serials": act(products.availableSerials),
  "variants.batches": act(inventory.variantBatches),

  "categories.list": get((ctx) => Q.listCategories(ctx)),
  "categories.create": actAs<CategoryInput>()(products.saveCategory, (r) => ({ id: null, parentId: null, ...body<CategoryInput>(r) })),
  "categories.update": actAs<CategoryInput & { id: string }>()(products.saveCategory, (r) => ({ parentId: null, ...body<CategoryInput>(r), id: r.params.id })),
  "categories.delete": act(products.deleteCategory),

  "taxRates.list": act(products.listTaxRates, () => ({})),
  "taxRates.create": actAs<Without<In<typeof settingsA.saveTaxRate>, "id">>()(settingsA.saveTaxRate, (r) => ({ ...body<Without<In<typeof settingsA.saveTaxRate>, "id">>(r), id: null })),
  "taxRates.update": act(settingsA.saveTaxRate),
  "taxRates.delete": act(settingsA.deleteTaxRate),

  "locations.list": get((ctx) => Q.listLocations(ctx)),
  "locations.create": actAs<Without<In<typeof inventory.saveLocation>, "id">>()(inventory.saveLocation, (r) => ({ ...body<Without<In<typeof inventory.saveLocation>, "id">>(r), id: null })),
  "locations.update": act(inventory.saveLocation),

  /* ---------- inventory ---------- */
  "stock.list": get((ctx, r) => Q.listStock(ctx, r.query)),
  "stock.moves": get((ctx, r) => Q.listMoves(ctx, r.query)),
  "serials.list": get((ctx, r) => Q.listSerials(ctx, r.query)),
  "stock.adjust": act(inventory.adjust),
  "stock.transfer": act(inventory.transfer),
  "stock.count": act(inventory.count),

  /* ---------- point of sale & sales ---------- */
  "sales.checkout": act(sales.checkout),
  "sales.list": get((ctx, r) => Q.listSales(ctx, r.query)),
  "sales.get": act(sales.receiptData),
  "sales.detail": get((ctx, r) => Q.saleDetail(ctx, r.params.saleId)),
  "sales.refund": act(sales.refundSale),
  "sales.void": act(sales.cancelSale),
  "sales.shareLink": act(sales.billShareLink),
  "sales.markReviewed": act(offline.markSaleReviewed),
  "sales.einvoice": act(einvoice.createIrn),
  "sales.einvoiceCancel": act(einvoice.voidIrn),
  "sales.ewayBill": act(einvoice.createEwb),
  "sales.gstJson": act(einvoice.downloadGstJson),

  "heldBills.list": act(sales.listHeldBills),
  "heldBills.hold": act(sales.holdBill),
  "heldBills.resume": act(sales.resumeHeldBill),
  "heldBills.discard": act(sales.discardHeldBill),
  "pos.batches": act(sales.listBatches),
  "pos.customers": act(sales.findCustomers, (r) => ({ q: r.query.q ?? "" })),
  "pos.addCustomer": act(sales.quickAddCustomer),
  "pos.snapshot": act(offline.getPosSnapshot),
  "pos.registerTill": act(offline.registerTill),
  "pos.syncOffline": act(offline.syncOfflineSales),
  "scanSessions.start": actAs<Record<string, never>>()(sales.startRemoteScan, () => ({})),
  "scanSessions.stop": act(sales.stopRemoteScan),

  /* ---------- customers, suppliers, khata ---------- */
  "customers.list": get((ctx, r) => Q.listParties(ctx, "customer", r.query)),
  "customers.get": get((ctx, r) => Q.getParty(ctx, "customer", r.params.id)),
  "customers.create": actAs<PartyData>()(parties.upsertParty, (r) => ({ id: null, data: { ...body<PartyData>(r), kind: "customer" as const } })),
  "customers.update": actAs<PartyData & { id: string }>()(parties.upsertParty, (r) => ({ id: r.params.id, data: { ...body<PartyData>(r), kind: "customer" as const } })),
  "suppliers.list": get((ctx, r) => Q.listParties(ctx, "supplier", r.query)),
  "suppliers.get": get((ctx, r) => Q.getParty(ctx, "supplier", r.params.id)),
  "suppliers.create": actAs<PartyData>()(parties.upsertParty, (r) => ({ id: null, data: { ...body<PartyData>(r), kind: "supplier" as const } })),
  "suppliers.update": actAs<PartyData & { id: string }>()(parties.upsertParty, (r) => ({ id: r.params.id, data: { ...body<PartyData>(r), kind: "supplier" as const } })),
  "parties.setActive": act(parties.archiveParty),
  "parties.openBills": act(parties.openBills),
  "parties.addPayment": act(parties.addPayment),
  "parties.addUdhaar": act(parties.addUdhaarEntry),
  "ledger.reverse": act(parties.undoEntry),
  khata: get((ctx, r) => Q.khata(ctx, r.query)),

  /* ---------- purchases ---------- */
  "purchases.list": get((ctx, r) => Q.listPurchases(ctx, r.query)),
  "purchases.get": get((ctx, r) => Q.getPurchase(ctx, r.params.id)),
  "purchases.create": actAs<PoData>()(purchases.savePO, (r) => ({ id: null, data: body<PoData>(r) })),
  "purchases.update": actAs<PoData & { id: string }>()(purchases.savePO, (r) => ({ id: r.params.id, data: body<PoData>(r) })),
  "purchases.receive": act(purchases.receivePO),
  "purchases.return": act(purchases.returnPO),
  "purchases.cancel": act(purchases.cancelPO),
  "purchases.attach": act(purchases.attachFiles),
  "purchases.detach": act(purchases.detachFile),
  "purchaseBills.create": act(purchases.savePurchaseBill),

  /* ---------- settings, team, audit, import ---------- */
  "settings.get": get((ctx) => Q.settings(ctx)),
  "settings.updateBusiness": act(settingsA.updateBusiness),
  "settings.updateReceipt": act(settingsA.updateReceipt),
  "settings.updateEinvoice": act(einvoice.saveEinvoice),
  "settings.testEinvoice": act(einvoice.testEinvoice, () => ({})),
  "members.list": get((ctx) => Q.members(ctx)),
  "members.invite": act(authA.inviteMemberAction),
  "members.cancelInvitation": act(authA.cancelInvitationAction),
  "members.updateRole": act(authA.updateMemberRoleAction),
  "members.remove": act(authA.removeMemberAction),
  audit: get((ctx, r) => Q.auditLog(ctx, r.query)),
  "inventory.reorder": get((ctx) => Q.reorderList(ctx)),
  "imports.preview": actAs<MultipartImport>()(imports.previewImport, (r) => r.form ?? new FormData()),
  "ai.menu": actAs<{ file: Blob }>()(ai.readMenuFile, (r) => r.form ?? new FormData()),
  "ai.addProducts": act(ai.addMenuProducts),
  "ai.chat": act(ai.askGalla),
  "imports.run": actAs<MultipartImport>()(imports.runImport, (r) => r.form ?? new FormData()),
} satisfies { [K in RouteName]: Handler };

export type Route = RouteSpec & { name: RouteName } & Handler;

export const ROUTES: Route[] = (Object.keys(API_ROUTES) as RouteName[]).map((name) => ({ ...(API_ROUTES[name] as RouteSpec), name, ...(HANDLERS[name] as Handler) }));

/** Matches "/sales/:saleId/refund" against a request path. */
export function match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  const parts = path.split("/").filter(Boolean);
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const pattern = route.path.split("/").filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pattern.length && ok; i++) {
      const seg = pattern[i];
      if (!seg.startsWith(":")) ok = seg === parts[i];
      else {
        try {
          params[seg.slice(1)] = decodeURIComponent(parts[i]);
        } catch {
          ok = false;
        }
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

/* ---------------- types for clients ---------------- */

type Spec<K extends RouteName> = (typeof API_ROUTES)[K];
type QueryKeys<S> = S extends { query: readonly (infer Q extends string)[] } ? Q : never;
type QueryInput<K extends RouteName> = { [P in PathParams<Spec<K>["path"]>]: string } & { [P in QueryKeys<Spec<K>>]?: string };

/** For every route: what a client sends (path fields + body/query, flat) and the `data` it gets back (as parsed JSON). */
export type ApiTypes = {
  [K in RouteName]: (typeof HANDLERS)[K] extends ActionHandler<infer I, infer O>
    ? { input: I; output: Spec<K> extends { public: true } ? (Json<O> extends object ? Json<O> : Record<never, never>) & { token?: string } : Json<O> }
    : (typeof HANDLERS)[K] extends QueryHandler<infer O>
      ? { input: QueryInput<K>; output: Json<O> }
      : never;
};

