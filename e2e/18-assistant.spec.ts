import { expect, signIn, test } from "./fixtures";
import { OWNER } from "./test-users";

test("Ask Galla opens, takes a question and shows an answer (or says it is off)", async ({ page }) => {
  await signIn(page, OWNER.email, OWNER.password);
  await page.getByRole("button", { name: /Ask Galla/ }).click();
  const panel = page.getByRole("dialog", { name: /Ask Galla/ });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "What is running low?" }).click();
  await expect(panel.getByText("What is running low?").first()).toBeVisible();
  // The test server has no AI key: it must say so clearly instead of failing silently.
  await expect(panel.getByText(/not switched on/)).toBeVisible({ timeout: 20_000 });
  await panel.getByLabel("Your question").fill("Hello");
  await expect(panel.getByRole("button", { name: "Send" })).toBeEnabled();
});
