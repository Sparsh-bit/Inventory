import { expect, scan, signIn, test } from "./fixtures";
import { OWNER } from "./test-users";

test("offline POS: sell without internet, survive a reload, sync when back online", async ({ page, context, consoleErrors }) => {
  await signIn(page, OWNER.email, OWNER.password);
  await page.evaluate(() => localStorage.setItem("stockpilot.printer", JSON.stringify({ autoPrint: false })));
  await page.goto("/pos");
  // Till registered, catalogue cached, service worker controlling the page.
  await expect(page.locator("[data-offline-ready]")).toBeAttached();
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await page.reload(); // second load populates the page cache through the worker
  await expect(page.locator("[data-offline-ready]")).toBeAttached();

  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "Offline" })).toBeVisible();
  await scan(page, "8901234567892"); // Mineral Water from local catalogue
  await expect(page.getByRole("list", { name: "Cart items" }).getByText("Mineral Water 1L")).toBeVisible();
  await page.keyboard.press("F4");
  await page.getByRole("button", { name: /Complete sale/ }).click();
  const done = page.getByRole("dialog", { name: "Sale complete" });
  await expect(done.getByText(/saved on this device/)).toBeVisible();
  const number = (await done.getByText(/^Bill /).textContent())!.replace("Bill ", "").split(" ·")[0];
  expect(number).toMatch(/^ST\d+\/\d{4}\/00001$/);
  await page.getByRole("button", { name: /New sale/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 to sync" })).toBeVisible();

  // Reload with no internet: the service worker serves the POS and the queued bill survives.
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "1 to sync" })).toBeVisible();
  // Only the browser's own "no network" messages are expected while offline; anything else still fails the test.
  const expected = /ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError|Failed to load resource/;
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !expected.test(e)));

  await context.setOffline(false);
  await expect(page.getByText("1 offline bill synced")).toBeVisible({ timeout: 30_000 });
  await page.goto("/sales?type=all");
  await expect(page.getByRole("link", { name: number })).toBeVisible();
  await expect(page.getByText(/Offline · T\d+/).first()).toBeVisible();
});
