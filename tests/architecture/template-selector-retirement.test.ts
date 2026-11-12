import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { withSelectorRepository } from "../helpers/selector-repository";
import { diffSelectorTables, scanRepositoryTemplateSelectors } from "../helpers/template-selectors";

const ROOT = process.cwd();

describe("selector guard retirement", () => {
  it("runs the actual architecture guard after every selector is retired", () => {
    withSelectorRepository((root, git, save) => {
      mkdirSync(resolve(root, "components"));
      writeFileSync(resolve(root, "components/Nav.tsx"), "export const Nav = () => null;");
      save({});
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      symlinkSync(resolve(ROOT, "node_modules"), resolve(root, "node_modules"), "dir");
      writeFileSync(resolve(root, ".gitignore"), "node_modules/\n");
      const suite = readFileSync(resolve(ROOT, "tests/architecture/template-selectors.test.ts"), "utf8")
        .replace('"../helpers/template-selectors"', JSON.stringify(resolve(ROOT, "tests/helpers/template-selectors.ts")));
      writeFileSync(resolve(root, "tests/architecture/template-selectors.test.ts"), suite);
      const config = resolve(root, "vitest.config.mts");
      writeFileSync(config, `export default { resolve: { alias: { "@": ${JSON.stringify(ROOT)} } } };`);
      expect(() => execFileSync(process.execPath, [
        resolve(ROOT, "node_modules/vitest/vitest.mjs"), "run",
        "--root", root, "--config", config,
        "--testNamePattern", "^template selector ratchet",
      ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).not.toThrow();
    });
  });

  it("scans tracked, untracked and new-directory source, then permits retirement to zero", () => {
    withSelectorRepository((root, git) => {
      const paths = ["components/Nav.tsx", "packages/presentation/index.ts", "new-club/Home.tsx"];
      for (const path of [...paths, "tests/fixture.ts", "lib/__tests__/fixture.ts", "components/Nav.test.tsx"]) {
        mkdirSync(resolve(root, path, ".."), { recursive: true });
        writeFileSync(resolve(root, path), "render(club.presentationTemplateKey);");
      }
      git("add", paths[0]);
      expect(scanRepositoryTemplateSelectors(root)).toEqual(Object.fromEntries(
        paths.map((path) => [path, { "read:presentationTemplateKey": 1 }]),
      ));
      for (const path of paths) writeFileSync(resolve(root, path), "render(club.name);");
      expect(scanRepositoryTemplateSelectors(root)).toEqual({});
      expect(diffSelectorTables(scanRepositoryTemplateSelectors(root), {})).toEqual({ added: [], stale: [] });
    });
  });
});
