import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: "../../test-results/site07-registration-evidence",
  testDir: ".",
  testMatch: "site07-registration-evidence.spec.ts",
  workers: 1,
  timeout: 150_000,
  reporter: "list",
  use: { browserName: "chromium", headless: true },
});
