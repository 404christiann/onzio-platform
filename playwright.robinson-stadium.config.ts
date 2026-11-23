import { defineConfig } from "@playwright/test";

const baseURL = process.env.ROBINSON_STADIUM_BASE_URL ?? "http://rose-city.localhost:3230";
if (!new URL(baseURL).hostname.endsWith(".localhost")) throw new Error("Robinson Stadium editor tests require an isolated local tenant.");
if (!process.env.ROBINSON_STADIUM_STORAGE_STATE) throw new Error("Set ROBINSON_STADIUM_STORAGE_STATE to private local authenticated browser state.");

export default defineConfig({
  testDir: "./tests/browser", testMatch: "robinson-stadium-click-to-field.spec.ts", workers: 1,
  outputDir: "test-results/robinson-stadium-click-to-field", timeout: 120_000, reporter: "list",
  use: { baseURL, storageState: process.env.ROBINSON_STADIUM_STORAGE_STATE, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
});
