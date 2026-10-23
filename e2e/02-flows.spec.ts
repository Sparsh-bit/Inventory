import { writeFile } from "node:fs/promises";
import { expect, scan, signIn, test } from "./fixtures";
import { OWNER } from "./test-users";

// Runs after 01-roles.spec.ts, which creates the owner account and sample data.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await signIn(page, OWNER.email, OWNER.password);
  await page.evaluate(() => localStorage.setItem("stockpilot.printer", JSON.stringify({ autoPrint: false })));
});

test("add a product by scanning its barcode, then sell it: qty starts at 1 and can be edited", async ({ page }) => {
  await page.goto("/products/new");
  await page.getByLabel("Product name").fill("E2E Biscuits 200g");
  // Scanner fires while the cursor is still in the name field: the code goes to the barcode field.
  await scan(page, "8909999000017");
  await expect(page.getByLabel("Product name")).toHaveValue("E2E Biscuits 200g");
  await expect(page.getByLabel("Barcode / product no.")).toHaveValue("8909999000017");
  await page.getByLabel("Selling price", { exact: true }).fill("30");
  await page.getByLabel("Cost price").fill("22");
  await page.getByLabel(/Opening stock/).fill("12");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Product created")).toBeVisible();
  await expect(page.getByText("12 pcs")).toBeVisible();

  await page.goto("/pos");
  await scan(page, "8909999000017");
  const cart = page.getByRole("list", { name: "Cart items" });
  await expect(cart.getByText("E2E Biscuits 200g")).toBeVisible();
  const qty = page.getByLabel("Quantity of E2E Biscuits 200g");
  await expect(qty).toHaveValue("1");
  await expect(page.getByRole("button", { name: /Pay ₹30\.00/ })).toBeVisible();
  await qty.fill("3");
  await qty.press("Enter");
  await expect(page.getByRole("button", { name: /Pay ₹90\.00/ })).toBeVisible();
  await page.keyboard.press("F4");
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await expect(page.getByRole("dialog", { name: "Sale complete" })).toBeVisible();
});

test("batch-tracked product: opening stock with batch number and expiry", async ({ page }) => {
  await page.goto("/products/new");
  await page.getByLabel("Product name").fill("E2E Chips 50g");
  await page.getByLabel("Selling price", { exact: true }).fill("20");
  await page.getByLabel(/Opening stock/).fill("20");
  await page.getByRole("switch", { name: /Track batches/ }).click();
  await expect(page.getByLabel(/Opening stock/)).toHaveValue("20");
  await page.getByLabel("Batch no.").fill("B2610");
  await page.getByLabel(/Expiry date/).fill("2027-03-31");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Product created")).toBeVisible();
  await expect(page.getByText("20 pcs")).toBeVisible();
});

test("unknown barcode offers to create a product", async ({ page }) => {
  await page.goto("/pos");
  await expect(page.getByRole("textbox", { name: "Search product or scan barcode" })).toBeVisible();
  await scan(page, "0000000999999");
  await expect(page.getByText("No product with code 0000000999999")).toBeVisible();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/products\/new\?barcode=0000000999999/);
  await expect(page.getByRole("textbox", { name: "Barcode / product no." })).toHaveValue("0000000999999");
});

test("credit sale to a customer, then collect the payment", async ({ page }) => {
  await page.goto("/pos");
  await page.getByRole("button", { name: /Walk-in customer/ }).click();
  await page.getByPlaceholder("Name, phone or GSTIN…").fill("Walk-in Regular");
  await page.getByRole("option", { name: /^Walk-in Regular/ }).click();
  await page.getByRole("button", { name: /Cold Coffee 250ml/ }).click();
  await page.keyboard.press("F4");
  const dialog = page.getByRole("dialog", { name: "Take payment" });
  await dialog.getByRole("button", { name: "On account" }).click();
  await dialog.getByRole("button", { name: /Complete sale/ }).click();
  await expect(page.getByRole("dialog", { name: "Sale complete" })).toBeVisible();
  await page.getByRole("button", { name: /New sale/ }).click();

  await page.goto("/customers?due=1");
  await page.getByRole("link", { name: "Walk-in Regular" }).click();
  await expect(page.getByText("Outstanding")).toBeVisible();
  await page.getByRole("button", { name: "Receive payment" }).click();
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
  await expect(page.locator("p", { hasText: "₹0.00" }).first()).toBeVisible();
});

test("purchase order: create, receive with scanner, stock goes up", async ({ page }) => {
  await page.goto("/purchases/new");
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: "Acme Distributors" }).click();
  await page.getByPlaceholder("Search or scan products to order…").click();
  await page.getByPlaceholder("Search or scan products to order…").pressSequentially("Notebook");
  await page.getByRole("option", { name: /Notebook A5/ }).click();
  await page.getByLabel(/Quantity of Notebook/).fill("10");
  await page.getByLabel(/Unit cost of Notebook/).fill("40");
  await page.getByRole("button", { name: "Create purchase order" }).click();
  await expect(page.getByText("Purchase order created")).toBeVisible();
  await page.getByRole("button", { name: "Receive goods" }).click();
  await page.getByRole("button", { name: "Receive stock" }).click();
  await expect(page.getByText("Stock received")).toBeVisible();
  await expect(page.getByText("Received", { exact: true }).first()).toBeVisible();
  await page.goto("/inventory?q=Notebook");
  await expect(page.getByText("70 pcs")).toBeVisible(); // 60 opening + 10 received
});

test("CSV import creates products with row-level validation", async ({ page }, info) => {
  const file = info.outputPath("products.csv");
  await writeFile(file, "Name,Selling Price,Cost,GST %,Unit,Qty\nImported Soap,45,30,18,pcs,24\n,10,5,5,pcs,1\n");
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("1 of 2 rows are ready.")).toBeVisible();
  await expect(page.getByText("Row 3: name is required")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 rows" }).click();
  await expect(page.getByText("1 created · 0 updated")).toBeVisible();
  await page.goto("/products?q=Imported");
  await expect(page.getByRole("link", { name: /Imported Soap/ })).toBeVisible();
});

test("barcode labels page renders printable barcodes", async ({ page }) => {
  await page.goto("/products/labels");
  await page.getByPlaceholder("Search products to add…").click();
  await page.getByPlaceholder("Search products to add…").pressSequentially("Ball Pen");
  await page.getByRole("option", { name: /Ball Pen Blue/ }).click();
  await expect(page.getByRole("button", { name: /Print \d+ labels?/ })).toBeEnabled();
  await expect(page.locator("#label-sheet svg").first()).toBeAttached();
});

test("device settings: scanner test and printer options", async ({ page }) => {
  await page.goto("/settings/devices");
  await scan(page, "TEST-1234");
  await expect(page.getByText("Scanner works.")).toBeVisible();
  await page.getByRole("button", { name: /Network \(LAN\)/ }).click();
  await expect(page.getByLabel("Bridge address")).toHaveValue("http://127.0.0.1:9123");
  await page.getByRole("button", { name: /Any printer/ }).click();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("POS works on a phone with a bottom cart bar", async ({ page }) => {
    await page.goto("/pos");
    await expect(page.getByRole("button", { name: "Scan with camera" })).toBeVisible();
    await page.getByRole("button", { name: /Ball Pen Blue/ }).click();
    await page.getByRole("button", { name: /1 item/ }).click();
    await expect(page.getByRole("dialog", { name: "Current bill" })).toBeVisible();
    await page.getByRole("button", { name: /Pay ₹10\.00/ }).click();
    await page.getByRole("button", { name: /Complete sale/ }).click();
    await expect(page.getByRole("dialog", { name: "Sale complete" })).toBeVisible();
  });
});
