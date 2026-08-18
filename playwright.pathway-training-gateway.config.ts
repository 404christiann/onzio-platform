import { defineConfig } from "@playwright/test";

const baseURL = process.env.PATHWAY_GATEWAY_BASE_URL;
const storageState = process.env.PATHWAY_GATEWAY_STORAGE_STATE;

if (!baseURL) {
  throw new Error(
    "PATHWAY_GATEWAY_BASE_URL is required for the pathway training gateway check.",
  );
}

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "pathway-training-gateway.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    browserName: "chromium",
    serviceWorkers: "block",
    ...(storageState ? { storageState } : {}),
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
