import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: "test-results/site07-programs-evidence",
  testDir: "./tests/browser",
  testMatch: "site07-programs-evidence.spec.ts",
  workers: 1,
  timeout: 45_000,
  reporter: "list",
  use: { browserName: "chromium", headless: true },
});
