import { defineConfig, type Plugin } from "vitest/config";
import { loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { transformSync } from "rolldown/utils";

// Next.js auto-loads `.env.test` (NODE_ENV=test) for `app`/`lib` code, but
// plain `vitest` does not share that pipeline, so any module a contract test
// imports that reads `process.env.NEXT_PUBLIC_SUPABASE_URL` (e.g.
// lib/supabase.ts) would otherwise throw at import time. Load the same
// loopback-only `.env.test` values Next.js would, without overriding
// anything a real shell/CI already exported (tests/helpers/environment.ts
// still rejects non-loopback URLs regardless of source).
const testEnv = loadEnv("test", process.cwd(), "");
for (const [key, value] of Object.entries(testEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

// tsconfig.json keeps `jsx: preserve` for Next.js, which the default
// transform honors and therefore leaves JSX uncompiled. Compile .tsx here
// (without tsconfig discovery) so contract tests can render components
// through react-dom/server.
const compileJsx: Plugin = {
  name: "onzio:compile-jsx",
  enforce: "pre",
  transform(code, id) {
    const [filepath] = id.split("?");
    if (!filepath.endsWith(".tsx")) return;
    const result = transformSync(filepath, code, {
      lang: "tsx",
      jsx: { runtime: "automatic" },
      sourcemap: true,
    });
    return { code: result.code, map: result.map };
  },
};

export default defineConfig({
  plugins: [tsconfigPaths(), compileJsx],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "lib/__tests__/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
  },
});
