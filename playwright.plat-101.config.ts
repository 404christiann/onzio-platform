import { defineConfig } from "@playwright/test";

export default defineConfig({
  globalSetup: "./tests/browser/local-test-data-cleanup.global-setup.ts",
  testDir: "./tests/browser",
  testMatch: "platform-auth-local.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAT101_BASE_URL ?? "http://alpha.localhost:3000",
    browserName: "chromium",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
});
