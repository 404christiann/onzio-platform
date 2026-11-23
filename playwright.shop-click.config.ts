import { defineConfig } from "@playwright/test";

const baseURL = process.env.SHOP_CLICK_BASE_URL ?? "http://rose-city.localhost:3230";
const diverseCity = process.env.SHOP_CLICK_DC_BASE_URL ?? "http://diverse-city.localhost:3230";
for (const url of [baseURL, diverseCity]) {
  if (!new URL(url).hostname.endsWith(".localhost")) throw new Error("Shop click-to-field tests require isolated local tenants.");
}
if (!process.env.SHOP_CLICK_STORAGE_STATE) throw new Error("Set SHOP_CLICK_STORAGE_STATE to private local authenticated browser state.");

export default defineConfig({
  testDir: "./tests/browser", testMatch: "shop-click-to-field.spec.ts", workers: 1,
  outputDir: "test-results/shop-click-to-field", timeout: 120_000, reporter: "list",
  use: { baseURL, storageState: process.env.SHOP_CLICK_STORAGE_STATE, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
});
