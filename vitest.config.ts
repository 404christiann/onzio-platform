import { defineConfig, type Plugin } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { transformSync } from "rolldown/utils";

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
