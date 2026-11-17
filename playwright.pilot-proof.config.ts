import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "pilot-proof-*.spec.ts",
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: { trace: "retain-on-failure" },
});
