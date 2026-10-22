import { expect, scan, signIn, test } from "./fixtures";
import { OWNER } from "./test-users";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await signIn(page, OWNER.email, OWNER.password);
  await page.evaluate(() => localStorage.setItem("stockpilot.printer", JSON.stringify({ autoPrint: false })));
});

test("serial numbers: receive, sell by IMEI scan, look up warranty, return", async ({ page }) => {
  // Product with serial tracking + 12 month warranty.
  await page.goto("/products/new");
  await page.getByLabel("Product name").fill("E2E Phone X");
  await page.getByLabel("Selling price", { exact: true }).fill("15000");
  await page.getByRole("switch", { name: /Track serial numbers/ }).click();
  await page.getByLabel(/Warranty/).fill("12");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Product created")).toBeVisible();

  // Purchase 2 units and receive them with their IMEIs.
  await page.goto("/purchases/new");
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: "Acme Distributors" }).click();
  const picker = page.getByPlaceholder("Search or scan products to order…");
  await picker.click();
  await picker.pressSequentially("E2E Phone");
  await page.getByRole("option", { name: /E2E Phone X/ }).click();
  await page.getByLabel(/Quantity of E2E Phone X/).fill("2");
  await page.getByLabel(/Unit cost of E2E Phone X/).fill("12000");
  await page.getByRole("button", { name: "Create purchase order" }).click();
  await page.getByRole("button", { name: "Receive goods" }).click();
  const serialBox = page.getByLabel("Serial numbers for E2E Phone X");
  await serialBox.fill("IMEI350000000000011");
  await serialBox.press("Enter");
  await serialBox.fill("IMEI350000000000029");
  await serialBox.press("Enter");
  await expect(page.getByText("2 of 2 entered")).toBeVisible();
  await page.getByRole("button", { name: "Receive stock" }).click();
  await expect(page.getByText("Stock received")).toBeVisible();

  // Scanning an IMEI at the POS adds that exact unit.
  await page.goto("/pos");
  await expect(page.getByRole("textbox", { name: "Search product or scan barcode" })).toBeVisible();
  await scan(page, "IMEI350000000000011");
  const cart = page.getByRole("list", { name: "Cart items" });
  await expect(cart.getByText("IMEI350000000000011")).toBeVisible();
  await page.keyboard.press("F4");
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await expect(page.getByRole("dialog", { name: "Sale complete" })).toBeVisible();
  await page.getByRole("button", { name: /New sale/ }).click();

  // The same IMEI can't be sold again.
  await scan(page, "IMEI350000000000011");
  await expect(page.getByText("No product with code IMEI350000000000011")).toBeVisible();

  // Lookup shows the sale and an active warranty.
  await page.goto("/inventory/serials?q=IMEI350000000000011");
  await expect(page.getByText("Sold", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Valid until/)).toBeVisible();

  // Return it from the bill: the serial goes back into stock.
  await page.getByRole("link", { name: /^S\// }).first().click();
  await page.getByRole("button", { name: "Return" }).click();
  await page.getByRole("button", { name: "IMEI350000000000011" }).click();
  await page.getByRole("button", { name: "Confirm return" }).click();
  await expect(page.getByText("Return recorded")).toBeVisible();
  await page.goto("/inventory/serials?q=IMEI350000000000011");
  await expect(page.getByText("In stock", { exact: true }).first()).toBeVisible();
});
