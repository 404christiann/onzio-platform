import { defineConfig } from "@playwright/test";

const baseURL = process.env.DCFC_403_BASE_URL;
if (!baseURL) throw new Error("DCFC_403_BASE_URL is required for DCFC-403 browser acceptance.");

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "diverse-city-local-rollout.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    browserName: "chromium",
    serviceWorkers: "block",
    trace: "on-first-retry",
  },
});
