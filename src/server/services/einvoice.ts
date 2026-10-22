import "server-only";
import { buildEinvoice, ewbBulkJson, ewbByIrnPayload, validateEinvoice, type EwbDetails } from "@/lib/einvoice";
import { AppError, getOrgSettings, type Ctx } from "../context";
import { decryptSecret, encryptSecret } from "../crypto";
import { EinvoiceConfig, Party, Sale, type SaleDoc } from "../models";
import { assertAllowedUrl, NicClient, NicError, type NicConfig, type NicToken } from "./nic";
import { audit } from "./system";

const SANDBOX = "https://einv-apisandbox.nic.in";
const PRODUCTION = "https://api.einvoice1.gst.gov.in";

interface Secrets { clientId: string; clientSecret: string; username: string; password: string; publicKey: string }

export async function getEinvoiceSettings(ctx: Ctx) {
  const c = await EinvoiceConfig.findOne({ orgId: ctx.orgId }).lean();
  const secrets: Partial<Secrets> = c?.secrets ? JSON.parse(decryptSecret(c.secrets)) : {};
  return {
    enabled: c?.enabled ?? false, environment: (c?.environment ?? "sandbox") as "sandbox" | "production", baseUrl: c?.baseUrl ?? SANDBOX,
    paths: { auth: c?.paths?.auth ?? "/eivital/v1.04/auth", invoice: c?.paths?.invoice ?? "/eicore/v1.03/Invoice", cancel: c?.paths?.cancel ?? "/eicore/v1.03/Invoice/Cancel", ewb: c?.paths?.ewb ?? "/eiewb/v1.03/ewaybill" },
    clientId: secrets.clientId ?? "", username: secrets.username ?? "",
    // Secrets never leave the server; the UI only learns whether they are set.
    hasClientSecret: !!secrets.clientSecret, hasPassword: !!secrets.password, hasPublicKey: !!secrets.publicKey,
  };
}

export interface EinvoiceSettingsInput {
  enabled: boolean;
  environment: "sandbox" | "production";
  baseUrl: string;
  paths: { auth: string; invoice: string; cancel: string; ewb: string };
  clientId: string;
  username: string;
  clientSecret?: string;
  password?: string;
  publicKey?: string;
}

export async function saveEinvoiceSettings(ctx: Ctx, i: EinvoiceSettingsInput) {
  assertAllowedUrl(i.baseUrl);
  const cur = await EinvoiceConfig.findOne({ orgId: ctx.orgId }).lean();
  const old: Partial<Secrets> = cur?.secrets ? JSON.parse(decryptSecret(cur.secrets)) : {};
  const secrets: Secrets = {
    clientId: i.clientId, username: i.username,
    clientSecret: i.clientSecret || old.clientSecret || "", password: i.password || old.password || "", publicKey: i.publicKey || old.publicKey || "",
  };
  await EinvoiceConfig.updateOne(
    { orgId: ctx.orgId },
    { $set: { enabled: i.enabled, environment: i.environment, baseUrl: i.baseUrl.replace(/\/$/, ""), paths: i.paths, secrets: encryptSecret(JSON.stringify(secrets)), token: "" } },
    { upsert: true },
  );
  await audit(ctx, "update", "settings", ctx.orgId, `Updated e-invoice settings (${i.environment}${i.enabled ? ", enabled" : ""})`);
}

export const defaultBaseUrl = (env: "sandbox" | "production") => (env === "sandbox" ? SANDBOX : PRODUCTION);

async function client(ctx: Ctx) {
  const c = await EinvoiceConfig.findOne({ orgId: ctx.orgId }).lean();
  if (!c?.enabled || !c.secrets) throw new AppError("INVALID", "Turn on e-invoicing and add your NIC API credentials in Settings → E-invoice first.");
  const s = JSON.parse(decryptSecret(c.secrets)) as Secrets;
  const settings = await getOrgSettings(ctx.orgId);
  if (!s.clientId || !s.clientSecret || !s.username || !s.password || !s.publicKey) throw new AppError("INVALID", "Some NIC API credentials are missing (Settings → E-invoice).");
  const cfg: NicConfig = { baseUrl: c.baseUrl, paths: { auth: c.paths!.auth!, invoice: c.paths!.invoice!, cancel: c.paths!.cancel!, ewb: c.paths!.ewb! }, ...s, gstin: settings.taxId ?? "" };
  let token: NicToken | null = null;
  try {
    token = c.token ? (JSON.parse(decryptSecret(c.token)) as NicToken) : null;
  } catch {}
  return new NicClient(cfg, token, async (t) => {
    await EinvoiceConfig.updateOne({ orgId: ctx.orgId }, { $set: { token: encryptSecret(JSON.stringify(t)) } });
  });
}

export async function testConnection(ctx: Ctx) {
  try {
    await (await client(ctx)).authenticate(true);
  } catch (e) {
    if (e instanceof NicError) throw new AppError("INVALID", `NIC said: ${e.message}`);
    throw e;
  }
}

const ddmmyyyy = (d: Date, tz: string) => d.toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });

/** Builds and validates the e-invoice JSON for a sale (tax invoice or credit note to a registered buyer). */
export async function einvoiceForSale(ctx: Ctx, saleId: string) {
  const s = await getOrgSettings(ctx.orgId);
  const sale = await Sale.findOne({ orgId: ctx.orgId, _id: saleId, status: "completed" }).lean<SaleDoc>();
  if (!sale) throw new AppError("NOT_FOUND", "Sale not found");
  if (s.taxMode !== "GST") throw new AppError("INVALID", "E-invoicing applies to GST businesses only.");
  const customer = sale.customerId ? await Party.findOne({ orgId: ctx.orgId, _id: sale.customerId }).lean() : null;
  if (!customer?.taxId) throw new AppError("INVALID", "E-invoices are only for registered (B2B) customers with a GSTIN.");
  const original = sale.returnOf ? await Sale.findOne({ orgId: ctx.orgId, _id: sale.returnOf }, { number: 1, completedAt: 1 }).lean() : null;
  const a = s.address ?? {};
  const ca = customer.address ?? {};
  const json = buildEinvoice({
    docType: sale.kind === "return" ? "CRN" : "INV",
    docNo: sale.number ?? "",
    docDate: ddmmyyyy(sale.completedAt!, s.timezone),
    seller: { gstin: s.taxId ?? "", legalName: s.legalName || ctx.orgName, tradeName: ctx.orgName, address1: a.line1 ?? "", address2: a.line2 ?? undefined, location: a.city ?? "", pin: a.postalCode ?? "", stateCode: s.stateCode ?? "", phone: s.phone ?? undefined, email: s.email ?? undefined },
    buyer: { gstin: customer.taxId, legalName: customer.name, address1: ca.line1 ?? "", address2: ca.line2 ?? undefined, location: ca.city ?? "", pin: ca.postalCode ?? "", stateCode: customer.stateCode || customer.taxId.slice(0, 2), phone: customer.phone, email: customer.email },
    lines: sale.lines.map((l) => ({
      name: l.name ?? "", hsn: l.hsn ?? "", qty: l.qty, scale: l.scale ?? 1, unit: l.unit ?? "pcs", discount: l.discount ?? 0, taxable: l.taxable ?? 0, rateBp: l.rateBp ?? 0, cessBp: l.cessBp ?? 0,
      inclusive: !!l.inclusive, cgst: l.cgst ?? 0, sgst: l.sgst ?? 0, igst: l.igst ?? 0, cess: l.cess ?? 0, total: l.total ?? 0, serials: l.serials, batchNo: l.batchNo ?? undefined,
    })),
    roundOff: sale.roundOff ?? 0,
    grandTotal: sale.grandTotal ?? 0,
    original: original ? { no: original.number ?? "", date: ddmmyyyy(original.completedAt!, s.timezone) } : undefined,
  });
  return { sale, json, errors: validateEinvoice(json) };
}

async function fail(ctx: Ctx, saleId: string, errors: string[]): Promise<never> {
  await Sale.updateOne({ orgId: ctx.orgId, _id: saleId }, { $set: { "einvoice.status": "failed", "einvoice.errors": errors } });
  throw new AppError("INVALID", errors.join(" "));
}

export async function generateIrn(ctx: Ctx, saleId: string) {
  const { sale, json, errors } = await einvoiceForSale(ctx, saleId);
  if (sale.einvoice?.status === "generated") throw new AppError("CONFLICT", "An IRN already exists for this invoice.");
  if (errors.length) return fail(ctx, saleId, errors);
  const nic = await client(ctx);
  try {
    const r = await nic.generateIrn(json);
    const einvoice = {
      status: "generated", irn: r.Irn, ackNo: String(r.AckNo), ackDt: r.AckDt, signedQr: r.SignedQRCode, errors: [],
      ...(r.EwbNo ? { ewbNo: String(r.EwbNo), ewbDt: r.EwbDt ?? undefined, ewbValidTill: r.EwbValidTill ?? undefined } : {}),
    };
    await Sale.updateOne({ orgId: ctx.orgId, _id: saleId }, { $set: { einvoice } });
    await audit(ctx, "einvoice", "sale", saleId, `IRN generated for ${sale.number}`, { ackNo: einvoice.ackNo });
    return { irn: r.Irn, ackNo: einvoice.ackNo };
  } catch (e) {
    if (e instanceof NicError) return fail(ctx, saleId, e.errors);
    throw e;
  }
}

export const CANCEL_REASONS = { "1": "Duplicate", "2": "Data entry mistake", "3": "Order cancelled", "4": "Other" } as const;

export async function cancelIrn(ctx: Ctx, saleId: string, reason: keyof typeof CANCEL_REASONS, remark: string) {
  const sale = await Sale.findOne({ orgId: ctx.orgId, _id: saleId }).lean<SaleDoc>();
  if (sale?.einvoice?.status !== "generated" || !sale.einvoice.irn) throw new AppError("INVALID", "There is no active IRN on this invoice.");
  const ack = Date.parse(`${(sale.einvoice.ackDt ?? "").replace(" ", "T")}+05:30`);
  if (Number.isFinite(ack) && Date.now() - ack > 24 * 3600e3) throw new AppError("INVALID", "IRNs can only be cancelled within 24 hours. Issue a credit note instead.");
  try {
    await (await client(ctx)).cancelIrn(sale.einvoice.irn, reason, remark || CANCEL_REASONS[reason]);
  } catch (e) {
    if (e instanceof NicError) throw new AppError("INVALID", e.message);
    throw e;
  }
  await Sale.updateOne({ orgId: ctx.orgId, _id: saleId }, { $set: { "einvoice.status": "cancelled", "einvoice.cancelledAt": new Date() } });
  await audit(ctx, "einvoice_cancel", "sale", saleId, `IRN cancelled for ${sale.number}`, { reason });
}

export async function generateEwb(ctx: Ctx, saleId: string, d: EwbDetails) {
  const sale = await Sale.findOne({ orgId: ctx.orgId, _id: saleId }).lean<SaleDoc>();
  if (sale?.einvoice?.status !== "generated" || !sale.einvoice.irn) throw new AppError("INVALID", "Generate the IRN first, or download the e-way bill JSON for the portal.");
  if (sale.einvoice.ewbNo) throw new AppError("CONFLICT", "An e-way bill already exists for this invoice.");
  try {
    const r = await (await client(ctx)).generateEwb(ewbByIrnPayload(sale.einvoice.irn, d));
    await Sale.updateOne({ orgId: ctx.orgId, _id: saleId }, { $set: { "einvoice.ewbNo": String(r.EwbNo), "einvoice.ewbDt": r.EwbDt, "einvoice.ewbValidTill": r.EwbValidTill ?? "" } });
    await audit(ctx, "ewaybill", "sale", saleId, `E-way bill ${r.EwbNo} for ${sale.number}`);
    return { ewbNo: String(r.EwbNo) };
  } catch (e) {
    if (e instanceof NicError) throw new AppError("INVALID", e.message);
    throw e;
  }
}

export async function portalJson(ctx: Ctx, saleId: string, type: "einvoice" | "ewaybill", d?: EwbDetails) {
  const { json, errors } = await einvoiceForSale(ctx, saleId);
  if (errors.length) throw new AppError("INVALID", errors.join(" "));
  return type === "einvoice" ? [json] : ewbBulkJson(json, d ?? { transMode: "1", distance: 0 });
}
