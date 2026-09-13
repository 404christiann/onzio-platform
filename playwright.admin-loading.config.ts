import { defineConfig } from "@playwright/test";

const baseURL = process.env.ADMIN_LOADING_BASE_URL ?? "http://alpha.localhost:3110";
const hostname = new URL(baseURL).hostname;
if (!(hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost"))) {
  throw new Error("Admin loading checks require a local preview.");
}
if (!process.env.ADMIN_LOADING_STORAGE_STATE) {
  throw new Error("ADMIN_LOADING_STORAGE_STATE must point to authenticated local browser state.");
}

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "admin-loading*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL,
    storageState: process.env.ADMIN_LOADING_STORAGE_STATE,
    viewport: { width: 1440, height: 900 },
    browserName: "chromium",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
