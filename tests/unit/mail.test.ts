import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
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
