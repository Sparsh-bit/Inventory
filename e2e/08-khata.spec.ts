import { expect, signIn, test } from "./fixtures";
import { OWNER } from "./test-users";

// Runs after 02-flows (sample data + one received purchase from Acme Distributors).
test.describe.configure({ mode: "serial" });

test("purchase with a new product, part-payment against that invoice, udhaar and WhatsApp", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signIn(page, OWNER.email, OWNER.password);
  await page.evaluate(() => localStorage.setItem("stockpilot.printer", JSON.stringify({ autoPrint: false })));

  await test.step("purchase order: add a product that isn't in the catalogue", async () => {
    await page.goto("/purchases/new");
    await page.getByRole("combobox", { name: "Supplier" }).click();
    await page.getByRole("option", { name: "Acme Distributors" }).click();
    await page.getByLabel("Supplier bill no.").fill("ACME-7501");
    await page.getByRole("button", { name: "New product" }).click();
    const dialog = page.getByRole("dialog", { name: "New product" });
    await dialog.getByLabel("Product name").fill("E2E Namkeen 400g");
    await dialog.getByLabel("Barcode / product no.").fill("NMK-400");
    await dialog.getByLabel("Purchase cost").fill("30");
    await dialog.getByLabel("Selling price").fill("50");
    await dialog.getByRole("button", { name: "Add product" }).click();
    await expect(page.getByText("Product added")).toBeVisible();
    await page.getByLabel("Quantity of E2E Namkeen 400g").fill("10");
    await page.getByRole("button", { name: "Create purchase order" }).click();
    await expect(page.getByText("Purchase order created")).toBeVisible();
    await page.getByRole("button", { name: "Receive goods" }).click();
    await page.getByRole("button", { name: "Receive stock" }).click();
    await expect(page.getByText("Stock received")).toBeVisible();
  });

  await test.step("pay ₹200 of the ₹300 invoice, choosing that invoice", async () => {
    await page.goto("/suppliers");
    await page.getByRole("link", { name: "Acme Distributors" }).click();
    await expect(page.getByRole("list", { name: /Items on PO\// }).filter({ hasText: "E2E Namkeen 400g" })).toContainText("10 of 10 received");
    await page.getByRole("button", { name: "Pay supplier" }).click();
    const dialog = page.getByRole("dialog", { name: "Pay supplier" });
    await dialog.getByLabel("Amount", { exact: true }).fill("200");
    await dialog.getByRole("button", { name: "Choose purchases" }).click();
    const bills = dialog.getByRole("list", { name: "Unpaid purchases" });
    const row = bills.getByRole("listitem").filter({ hasText: "Bill ACME-7501" });
    await row.getByRole("checkbox").check();
    await expect(row.getByLabel(/Amount for PO\//)).toHaveValue("200.00");
    await dialog.getByLabel("Reference (optional)").fill("UTR998877");
    await dialog.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByText("Payment recorded")).toBeVisible();
    const statement = page.getByRole("table", { name: "Statement" });
    await expect(statement.getByRole("row").filter({ hasText: "Payment made" })).toContainText("UTR998877");
    // The chosen invoice now shows ₹100 due; the older Acme purchase is untouched.
    const ours = page.getByRole("listitem").filter({ hasText: "Bill ACME-7501" }).first();
    await expect(ours).toContainText("Due ₹100.00");
  });

  await test.step("purchase bill in one step from the supplier page, part paid, with the bill as a PDF", async () => {
    await page.goto("/suppliers");
    await page.getByRole("link", { name: "Acme Distributors" }).click();
    await page.getByRole("link", { name: "Add purchase bill" }).click();
    await expect(page.getByRole("heading", { name: "Add purchase bill" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Supplier" })).toContainText("Acme Distributors");
    await page.getByPlaceholder("Search or scan the items on the bill…").click();
    await page.getByPlaceholder("Search or scan the items on the bill…").pressSequentially("Ball Pen");
    await page.getByRole("option", { name: /Ball Pen Blue/ }).click();
    await page.getByLabel("Quantity of Ball Pen Blue").fill("5");
    await page.getByLabel("Unit cost of Ball Pen Blue").fill("6");
    await page.getByLabel("Supplier bill no.").fill("PB-3301");
    await page.getByRole("radio", { name: "Part paid" }).click();
    await page.getByLabel("Amount paid now").fill("20");
    await page.getByLabel("Choose bill files").setInputFiles({ name: "acme-bill.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") });
    await expect(page.getByRole("list", { name: "Attached files" })).toContainText("acme-bill.pdf");
    await page.getByRole("button", { name: "Save purchase bill" }).click();
    await expect(page.getByText(/Purchase bill PO\/.* saved/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Attached files" })).toContainText("acme-bill.pdf");
    const fileUrl = (await page.getByRole("link", { name: "acme-bill.pdf" }).getAttribute("href"))!;
    const res = await page.request.get(fileUrl);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    const guest = await browser.newContext();
    expect((await guest.request.get(new URL(fileUrl, page.url()).toString())).status()).toBe(401);
    await guest.close();

    await page.goto("/suppliers");
    await page.getByRole("link", { name: "Acme Distributors" }).click();
    const bill = page.getByRole("listitem").filter({ hasText: "Bill PB-3301" }).first();
    await expect(bill).toContainText("Paid ₹20.00");
    await expect(bill).toContainText("5 of 5 received");
    await expect(bill.getByRole("link", { name: "acme-bill.pdf" })).toBeVisible();
  });

  await test.step("khata: give udhaar to a customer with a note", async () => {
    await page.goto("/khata");
    await expect(page.getByRole("heading", { name: "Khata (Udhaar)" })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: "Walk-in Regular" });
    await row.getByRole("button", { name: "Gave udhaar" }).click();
    const dialog = page.getByRole("dialog", { name: "Gave udhaar" });
    await dialog.getByLabel("Amount").fill("150");
    await dialog.getByLabel("Details").fill("2 kg sugar, pays Sunday");
    await dialog.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByText("Entry added")).toBeVisible();
    await expect(row.getByRole("link", { name: /Remind Walk-in Regular on WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/919876543210\?text=/);
    await row.getByRole("link").first().click();
    await expect(page.getByRole("table", { name: "Statement" }).getByRole("row").filter({ hasText: "Udhaar given" })).toContainText("2 kg sugar, pays Sunday");
  });

  await test.step("undo a mistaken udhaar entry with a reason; it stays visible as reversed", async () => {
    const statement = page.getByRole("table", { name: "Statement" });
    const entry = statement.getByRole("row").filter({ hasText: "Udhaar given" });
    await entry.getByRole("button", { name: /Undo udhaar entry of ₹150\.00/ }).click();
    const dialog = page.getByRole("dialog", { name: "Undo this udhaar entry?" });
    await dialog.getByLabel("Reason").fill("Entered on the wrong customer");
    await dialog.getByRole("button", { name: "Undo udhaar entry" }).click();
    await expect(page.getByText("Entry undone")).toBeVisible();
    await expect(entry).toContainText("Reversed");
    await expect(entry).toContainText("Entered on the wrong customer");
    await expect(statement.getByRole("row").filter({ hasText: "Correction (undo)" })).toContainText("₹150.00");
    await expect(entry.getByRole("button", { name: /Undo/ })).toHaveCount(0);
  });

  await test.step("WhatsApp the bill to a typed number; the link opens the bill without logging in", async () => {
    await page.goto("/pos");
    await page.getByRole("button", { name: /Ball Pen Blue/ }).click();
    await page.getByRole("button", { name: /Pay ₹10\.00/ }).click();
    await page.getByRole("button", { name: /Complete sale/ }).click();
    const done = page.getByRole("dialog", { name: "Sale complete" });
    await done.getByLabel("Send bill on WhatsApp").fill("98765 43210");
    const link = done.getByRole("link", { name: "WhatsApp" });
    await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/919876543210\?text=.*View%20your%20bill/);
    const href = (await link.getAttribute("href"))!;
    const text = decodeURIComponent(href.split("?text=")[1]);
    expect(text).toContain("Ball Pen Blue × 1 = ₹10.00");
    const billUrl = /View your bill: (\S+)/.exec(text)![1];

    const guest = await browser.newContext(); // no session cookie
    const g = await guest.newPage();
    await g.goto(new URL(billUrl).pathname);
    await expect(g.getByText("Ball Pen Blue")).toBeVisible();
    await expect(g.getByText(/TOTAL/)).toBeVisible();
    await g.goto(`${new URL(billUrl).pathname.slice(0, -2)}xx`); // tampered link
    await expect(g.getByText(/could not be found|404/i).first()).toBeVisible();
    await guest.close();
  });
});
