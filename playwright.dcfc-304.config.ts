import { defineConfig } from "@playwright/test";

const baseURL = process.env.DCFC_304_BASE_URL;

if (!baseURL) {
  throw new Error("DCFC_304_BASE_URL is required for DCFC-304 browser acceptance.");
}

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "diverse-city-admin-public.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    browserName: "chromium",
    serviceWorkers: "block",
    trace: "on-first-retry",
  },
});
