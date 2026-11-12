import { configDefaults, defineConfig } from "vitest/config";

// `unit` is the catch-all, so a test file added in a new directory still runs.
const ALL_TESTS = ["tests/**/*.test.ts", "lib/__tests__/**/*.test.ts"];
// Database files share deterministic tenant singleton fixtures. Running them
// in parallel lets one file restore a singleton while another asserts it.
const DATABASE_TESTS = ["tests/database/**/*.test.ts"];
// Pilot proofs start servers and own process groups, so parallel files collide
// on ports and processes.
const PILOT_TESTS = ["tests/architecture/pilot-*.test.ts"];
const SETUP = ["./vitest.setup.ts"];
const SERIAL_GUARD = "./tests/global-setup/serial-project-guard.ts";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Next.js preserves JSX for its own compiler. Render contracts need Vite
  // to compile it using React's automatic runtime instead.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    globals: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ALL_TESTS,
          exclude: [...configDefaults.exclude, ...DATABASE_TESTS, ...PILOT_TESTS],
          setupFiles: SETUP,
          pool: "threads",
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: DATABASE_TESTS,
          setupFiles: SETUP,
          globalSetup: [SERIAL_GUARD, "./tests/global-setup/local-test-data-cleanup.ts"],
          pool: "forks",
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          name: "pilot",
          include: PILOT_TESTS,
          setupFiles: SETUP,
          globalSetup: [SERIAL_GUARD],
          pool: "forks",
          fileParallelism: false,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
