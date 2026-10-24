import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, signIn, test } from "./fixtures";
import { OWNER } from "./test-users";
import { MOCK_CREDENTIALS } from "../scripts/mock-nic.mjs";

test("GST e-invoice: configure NIC API, bill a registered buyer, generate IRN + e-way bill", async ({ page }) => {
  await signIn(page, OWNER.email, OWNER.password);
  await page.evaluate(() => localStorage.setItem("stockpilot.printer", JSON.stringify({ autoPrint: false })));

  // Business GST profile.
  await page.goto("/settings/business");
  await page.getByLabel("Legal / registered name").fill("E2E General Store Pvt Ltd");
  await page.getByLabel("GSTIN").fill("27AAPFU0939F1ZV");
  await page.getByRole("combobox", { name: "GST state" }).click();
  await page.getByRole("option", { name: "Maharashtra" }).click();
  await page.getByLabel("Address line 1").fill("12 MG Road");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("PIN / ZIP").fill("411001");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  // NIC API settings (mock server from global setup).
  await page.goto("/settings/einvoice");
  await page.getByRole("switch", { name: /Generate e-invoices/ }).click();
  await page.getByLabel("API address").fill("http://127.0.0.1:4555");
  await page.getByLabel("Client ID").fill(MOCK_CREDENTIALS.clientId);
  await page.getByLabel("Client secret").fill(MOCK_CREDENTIALS.clientSecret);
  await page.getByLabel("API username").fill(MOCK_CREDENTIALS.username);
  await page.getByLabel("API password").fill(MOCK_CREDENTIALS.password);
  await page.getByLabel("NIC public key").fill(await readFile(path.join(process.env.E2E_DATA_DIR ?? ".data/e2e", "mock-nic.pem"), "utf8"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("E-invoice settings saved")).toBeVisible();
  await page.getByRole("button", { name: /Test saved connection/ }).click();
  await expect(page.getByText("Connected to the e-invoice system")).toBeVisible();

  // Registered (B2B) customer in another state.
  await page.goto("/customers?new=1");
  const dlg = page.getByRole("dialog", { name: "New customer" });
  await dlg.getByLabel("Name").fill("Bangalore Retail Pvt Ltd");
  await dlg.getByLabel("GSTIN").fill("29AAGCB7383J1Z4");
  await dlg.getByRole("combobox", { name: /State \(place of supply\)/ }).click();
  await page.getByRole("option", { name: "Karnataka" }).click();
  await dlg.getByLabel("Address").fill("5 Brigade Road");
  await dlg.getByLabel("City").fill("Bengaluru");
  await dlg.getByLabel("PIN / ZIP").fill("560001");
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("New customer added")).toBeVisible();

  // Tax invoice from the POS (product with HSN 6109).
  await page.goto("/pos");
  await page.getByRole("button", { name: /Walk-in customer/ }).click();
  await page.getByPlaceholder("Name, phone or GSTIN…").fill("Bangalore");
  await page.getByRole("option", { name: /^Bangalore Retail/ }).click();
  await page.getByRole("button", { name: /Cotton T-Shirt · M/ }).click();
  await page.keyboard.press("F4");
  const pay = page.getByRole("dialog", { name: "Take payment" });
  await pay.getByRole("radio", { name: /Tax invoice/ }).click();
  await pay.getByRole("button", { name: /Complete sale/ }).click();
  const done = page.getByRole("dialog", { name: "Sale complete" });
  const number = (await done.getByText(/^Bill /).textContent())!.replace("Bill ", "");
  expect(number).toMatch(/^INV\//);
  await page.getByRole("button", { name: /New sale/ }).click();

  // Generate IRN and e-way bill from the invoice page.
  await page.goto("/sales");
  await page.getByRole("link", { name: number }).click();
  await page.getByRole("button", { name: "Generate IRN" }).click();
  await expect(page.getByText("IRN generated").first()).toBeVisible();
  await page.getByRole("button", { name: "E-way bill", exact: true }).click();
  await page.getByLabel("Vehicle no.").fill("MH12AB1234");
  await page.getByLabel("Distance (km)").fill("840");
  await page.getByRole("button", { name: "Generate e-way bill" }).click();
  await expect(page.getByText("E-way bill generated")).toBeVisible();
  await expect(page.getByText(/^3210\d+$/)).toBeVisible();

  // A4 invoice carries the IRN and signed QR.
  const saleUrl = page.url();
  await page.goto(saleUrl.replace("/sales/", "/print/invoice/"));
  await expect(page.getByText("IRN:")).toBeVisible();
  await expect(page.getByAltText("E-invoice signed QR code")).toBeVisible();
});
