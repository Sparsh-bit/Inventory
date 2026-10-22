import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  for (const k of ["RESEND_API_KEY", "SMTP_URL", "ENCRYPTION_KEY", "MAIL_SINK", "MAIL_FROM", "UPLOAD_DIR", "APP_URL"]) delete process.env[k];
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function loadMail(extra: Record<string, string>) {
  Object.assign(process.env, { MONGODB_URI: "mongodb://localhost/x", BETTER_AUTH_SECRET: "x".repeat(40), APP_URL: "http://localhost:3000", MAIL_FROM: "Shop <no-reply@shop.test>", ...extra });
  delete process.env.MAIL_SINK;
  return import("@/server/mail");
}

test("sends through the Resend API when RESEND_API_KEY is set", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const { sendMail } = await loadMail({ RESEND_API_KEY: "re_test_key" });
  await sendMail("a@b.test", "Verify <you>", "Hello", { url: "https://app.test/v?t=1", label: "Verify" });

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(init.headers.Authorization).toBe("Bearer re_test_key");
  const sent = JSON.parse(init.body);
  expect(sent).toMatchObject({ from: "Shop <no-reply@shop.test>", to: ["a@b.test"], subject: "Verify <you>" });
  expect(sent.text).toContain("https://app.test/v?t=1");
  expect(sent.html).toContain("Verify &lt;you&gt;");
});

test("a Resend error is raised, not swallowed", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"domain not verified"}', { status: 403 })));
  const { sendMail } = await loadMail({ RESEND_API_KEY: "re_test_key" });
  await expect(sendMail("a@b.test", "Hi", "Hello")).rejects.toThrow(/403.*domain not verified/);
});

test("blank variables (as hosting dashboards save them) count as unset", async () => {
  Object.assign(process.env, { RESEND_API_KEY: "", SMTP_URL: "", ENCRYPTION_KEY: "", MAIL_SINK: " ", MAIL_FROM: "", UPLOAD_DIR: "", APP_URL: "" });
  vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "shop.up.railway.app");
  const { env } = await import("@/env");
  expect(env.RESEND_API_KEY).toBeUndefined();
  expect(env.UPLOAD_DIR).toBe("./uploads");
  expect(env.MAIL_FROM).toContain("StockPilot");
  expect(env.APP_URL).toBe("https://shop.up.railway.app");
  vi.unstubAllEnvs();
});

test("in production a Resend key needs a real sender address", async () => {
  vi.stubEnv("NODE_ENV", "production");
  Object.assign(process.env, { MONGODB_URI: "mongodb://localhost/x", BETTER_AUTH_SECRET: "x".repeat(40), APP_URL: "http://localhost:3000", RESEND_API_KEY: "re_live", MAIL_FROM: "" });
  await expect(import("@/env")).rejects.toThrow(/MAIL_FROM/);
  vi.unstubAllEnvs();
});
