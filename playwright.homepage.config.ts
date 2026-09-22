import { defineConfig } from "@playwright/test";

const baseURL = process.env.HOMEPAGE_BASE_URL ?? "http://alpha.localhost:3110";
if (!new URL(baseURL).hostname.endsWith(".localhost")) throw new Error("Homepage tests require an isolated local tenant.");
if (!process.env.HOMEPAGE_STORAGE_STATE) throw new Error("Set HOMEPAGE_STORAGE_STATE to local authenticated browser state.");

export default defineConfig({
  outputDir: "test-results/homepage-editor-browser",
  testDir: "./tests/browser", testMatch: "homepage-editor*.spec.ts", workers: 1,
  timeout: 60_000, reporter: "list",
  use: { baseURL, storageState: process.env.HOMEPAGE_STORAGE_STATE, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
});
