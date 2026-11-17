import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: "../../test-results/site07-about-evidence",
  testDir: ".",
  testMatch: "site07-about-evidence.spec.ts",
  workers: 1,
  timeout: 45_000,
  reporter: "list",
  use: { browserName: "chromium", headless: true },
});
