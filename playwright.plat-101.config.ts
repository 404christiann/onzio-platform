import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "platform-auth-local.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://alpha.localhost:3000",
    browserName: "chromium",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
});
