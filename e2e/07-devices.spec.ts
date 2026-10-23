import { expect, signIn, test } from "./fixtures";
import { OWNER } from "./test-users";

/**
 * Runs on every browser engine and device size in playwright.config.ts (Firefox, Safari/WebKit,
 * Android phone, iPhone, iPad). Data comes from the earlier specs, which run on desktop Chrome first.
 */
const PAGES = [
  "/dashboard", "/pos", "/sales", "/products", "/products/new", "/products/categories", "/products/labels",
  "/inventory", "/inventory/adjust", "/inventory/transfer", "/inventory/count", "/inventory/history", "/inventory/serials",
  "/purchases", "/purchases/new", "/customers", "/khata", "/suppliers", "/reports", "/import", "/account",
  "/settings", "/settings/business", "/settings/taxes", "/settings/locations", "/settings/receipt", "/settings/devices",
  "/settings/members", "/settings/audit", "/settings/einvoice",
];

// One sign-in per device: the per-IP sign-in limit (30 / 15 min) is shared by the whole run.
test("pages, a sale and a receipt", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, OWNER.email, OWNER.password);

  await test.step("every page renders without sideways scrolling", async () => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first(), path).toBeAttached();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
      // Let prefetches finish: WebKit logs requests cut off by an instant navigation as errors.
      await page.waitForLoadState("networkidle");
    }
  });

  await test.step("a cash sale from tapping a product tile", async () => {
    await page.goto("/pos");
    await page.getByRole("button", { name: /Ball Pen Blue/ }).click();
    const cartBar = page.getByRole("button", { name: /1 item/ });
    if (await cartBar.isVisible()) await cartBar.click(); // phones show the bill behind a bottom bar
    await page.getByRole("button", { name: /Pay ₹10\.00/ }).click();
    await page.getByRole("button", { name: /Complete sale/ }).click();
    await expect(page.getByRole("dialog", { name: "Sale complete" })).toBeVisible();
  });

  await test.step("the sale page opens and fits the screen", async () => {
    await page.goto("/sales");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: /INV\// }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("INV/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
