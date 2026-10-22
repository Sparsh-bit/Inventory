import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { platform, release } from "node:os";

const PORT = 3100;
// ponytail: Playwright's Firefox build won't start on macOS 27 ("Could not find profile folder");
// it still runs on Linux/Windows/older macOS. Drop this check once Playwright ships a fix.
const firefoxWorks = !(platform() === "darwin" && Number(release().split(".")[0]) >= 27);
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
  NIC_EXTRA_HOSTS: "127.0.0.1:4555", // mock e-invoice API started by global setup
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
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Cross-browser / device pass over every page and a sale (needs the data the chromium run creates).
    ...[
      ...(firefoxWorks ? [["firefox", devices["Desktop Firefox"]]] : []),
      ["safari", devices["Desktop Safari"]],
      ["android-phone", devices["Pixel 7"]],
      ["iphone", devices["iPhone 15"]],
      ["ipad", devices["iPad (gen 7)"]],
      ["small-laptop", { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } }],
    ].map(([name, use]) => ({ name: name as string, use: use as (typeof devices)[string], testMatch: /07-devices/, dependencies: ["chromium"] })),
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    env: E2E_ENV,
  },
});
