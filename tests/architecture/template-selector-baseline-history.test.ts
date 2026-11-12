import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { withSelectorRepository } from "../helpers/selector-repository";
import {
  ALLOWLIST_PATH,
  diffSelectorTables,
  readBaselineSelectorAllowlist,
  type SelectorTable,
} from "../helpers/template-selectors";

describe("committed selector baseline", () => {
  const large: SelectorTable = { "a.ts": { "literal:academy@1": 3 } };
  const small: SelectorTable = { "a.ts": { "literal:academy@1": 1 } };

  it("constrains an old branch that cherry-picks the guard after main introduces it", () => {
    withSelectorRepository((root, git, save) => {
      const oldBase = git("rev-parse", "HEAD").trim();
      save(small);
      const introduction = git("rev-parse", "HEAD").trim();
      git("update-ref", "refs/remotes/origin/main", introduction);
      git("checkout", "-b", "old-branch", oldBase);
      writeFileSync(resolve(root, "old-branch.txt"), "independent change");
      git("add", ".");
      git("commit", "-m", "old branch work");
      git("cherry-pick", introduction);
      save(large);
      expect(git("merge-base", "HEAD", "origin/main").trim()).toBe(oldBase);
      const baseline = readBaselineSelectorAllowlist(root, ALLOWLIST_PATH);
      expect(baseline).toEqual(small);
      expect(diffSelectorTables(large, baseline ?? {}).added).toHaveLength(1);
    });
  });

  it("uses later main shrinkage instead of an older higher branch-base inventory", () => {
    withSelectorRepository((root, git, save) => {
      save(large);
      const oldBase = git("rev-parse", "HEAD").trim();
      save(small);
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      git("checkout", "-b", "old-branch", oldBase);
      const baseline = readBaselineSelectorAllowlist(root, ALLOWLIST_PATH);
      expect(baseline).toEqual(small);
      expect(diffSelectorTables(large, baseline ?? {}).added).toHaveLength(1);
    });
  });
});
