import { defineConfig } from "@playwright/test";

const baseURL = process.env.ADMIN_GUIDED_BASE_URL ?? "http://alpha.localhost:3110";
if (!new URL(baseURL).hostname.endsWith(".localhost")) {
  throw new Error("Guided admin checks require an isolated local tenant.");
}
if (!process.env.ADMIN_GUIDED_STORAGE_STATE) {
  throw new Error("Set ADMIN_GUIDED_STORAGE_STATE to local authenticated browser state.");
}

export default defineConfig({
  outputDir: "test-results/admin-guided",
  testDir: "./tests/browser",
  testMatch: "admin-guided*.spec.ts",
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL,
    storageState: process.env.ADMIN_GUIDED_STORAGE_STATE,
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
});
