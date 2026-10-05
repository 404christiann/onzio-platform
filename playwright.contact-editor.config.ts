import { defineConfig } from "@playwright/test";

const baseURL = process.env.PAGE_EDITOR_BASE_URL ?? "http://alpha.localhost:3110";
if (!new URL(baseURL).hostname.endsWith(".localhost")) {
  throw new Error("Contact editor browser checks require a local tenant.");
}
if (!process.env.PAGE_EDITOR_STORAGE_STATE) {
  throw new Error("Set PAGE_EDITOR_STORAGE_STATE to local authenticated browser state.");
}

export default defineConfig({
  outputDir: "test-results/contact-editor",
  testDir: "./tests/browser",
  testMatch: "public-page-contact-review.spec.ts",
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL,
    storageState: process.env.PAGE_EDITOR_STORAGE_STATE,
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
});
