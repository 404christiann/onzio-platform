import { defineConfig } from "@playwright/test";

const baseURL = process.env.ROSTER_CLICK_BASE_URL ?? "http://rose-city.localhost:3233";
if (!new URL(baseURL).hostname.endsWith(".localhost")) throw new Error("Roster click-to-field tests require an isolated local tenant.");
if (!process.env.ROSTER_CLICK_STORAGE_STATE) throw new Error("Set ROSTER_CLICK_STORAGE_STATE to private local authenticated browser state.");

export default defineConfig({
  testDir: "./tests/browser", testMatch: ["roster-click-to-field.spec.ts"], workers: 1,
  outputDir: "test-results/roster-click-to-field", timeout: 120_000, reporter: "list",
  use: { baseURL, storageState: process.env.ROSTER_CLICK_STORAGE_STATE, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
});
