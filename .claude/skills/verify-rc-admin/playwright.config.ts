import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Config for the verify-rc-admin skill. verify.sh sets every variable; run it through verify.sh.
// No globalSetup on purpose: the repo's alpha-time-zone and cleanup setups target Alpha, and this
// run's database state is owned by verify.sh (reset + seed inside one lock hold).
for (const name of ["RCV_HEAD_URL", "RCV_MAIN_URL", "RCV_STORAGE", "RCV_OUT"]) {
  if (!process.env[name]) throw new Error(`${name} is not set; run .claude/skills/verify-rc-admin/scripts/verify.sh`);
}
for (const name of ["RCV_HEAD_URL", "RCV_MAIN_URL"]) {
  if (!new URL(process.env[name]!).hostname.endsWith(".localhost")) throw new Error(`${name} must be a *.localhost URL`);
}
if (!existsSync(process.env.RCV_STORAGE!)) throw new Error("RCV_STORAGE file is missing; sign in first");

export default defineConfig({
  testDir: ".",
  testMatch: "rc-admin-verify.spec.ts",
  outputDir: `${process.env.RCV_OUT}/playwright`,
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: `${process.env.RCV_OUT}/playwright.json` }]],
  use: {
    storageState: process.env.RCV_STORAGE,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
