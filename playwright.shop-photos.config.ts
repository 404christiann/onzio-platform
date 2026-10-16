import { defineConfig } from "@playwright/test";

const baseURL = process.env.PAGE_EDITOR_BASE_URL ?? "http://alpha.localhost:3110";
if (!new URL(baseURL).hostname.endsWith(".localhost")) throw new Error("Shop photo tests require an isolated local tenant.");
if (!process.env.PAGE_EDITOR_STORAGE_STATE) throw new Error("Set PAGE_EDITOR_STORAGE_STATE to local authenticated browser state.");

export default defineConfig({
  outputDir: "test-results/shop-editor-photos",
  testDir: "./tests/browser",
  testMatch: "shop-editor-photos.spec.ts",
  workers: 1,
  timeout: 180_000,
  reporter: "list",
  use: { baseURL, storageState: process.env.PAGE_EDITOR_STORAGE_STATE, trace: "retain-on-failure" },
});
