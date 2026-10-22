import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

const PORT = 3100;
const secret = (() => {
  try {
    return readFileSync(".data/dev-secret", "utf8").trim();
  } catch {
    return "e2e-only-secret-".padEnd(48, "x");
  }
})();

export const E2E_ENV = {
  MONGODB_URI: process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/stockpilot_e2e?replicaSet=rs0",
  BETTER_AUTH_SECRET: secret,
  APP_URL: `http://localhost:${PORT}`,
  MAIL_SINK: "file",
  UPLOAD_DIR: ".data/e2e-uploads",
};

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/._*"],
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    env: E2E_ENV,
  },
});
