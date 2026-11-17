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

  it("allows first introduction only while current main has no inventory", () => {
    withSelectorRepository((root, _, save) => {
      save(large);
      expect(readBaselineSelectorAllowlist(root, ALLOWLIST_PATH)).toBeNull();
    });
  });

  it("allows a branch to shrink the current main inventory to zero", () => {
    withSelectorRepository((root, git, save) => {
      save(small);
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      save({});
      const baseline = readBaselineSelectorAllowlist(root, ALLOWLIST_PATH);
      expect(baseline).toEqual(small);
      expect(diffSelectorTables({}, baseline ?? {}).added).toEqual([]);
    });
  });

  it("fails closed when current main is unavailable", () => {
    withSelectorRepository((root, git, save) => {
      save(small);
      git("update-ref", "-d", "refs/remotes/origin/main");
      expect(() => readBaselineSelectorAllowlist(root, ALLOWLIST_PATH)).toThrow();
    });
  });

  it("reads current main rather than a raised working or committed allowlist", () => {
    withSelectorRepository((root, git, save) => {
      const original: SelectorTable = { "a.ts": { "literal:academy@1": 1 } };
      const raised: SelectorTable = { "a.ts": { "literal:academy@1": 2 } };
      save(original);
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      save(raised);
      const baseline = readBaselineSelectorAllowlist(root, ALLOWLIST_PATH);
      expect(baseline).toEqual(original);
      expect(diffSelectorTables(raised, baseline ?? {}).added).toEqual([
        { path: "a.ts", signature: "literal:academy@1", allowed: 1, found: 2 },
      ]);
      expect(readBaselineSelectorAllowlist(root, "not-introduced.json")).toBeNull();
    });
  });
});
