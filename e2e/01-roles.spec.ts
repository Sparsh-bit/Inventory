import type { Browser, Page } from "@playwright/test";
import { expect, lastMailLink, scan, signIn, signUp, test } from "./fixtures";
import { CASHIER, MANAGER, OWNER, STOCKKEEPER } from "./test-users";

test.describe.configure({ mode: "serial" });

const SAMPLE_BARCODE = "8901234567890"; // "Mineral Water 1L" from the onboarding sample data

async function expectPage(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} status`).toBeLessThan(400);
  await expect(page, `${path} should be allowed`).not.toHaveURL(/\/(forbidden|sign-in)/);
  await expect(page.locator("h1").first()).toBeVisible();
}

async function expectForbidden(page: Page, path: string) {
  await page.goto(path);
  await expect(page, `${path} should be refused`).toHaveURL(/\/forbidden/);
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
}

async function sellOne(page: Page) {
  await page.goto("/pos");
  await expect(page.getByRole("textbox", { name: "Search product or scan barcode" })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("stockpilot.printer", JSON.stringify({ autoPrint: false })));
  await scan(page, SAMPLE_BARCODE);
  await expect(page.getByRole("list", { name: "Cart items" }).getByText("Mineral Water 1L")).toBeVisible();
  await page.keyboard.press("F4");
  await expect(page.getByRole("dialog", { name: "Take payment" })).toBeVisible();
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await expect(page.getByRole("dialog", { name: "Sale complete" })).toBeVisible();
  const number = (await page.getByRole("dialog", { name: "Sale complete" }).getByText(/^Bill /).textContent())!.replace("Bill ", "");
  await page.getByRole("button", { name: /New sale/ }).click();
  return number;
}

async function joinViaInvite(browser: Browser, user: { name: string; email: string; password: string }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  const invite = await lastMailLink(user.email, /Join/);
  await page.goto(invite);
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
  await signUp(page, user, invite);
  await page.waitForURL(/accept-invite/);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.waitForURL(/dashboard/);
  return { page, context, errors };
}

test("owner: sign up, set up business, sell, return, invite team", async ({ page }) => {
  await signUp(page, OWNER);
  await page.waitForURL(/onboarding/);
  await page.getByLabel("Business name").fill("E2E General Store");
  await page.getByRole("button", { name: "Create business" }).click();
  await page.waitForURL(/dashboard/);
  await expect(page.getByRole("heading", { name: /Asha/ })).toBeVisible();

  for (const path of [
    "/dashboard", "/pos", "/sales", "/customers", "/products", "/products/new", "/products/categories", "/products/labels", "/inventory",
    "/inventory/adjust", "/inventory/transfer", "/inventory/count", "/inventory/history", "/purchases", "/purchases/new", "/suppliers", "/reports",
    "/reports?tab=gst", "/reports?tab=stock", "/reports?tab=expiry", "/reports?tab=dues", "/import", "/settings", "/settings/business", "/settings/taxes",
    "/settings/locations", "/settings/receipt", "/settings/devices", "/settings/members", "/settings/audit", "/account",
  ]) await expectPage(page, path);

  const number = await sellOne(page);
  await page.goto("/sales");
  await page.getByRole("link", { name: number }).click();
  await expect(page.getByRole("heading", { name: number })).toBeVisible();
  await page.goto(`${page.url().replace(/.*\/sales\//, "/print/invoice/")}`);
  await expect(page.getByText("Amount in words")).toBeVisible();
  await page.goBack();
  await page.getByRole("button", { name: "Return" }).click();
  await page.getByLabel(/Return quantity/).first().fill("1");
  await page.getByRole("button", { name: "Confirm return" }).click();
  await expect(page.getByText("Return recorded")).toBeVisible();

  await page.goto("/settings/members");
  for (const [user, role] of [[MANAGER, "Manager"], [CASHIER, "Cashier"], [STOCKKEEPER, "Stock keeper"]] as const) {
    await page.getByLabel("Email address").fill(user.email);
    await page.getByRole("combobox", { name: "Role" }).click();
    await page.getByRole("option", { name: role }).click();
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByRole("cell", { name: `${user.email} Invited` })).toBeVisible();
  }
});

test("cashier: can bill and collect, cannot see costs, reports or settings", async ({ browser }) => {
  const { page, context, errors } = await joinViaInvite(browser, CASHIER);
  await expect(page.getByRole("link", { name: "Reports" })).toHaveCount(0);
  await expect(page.getByText("Gross profit today")).toHaveCount(0);
  for (const p of ["/dashboard", "/pos", "/sales", "/customers", "/products", "/inventory", "/settings", "/settings/devices", "/account"]) await expectPage(page, p);
  for (const p of ["/reports", "/products/new", "/purchases", "/suppliers", "/inventory/adjust", "/import", "/settings/business", "/settings/members", "/settings/audit"]) await expectForbidden(page, p);
  await sellOne(page);
  expect(errors).toEqual([]);
  await context.close();
});

test("stock keeper: manages stock and purchases, cannot sell", async ({ browser }) => {
  const { page, context, errors } = await joinViaInvite(browser, STOCKKEEPER);
  await expect(page.getByRole("link", { name: "Point of Sale" })).toHaveCount(0);
  for (const p of ["/products", "/products/new", "/inventory", "/inventory/adjust", "/inventory/transfer", "/inventory/count", "/inventory/history", "/purchases", "/purchases/new", "/suppliers", "/import"]) await expectPage(page, p);
  for (const p of ["/pos", "/sales", "/reports", "/settings/business", "/settings/members", "/settings/audit"]) await expectForbidden(page, p);

  await page.goto("/inventory/adjust");
  await expect(page.getByText("Search or scan the products to include.")).toBeVisible();
  await scan(page, SAMPLE_BARCODE);
  await page.getByLabel(/Quantity for Mineral Water/).fill("2");
  await page.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page.getByText("Stock adjusted")).toBeVisible();
  await page.goto("/inventory/history");
  await expect(page.getByRole("cell", { name: /Adjustment/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test("manager: reports and operations, but not team or business settings", async ({ browser }) => {
  const { page, context, errors } = await joinViaInvite(browser, MANAGER);
  for (const p of ["/dashboard", "/pos", "/sales", "/reports", "/reports?tab=gst", "/purchases", "/inventory/adjust", "/settings/audit", "/import", "/settings/devices"]) await expectPage(page, p);
  for (const p of ["/settings/members", "/settings/business", "/settings/taxes", "/settings/receipt", "/settings/locations"]) await expectForbidden(page, p);
  await expect(page.getByText("Gross profit today")).toHaveCount(0); // we're on a forbidden page; check dashboard next
  await page.goto("/dashboard");
  await expect(page.getByText("Gross profit today")).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test("security: signed-out users are sent to sign in; wrong password is rejected", async ({ page }) => {
  for (const p of ["/dashboard", "/pos", "/reports", "/settings"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/sign-in/);
  }
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await signIn(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL(/dashboard/);
});
