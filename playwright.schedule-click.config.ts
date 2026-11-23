import { defineConfig } from "@playwright/test";

const baseURL = process.env.SCHEDULE_CLICK_BASE_URL ?? "http://rose-city.localhost:3231";
if (!new URL(baseURL).hostname.endsWith(".localhost")) throw new Error("Schedule click-to-field tests require an isolated local tenant.");
if (!process.env.SCHEDULE_CLICK_STORAGE_STATE) throw new Error("Set SCHEDULE_CLICK_STORAGE_STATE to private local authenticated browser state.");

export default defineConfig({
  testDir: "./tests/browser", testMatch: ["schedule-click-to-field.spec.ts"], workers: 1,
  outputDir: "test-results/schedule-click-to-field", timeout: 120_000, reporter: "list",
  use: { baseURL, storageState: process.env.SCHEDULE_CLICK_STORAGE_STATE, viewport: { width: 1280, height: 900 }, trace: "retain-on-failure" },
});
