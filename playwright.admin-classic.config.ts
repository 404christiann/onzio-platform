import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const baseURL = process.env.ADMIN_CLASSIC_BASE_URL ?? "http://alpha.localhost:3110";
const host = new URL(baseURL).hostname;
if (!(host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost"))) {
  throw new Error("Classic admin checks require a loopback tenant.");
}

const storageState = process.env.ADMIN_CLASSIC_STORAGE_STATE;
if (!storageState || !existsSync(storageState)) {
  throw new Error("Set ADMIN_CLASSIC_STORAGE_STATE to a fresh local authenticated browser state file.");
}

const colorScheme = process.env.ADMIN_CLASSIC_COLOR_SCHEME ?? "light";
if (colorScheme !== "light" && colorScheme !== "dark") {
  throw new Error("ADMIN_CLASSIC_COLOR_SCHEME must be light or dark.");
}

const reducedMotion = process.env.ADMIN_CLASSIC_REDUCED_MOTION === "1" ? "reduce" : "no-preference";

export default defineConfig({
  globalSetup: ["./tests/browser/alpha-time-zone.global-setup.ts", "./tests/browser/local-test-data-cleanup.global-setup.ts"],
  outputDir: "test-results/admin-classic",
  testDir: "./tests/browser",
  testMatch: "admin-classic*.spec.ts",
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL,
    storageState,
    colorScheme,
    contextOptions: { reducedMotion },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
