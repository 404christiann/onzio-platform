import { defineConfig } from "@playwright/test";

const baseURL = process.env.ROSTER_MEDIA_BASE_URL;

if (!baseURL) {
  throw new Error(
    "ROSTER_MEDIA_BASE_URL is required for the public roster media check.",
  );
}

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "roster-media.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    serviceWorkers: "block",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "iphone-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
