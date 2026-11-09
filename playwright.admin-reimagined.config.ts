import { defineConfig } from "@playwright/test";

// ADMIN-RE-05: the reimagined admin on local Alpha, at phone and laptop width.
// The global setup switches Alpha to admin_portal = 'reimagined' for the run and
// restores it afterwards. Run under scripts/with-local-db-lock.sh against a
// production build at http://alpha.localhost:3110 (tests/README.md).
const baseURL = process.env.ADMIN_REIMAGINED_BASE_URL ?? "http://alpha.localhost:3110";
if (!new URL(baseURL).hostname.endsWith(".localhost")) {
  throw new Error("Reimagined admin checks require an isolated local tenant.");
}
if (!process.env.ADMIN_REIMAGINED_STORAGE_STATE) {
  throw new Error("Set ADMIN_REIMAGINED_STORAGE_STATE to the local owner browser state.");
}

export default defineConfig({
  outputDir: "test-results/admin-reimagined/artifacts",
  testDir: "./tests/browser",
  testMatch: "admin-reimagined*.spec.ts",
  globalSetup: ["./tests/browser/admin-reimagined.global-setup.ts", "./tests/browser/local-test-data-cleanup.global-setup.ts"],
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL,
    storageState: process.env.ADMIN_REIMAGINED_STORAGE_STATE,
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
});
