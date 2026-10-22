// Test double for the NIC e-invoice IRP API using the real encryption scheme.
// Used by integration and end-to-end tests only; never by the app itself.
import { constants, createCipheriv, createDecipheriv, createHash, generateKeyPairSync, privateDecrypt, randomBytes } from "node:crypto";
import http from "node:http";

export const MOCK_CREDENTIALS = { clientId: "mock-client", clientSecret: "mock-secret", username: "mockuser", password: "mock-password-1" };

const aes = (mode, key, data) => {
  const c = mode === "enc" ? createCipheriv("aes-256-ecb", key, null) : createDecipheriv("aes-256-ecb", key, null);
  return Buffer.concat([c.update(data), c.final()]);
};

export async function startMockNic(port = 0) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const tokens = new Map(); // authToken -> sek
  const irns = new Map(); // irn -> { cancelled, ewb }
  let ack = 112010000000000;

  const send = (res, body) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const fail = (res, code, message, asBase64 = false) => {
    const details = [{ ErrorCode: code, ErrorMessage: message }];
    send(res, { Status: 0, Data: null, ErrorDetails: asBase64 ? Buffer.from(JSON.stringify(details)).toString("base64") : details });
  };

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const h = req.headers;
        if (h.client_id !== MOCK_CREDENTIALS.clientId || h.client_secret !== MOCK_CREDENTIALS.clientSecret) return fail(res, "1001", "Invalid Client-ID/Client-Secret");
        const { Data } = JSON.parse(body || "{}");
        if (req.url === "/eivital/v1.04/auth") {
          const inner = JSON.parse(Buffer.from(privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(Data, "base64")).toString("utf8"), "base64").toString("utf8"));
          if (inner.UserName !== MOCK_CREDENTIALS.username || inner.Password !== MOCK_CREDENTIALS.password) return fail(res, "1006", "Invalid username or password");
          const appKey = Buffer.from(inner.AppKey, "base64");
          if (appKey.length !== 32) return fail(res, "1005", "Invalid AppKey");
          const sek = randomBytes(32);
          const authToken = randomBytes(12).toString("hex");
          tokens.set(authToken, sek);
          return send(res, { Status: 1, Data: { ClientId: h.client_id, UserName: inner.UserName, AuthToken: authToken, Sek: aes("enc", appKey, sek).toString("base64"), TokenExpiry: "2099-01-01 00:00:00" } });
        }
        const sek = tokens.get(h.authtoken);
        if (!sek) return fail(res, "1005", "Invalid Token");
        const payload = JSON.parse(aes("dec", sek, Buffer.from(Data, "base64")).toString("utf8"));
        const reply = (obj) => send(res, { Status: 1, Data: aes("enc", sek, Buffer.from(JSON.stringify(obj))).toString("base64") });

        if (req.url === "/eicore/v1.03/Invoice") {
          if (payload.Version !== "1.1" || !payload.DocDtls?.No || !payload.ItemList?.length) return fail(res, "2172", "Invalid invoice JSON", true);
          const irn = createHash("sha256").update(`${payload.SellerDtls.Gstin}${payload.DocDtls.Typ}${payload.DocDtls.No}`).digest("hex");
          if (irns.has(irn) && !irns.get(irn).cancelled) return fail(res, "2150", "Duplicate IRN", true);
          irns.set(irn, { cancelled: false });
          const qr = `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify({ data: JSON.stringify({ SellerGstin: payload.SellerDtls.Gstin, DocNo: payload.DocDtls.No, Irn: irn }) })).toString("base64url")}.mock-signature`;
          return reply({ AckNo: ++ack, AckDt: new Date(Date.now() + 5.5 * 3600e3).toISOString().replace("T", " ").slice(0, 19), Irn: irn, SignedInvoice: "eyJhbGciOiJSUzI1NiJ9.e30.mock", SignedQRCode: qr, Status: "ACT", EwbNo: null });
        }
        if (req.url === "/eicore/v1.03/Invoice/Cancel") {
          const rec = irns.get(payload.Irn);
          if (!rec || rec.cancelled) return fail(res, "9999", "Invoice is not active");
          rec.cancelled = true;
          return reply({ Irn: payload.Irn, CancelDate: "2026-10-22 12:00:00" });
        }
        if (req.url === "/eiewb/v1.03/ewaybill") {
          if (!irns.has(payload.Irn)) return fail(res, "4002", "IRN not found");
          return reply({ EwbNo: 321000000000 + irns.size, EwbDt: "2026-10-22 12:00:00", EwbValidTill: "2026-10-27 23:59:00" });
        }
        res.writeHead(404).end();
      } catch (e) {
        fail(res, "5000", `Mock error: ${e.message}`);
      }
    });
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, publicKey, close: () => new Promise((r) => server.close(r)) };
}
