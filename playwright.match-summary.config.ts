import { defineConfig } from "@playwright/test";

const baseURL = process.env.MATCH_SUMMARY_BASE_URL ?? "http://rose-city.localhost:3261";
const host = new URL(baseURL).hostname;
if (!host.endsWith(".localhost")) throw new Error("Match Summary checks require a loopback Rose City tenant.");

export default defineConfig({
  outputDir: "test-results/match-summary-scorers",
  testDir: "./tests/browser",
  testMatch: "match-summary-scorers.spec.ts",
  workers: 1,
  timeout: 120_000,
  reporter: "list",
  use: { baseURL, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
});
