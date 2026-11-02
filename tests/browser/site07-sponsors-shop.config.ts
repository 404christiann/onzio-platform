import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: "../../test-results/site07-sponsors-shop-evidence",
  testDir: ".",
  testMatch: "site07-sponsors-shop-evidence.spec.ts",
  workers: 1,
  timeout: 45_000,
  reporter: "list",
  use: { browserName: "chromium", headless: true },
});
