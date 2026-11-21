import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "hero-video-completion.spec.ts",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: { viewport: { width: 1280, height: 800 } },
});
