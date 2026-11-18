import { defineConfig } from "@playwright/test";

const baseURL = process.env.CINEMATIC_HOMEPAGE_BASE_URL ?? "http://rose-city.localhost:3198";
const hostname = new URL(baseURL).hostname;
if (!hostname.endsWith(".localhost")) throw new Error("Cinematic homepage tests require an isolated local tenant.");
if (!process.env.CINEMATIC_HOMEPAGE_STORAGE_STATE) throw new Error("Set CINEMATIC_HOMEPAGE_STORAGE_STATE to private local authenticated browser state.");

export default defineConfig({
  testDir: "./tests/browser", testMatch: "cinematic-homepage-editor.spec.ts", workers: 1,
  outputDir: "test-results/cinematic-homepage-editor", timeout: 180_000, reporter: "list",
  use: { baseURL, storageState: process.env.CINEMATIC_HOMEPAGE_STORAGE_STATE, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
});
