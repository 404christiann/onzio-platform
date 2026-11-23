import { defineConfig } from "@playwright/test";

const baseURL = process.env.ACP_CLICK_BASE_URL ?? "http://rose-city.localhost:3232";
if (!new URL(baseURL).hostname.endsWith(".localhost")) throw new Error("About, Contact and Policies click-to-field tests require an isolated local tenant.");
if (!process.env.ACP_CLICK_STORAGE_STATE) throw new Error("Set ACP_CLICK_STORAGE_STATE to private local authenticated browser state.");

export default defineConfig({
  testDir: "./tests/browser", testMatch: ["about-contact-policies-click-to-field.spec.ts"], workers: 1,
  outputDir: "test-results/about-contact-policies-click-to-field", timeout: 120_000, reporter: "list",
  use: { baseURL, storageState: process.env.ACP_CLICK_STORAGE_STATE, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
});
