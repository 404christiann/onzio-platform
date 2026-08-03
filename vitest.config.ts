import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "lib/__tests__/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Database contract files share deterministic tenant singleton fixtures.
    // Running files in parallel lets one file restore a singleton while
    // another is asserting it, producing false failures and data races.
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
