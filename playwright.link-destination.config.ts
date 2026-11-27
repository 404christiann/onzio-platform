import { defineConfig } from "@playwright/test";

const baseURL = process.env.LINK_DEST_BASE_URL ?? "http://linkdest.localhost:3232";
if (!new URL(baseURL).hostname.endsWith(".localhost")) throw new Error("Link destination tests require an isolated local tenant.");
if (!process.env.LINK_DEST_STORAGE_STATE) throw new Error("Set LINK_DEST_STORAGE_STATE to private local authenticated browser state.");

export default defineConfig({
  testDir: "./tests/browser", testMatch: ["link-destination-contact.spec.ts"], workers: 1,
  outputDir: "test-results/link-destination-contact", timeout: 120_000, reporter: "list",
  use: { baseURL, storageState: process.env.LINK_DEST_STORAGE_STATE, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
});
