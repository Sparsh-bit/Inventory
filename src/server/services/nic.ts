import "server-only";
import { constants, createCipheriv, createDecipheriv, publicEncrypt, randomBytes } from "node:crypto";
import { env } from "@/env";
import { AppError } from "../context";

// Client for the NIC Invoice Registration Portal (IRP) API.
// Auth: Data = base64(RSA-PKCS1(base64(JSON{UserName,Password,AppKey,ForceRefreshAccessToken}))).
// The returned Sek is AES-256-ECB encrypted with AppKey; every payload is AES-256-ECB(Sek) base64.

export interface NicConfig {
  baseUrl: string;
  paths: { auth: string; invoice: string; cancel: string; ewb: string };
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  gstin: string;
  publicKey: string; // PEM from the NIC portal
}
export interface NicToken { authToken: string; sek: string; expiresAt: number } // sek base64 (decrypted key bytes)

const KNOWN_HOSTS = ["einv-apisandbox.nic.in", "api.einvoice1.gst.gov.in", "api.einvoice2.gst.gov.in", "einvoice1.gst.gov.in", "einvoice2.gst.gov.in"];

/** SSRF guard: only government hosts (https) or hosts the operator allowed explicitly. */
export function assertAllowedUrl(base: string) {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new AppError("INVALID", "The e-invoice API address is not a valid URL.");
  }
  const extra = (env.NIC_EXTRA_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const host = u.host.toLowerCase();
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (extra.includes(host) && (u.protocol === "https:" || (u.protocol === "http:" && local))) return;
  if (u.protocol === "https:" && KNOWN_HOSTS.includes(u.hostname.toLowerCase())) return;
  throw new AppError("INVALID", `The e-invoice API host ${u.host} is not allowed. Use the NIC address, or ask your administrator to add it to NIC_EXTRA_HOSTS.`);
}

export const aesEncrypt = (key: Buffer, data: Buffer) => {
  const c = createCipheriv("aes-256-ecb", key, null);
  return Buffer.concat([c.update(data), c.final()]);
};
export const aesDecrypt = (key: Buffer, data: Buffer) => {
  const d = createDecipheriv("aes-256-ecb", key, null);
  return Buffer.concat([d.update(data), d.final()]);
};

type NicResponse = { Status?: number | string; status?: number | string; Data?: unknown; ErrorDetails?: unknown; InfoDtls?: unknown };

function errorsOf(r: NicResponse): string[] {
  let details = r.ErrorDetails;
  if (typeof details === "string") {
    try {
      details = JSON.parse(Buffer.from(details, "base64").toString("utf8"));
    } catch {
      details = [{ ErrorMessage: details }];
    }
  }
  const list = Array.isArray(details) ? (details as { ErrorCode?: string; ErrorMessage?: string }[]) : [];
  return list.length ? list.map((d) => [d.ErrorCode, d.ErrorMessage].filter(Boolean).join(": ")) : ["The e-invoice system rejected the request."];
}

const ok = (r: NicResponse) => String(r.Status ?? r.status) === "1";

export class NicError extends Error {
  constructor(public errors: string[]) {
    super(errors.join("; "));
  }
}

export class NicClient {
  constructor(
    private cfg: NicConfig,
    private token: NicToken | null,
    private onToken: (t: NicToken) => Promise<void>,
  ) {
    assertAllowedUrl(cfg.baseUrl);
  }

  private headers(extra: Record<string, string> = {}) {
    return { "Content-Type": "application/json", client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, Gstin: this.cfg.gstin, ...extra };
  }

  private async call(path: string, body: unknown, headers: Record<string, string>): Promise<NicResponse> {
    let res: Response;
    try {
      res = await fetch(new URL(path, this.cfg.baseUrl), { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000), redirect: "error" });
    } catch {
      throw new NicError(["Could not reach the e-invoice system. Check the internet connection and try again."]);
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as NicResponse;
    } catch {
      throw new NicError([`Unexpected response from the e-invoice system (HTTP ${res.status}).`]);
    }
  }

  async authenticate(force = false): Promise<NicToken> {
    if (!force && this.token && this.token.expiresAt - Date.now() > 10 * 60e3) return this.token;
    const appKey = randomBytes(32);
    const inner = JSON.stringify({ UserName: this.cfg.username, Password: this.cfg.password, AppKey: appKey.toString("base64"), ForceRefreshAccessToken: force });
    let data: string;
    try {
      data = publicEncrypt({ key: this.cfg.publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(Buffer.from(inner).toString("base64"))).toString("base64");
    } catch {
      throw new NicError(["The NIC public key is not valid. Paste the full key file contents (-----BEGIN PUBLIC KEY----- …)."]);
    }
    const r = await this.call(this.cfg.paths.auth, { Data: data }, this.headers());
    if (!ok(r)) throw new NicError(errorsOf(r));
    const d = r.Data as { AuthToken: string; Sek: string; TokenExpiry?: string };
    const sek = aesDecrypt(appKey, Buffer.from(d.Sek, "base64"));
    // TokenExpiry is IST "yyyy-MM-dd HH:mm:ss"; fall back to the documented 6 hours.
    const exp = d.TokenExpiry ? Date.parse(`${d.TokenExpiry.replace(" ", "T")}+05:30`) : NaN;
    this.token = { authToken: d.AuthToken, sek: sek.toString("base64"), expiresAt: Number.isFinite(exp) ? exp : Date.now() + 6 * 3600e3 };
    await this.onToken(this.token);
    return this.token;
  }

  private async secure<T>(path: string, payload: unknown, retried = false): Promise<T> {
    const t = await this.authenticate();
    const key = Buffer.from(t.sek, "base64");
    const r = await this.call(path, { Data: aesEncrypt(key, Buffer.from(JSON.stringify(payload))).toString("base64") }, this.headers({ user_name: this.cfg.username, AuthToken: t.authToken }));
    if (!ok(r)) {
      const errs = errorsOf(r);
      // Expired/invalid token: re-authenticate once.
      if (!retried && errs.some((e) => /^1005\b|token/i.test(e))) {
        await this.authenticate(true);
        return this.secure(path, payload, true);
      }
      throw new NicError(errs);
    }
    const raw = typeof r.Data === "string" ? aesDecrypt(key, Buffer.from(r.Data, "base64")).toString("utf8") : JSON.stringify(r.Data);
    return JSON.parse(raw) as T;
  }

  generateIrn(einvoice: unknown) {
    return this.secure<{ AckNo: number | string; AckDt: string; Irn: string; SignedInvoice: string; SignedQRCode: string; Status: string; EwbNo?: number | string | null; EwbDt?: string | null; EwbValidTill?: string | null }>(this.cfg.paths.invoice, einvoice);
  }

  cancelIrn(irn: string, reason: "1" | "2" | "3" | "4", remark: string) {
    return this.secure<{ Irn: string; CancelDate: string }>(this.cfg.paths.cancel, { Irn: irn, CnlRsn: reason, CnlRem: remark.slice(0, 100) });
  }

  generateEwb(payload: unknown) {
    return this.secure<{ EwbNo: number | string; EwbDt: string; EwbValidTill: string | null }>(this.cfg.paths.ewb, payload);
  }
}
