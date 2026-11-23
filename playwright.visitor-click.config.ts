import { defineConfig } from "@playwright/test";

const baseURL = process.env.VISITOR_CLICK_BASE_URL ?? "http://rose-city.localhost:3230";
if (!new URL(baseURL).hostname.endsWith(".localhost")) throw new Error("Visitor page click-to-field tests require an isolated local tenant.");
if (!process.env.VISITOR_CLICK_STORAGE_STATE) throw new Error("Set VISITOR_CLICK_STORAGE_STATE to private local authenticated browser state.");

export default defineConfig({
  testDir: "./tests/browser", testMatch: ["visitor-click-to-field.spec.ts", "list-click-to-field.spec.ts"], workers: 1,
  outputDir: "test-results/visitor-click-to-field", timeout: 120_000, reporter: "list",
  use: { baseURL, storageState: process.env.VISITOR_CLICK_STORAGE_STATE, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
});
