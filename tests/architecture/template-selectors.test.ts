import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { templateRegistry } from "@/packages/presentation";
import {
  TEMPLATE_IDS,
  canonicalSelectorJson,
  diffSelectorTables,
  findTemplateSelectors,
  formatSelectorDrift,
  isScannedPath,
  readBaselineSelectorAllowlist,
  scanRepositoryTemplateSelectors,
  type SelectorTable,
} from "../helpers/template-selectors";

const ROOT = process.cwd();
const ALLOWLIST_PATH = "tests/architecture/template-selector-allowlist.json";

const RATCHET_RULE = [
  `${ALLOWLIST_PATH} records every place app code still asks which template a club uses.`,
  "It can only shrink. To retire a selector, delete its branch, then lower its count here",
  "(delete the entry at zero). See tests/README.md, Template selector ratchet.",
].join("\n");

function readAllowlist(): { raw: string; table: SelectorTable } {
  const raw = readFileSync(resolve(ROOT, ALLOWLIST_PATH), "utf8");
  return { raw, table: JSON.parse(raw) as SelectorTable };
}

describe("template selector ratchet", () => {
  const found = scanRepositoryTemplateSelectors(ROOT);
  const { raw, table: allowlist } = readAllowlist();
  const { added, stale } = diffSelectorTables(found, allowlist);

  it("scans the real application source", () => {
    expect(Object.keys(found)).toContain("components/Nav.tsx");
    expect(Object.keys(found).some((path) => path.startsWith("tests/"))).toBe(false);
    expect(Object.keys(found).length).toBeGreaterThan(40);
  });

  it("adds no template selector outside the allowlist", () => {
    expect(
      added.length,
      `New template selector. SITE-08 retires these, it does not add them.\n` +
        `Move the behavior into the club's site module instead of branching on the template.\n` +
        `${formatSelectorDrift(added)}\n${RATCHET_RULE}`,
    ).toBe(0);
  });

  it("allowlists no selector that the code no longer contains", () => {
    expect(
      stale.length,
      `The allowlist is larger than the code. Shrink it to match, never the other way.\n` +
        `${formatSelectorDrift(stale)}\n${RATCHET_RULE}`,
    ).toBe(0);
  });

  it("never increases an allowlist count from the branch base", () => {
    const previous = readBaselineSelectorAllowlist(ROOT, ALLOWLIST_PATH);
    if (!previous) return;
    const increases = diffSelectorTables(allowlist, previous).added;
    expect(increases, formatSelectorDrift(increases)).toEqual([]);
  });

  it("references no retired presentation API even if the allowlist names it", () => {
    const retired = Object.entries(found).flatMap(([path, counts]) =>
      Object.keys(counts)
        .filter((signature) => signature.startsWith("retired:"))
        .map((signature) => `${path} ${signature}`),
    );
    expect(retired).toEqual([]);
  });

  it("stores the allowlist sorted, with positive whole counts and no empty files", () => {
    for (const [path, counts] of Object.entries(allowlist)) {
      expect(Object.keys(counts).length, `${path} has no selectors`).toBeGreaterThan(0);
      for (const [signature, count] of Object.entries(counts)) {
        expect(Number.isInteger(count) && count > 0, `${path} ${signature}`).toBe(true);
      }
    }
    expect(raw).toBe(canonicalSelectorJson(allowlist));
  });
});

describe("template selector detection", () => {
  const scan = (source: string, path = "components/Example.tsx") =>
    findTemplateSelectors(path, source);

  it("counts key reads and template key literals separately", () => {
    expect(
      scan(`
        export function Example({ club }) {
          if (club.presentationTemplateKey === "academy@1") return null;
          return club.presentationTemplateKey !== "editorial@1" ? "a" : "b";
        }
      `),
    ).toEqual({
      "read:presentationTemplateKey": 2,
      "literal:academy@1": 1,
      "literal:editorial@1": 1,
    });
  });

  it("counts every use of a boolean derived from the template", () => {
    expect(
      scan(`
        const isAcademy = club.presentationTemplateKey === "academy@1";
        const hidden = isAcademy || isEditorial;
        const a = isAcademy ? 1 : 2;
        const b = hidden ? 3 : 4;
      `),
    ).toEqual({
      "read:presentationTemplateKey": 1,
      "literal:academy@1": 1,
      "flag:isAcademy": 2,
      "flag:isEditorial": 1,
      "flag:hidden": 1,
    });
  });

  it("counts a prop that carries a template boolean into another component", () => {
    expect(scan(`export function Skeleton({ isAcademy }) { return isAcademy ? <A /> : <B />; }`)).toEqual({
      "flag:isAcademy": 2,
    });
  });

  it("counts a mixed expression where it names the template, not through its own name", () => {
    expect(
      scan(`
        const isHero = isAcademy && menuOpen;
        const shown = isHero ? 1 : 2;
      `),
    ).toEqual({ "flag:isAcademy": 1 });
  });

  it("counts destructured, element, aliased and type-level reads of the template key", () => {
    expect(
      scan(`
        const { presentationTemplateKey } = club;
        const viaElement = club["presentationTemplateKey"];
        const key = club.presentationTemplateKey;
        use(key);
        type Template = Pick<ClubContext, "id" | "presentationTemplateKey">;
      `),
    ).toEqual({
      "read:presentationTemplateKey": 4,
      "flag:key": 1,
    });
  });

  it("counts template lists and constants that alias a template key", () => {
    expect(
      scan(`
        const EDITORIAL = "editorial@1";
        export const route = { visibleForTemplates: ["academy@1", EDITORIAL], hiddenForTemplates: [EDITORIAL] };
      `),
    ).toEqual({
      "literal:editorial@1": 1,
      "literal:academy@1": 1,
      "flag:EDITORIAL": 2,
      "read:visibleForTemplates": 1,
      "read:hiddenForTemplates": 1,
    });
  });

  it("counts the template visibility lists of the admin route manifest", () => {
    expect(
      scan(`
        type Route = { hiddenForTemplates?: readonly string[]; visibleForTemplates?: readonly string[] };
        const shown = !route.hiddenForTemplates?.includes(key);
      `),
    ).toEqual({
      "read:hiddenForTemplates": 2,
      "read:visibleForTemplates": 1,
    });
  });

  it("counts a bare template id compared with any expression, and what derives from it", () => {
    expect(
      scan(`
        if (document.template.id === "academy") use();
        switch (variant) { case "heritage": break; default: break; }
        const isEditorialMode = mode === "editorial";
        use(isEditorialMode);
      `),
    ).toEqual({
      "id:academy": 1,
      "id:heritage": 1,
      "id:editorial": 1,
      "flag:isEditorialMode": 1,
    });
  });

  it("counts values computed from the template by method call, membership and lookup", () => {
    expect(
      scan(`
        const k = club.presentationTemplateKey;
        const a = k.startsWith("x");
        const b = LIST.includes(k);
        const c = STYLES[k];
        use(a, b, c);
      `),
    ).toEqual({
      "read:presentationTemplateKey": 1,
      "flag:k": 3,
      "flag:a": 1,
      "flag:b": 1,
      "flag:c": 1,
    });
  });

  it("counts references to a derived value, not property names or same-named variables elsewhere", () => {
    expect(
      scan(`
        function A() {
          const key = club.presentationTemplateKey;
          return <li key={item.id}>{profile.key}{key}</li>;
        }
        function B() {
          const [hidden, setHidden] = useState(false);
          return hidden ? <p /> : <q />;
        }
        function C() {
          const hidden = isAcademy || isEditorial;
          return hidden ? <p /> : <q />;
        }
      `),
    ).toEqual({
      "read:presentationTemplateKey": 1,
      "flag:key": 1,
      "flag:isAcademy": 1,
      "flag:isEditorial": 1,
      "flag:hidden": 1,
    });
  });

  it("derives a value only from references in scope, not from properties or other functions", () => {
    expect(
      scan(`
        function resolve(club) {
          const key = club.presentationTemplateKey;
          return key === "academy@1";
        }
        function bindingLabel(identity) {
          const bindingKey = identity.key;
          return bindingKey.toUpperCase();
        }
        function pick(source, key) {
          const value = source[key];
          return value ?? 0;
        }
      `),
    ).toEqual({
      "read:presentationTemplateKey": 1,
      "literal:academy@1": 1,
      "flag:key": 1,
    });
  });

  it("does not count a parameter, binding or member that shadows a derived name", () => {
    expect(
      scan(`
        const key = club.presentationTemplateKey;
        use(key);
        function f(key) { return key + 1; }
        const g = ({ key }) => key;
        class Holder { get key() { return 1; } }
        interface Keyed { key(): void }
      `),
    ).toEqual({
      "read:presentationTemplateKey": 1,
      "flag:key": 1,
    });
  });

  it("counts the data attributes that scope styles to a template", () => {
    expect(
      scan(`
        const css = \`\${base}\n[data-font-pack="academy"] main h1 { color: red; }\`;
        const selector = '[data-site-template="editorial"] .public-main';
        export const Frame = () => <div data-site-template="editorial" />;
      `),
    ).toEqual({
      "read:data-font-pack": 1,
      "read:data-site-template": 2,
    });
  });

  it("ignores comments, unrelated strings and tenant slug checks", () => {
    expect(
      scan(`
        // club.presentationTemplateKey === "academy@1" is retired
        /* isAcademy */
        const fontPack = dark ? "academy" : undefined;
        const legacy = club.slug === "rose-city";
        const label = "Academy";
      `),
    ).toEqual({});
  });

  it("reads TypeScript, TSX and plain JavaScript", () => {
    const source = `const k = club.presentationTemplateKey === "academy@1";`;
    const expected = { "read:presentationTemplateKey": 1, "literal:academy@1": 1 };
    expect(scan(source, "lib/example.ts")).toEqual(expected);
    expect(scan(source, "scripts/example.mjs")).toEqual(expected);
    expect(scan(`const a = <A on={club.presentationTemplateKey === "academy@1"} />;`, "components/e.jsx")).toEqual(
      expected,
    );
  });
});

describe("retired presentation APIs", () => {
  it.each([
    "switchPresentationTemplate",
    "evaluatePresentationReadiness",
    "recordTemplateOverride",
    "CompatibilityReport",
    "ReadinessRecommendation",
    "ReadinessPhoto",
    "PlaceholderSuggestion",
    "defaultFontPack",
    "compatibleFontPacks",
    "defaultSections",
    "supportedSections",
  ])("rejects a reference to %s", (name) => {
    expect(findTemplateSelectors("lib/consumer.ts", `use(${name});`)).toEqual({
      [`retired:${name}`]: 1,
    });
  });

  it("detects named imports, namespace access, dynamic property access and types", () => {
    expect(
      findTemplateSelectors("lib/consumer.ts", `
        import { switchPresentationTemplate as change } from "@/packages/presentation";
        presentation.evaluatePresentationReadiness();
        presentation["recordTemplateOverride"]();
        type Saved = CompatibilityReport;
      `),
    ).toEqual({
      "retired:switchPresentationTemplate": 1,
      "retired:evaluatePresentationReadiness": 1,
      "retired:recordTemplateOverride": 1,
      "retired:CompatibilityReport": 1,
    });
  });

  it("keeps live parser registries and historical comments outside the retired set", () => {
    expect(
      findTemplateSelectors("packages/presentation/index.ts", `
        // switchPresentationTemplate was deleted.
        use(fontPacks, sectionRegistry, themeSchema);
      `),
    ).toEqual({});
  });
});

describe("template selector vocabulary", () => {
  it("recognizes every template the presentation package registers", () => {
    const registered = Object.keys(templateRegistry).map((key) => key.split("@")[0]);
    expect(registered.filter((id) => !TEMPLATE_IDS.includes(id))).toEqual([]);
  });
});

describe("template selector drift", () => {
  const one: SelectorTable = { "a.ts": { "literal:academy@1": 2 } };

  it("reports a selector added beyond the allowlist", () => {
    const grown: SelectorTable = { "a.ts": { "literal:academy@1": 3 } };
    expect(diffSelectorTables(grown, one)).toEqual({
      added: [{ path: "a.ts", signature: "literal:academy@1", allowed: 2, found: 3 }],
      stale: [],
    });
  });

  it("reports a selector in a new file and a new kind in a known file", () => {
    const found: SelectorTable = {
      "a.ts": { "literal:academy@1": 2, "literal:editorial@1": 1 },
      "b.ts": { "read:templateKey": 1 },
    };
    expect(diffSelectorTables(found, one).added.map((d) => `${d.path} ${d.signature}`)).toEqual([
      "a.ts literal:editorial@1",
      "b.ts read:templateKey",
    ]);
  });

  it("reports an allowlisted selector that was removed from code", () => {
    const shrunk: SelectorTable = { "a.ts": { "literal:academy@1": 1 } };
    expect(diffSelectorTables(shrunk, one)).toEqual({
      added: [],
      stale: [{ path: "a.ts", signature: "literal:academy@1", allowed: 2, found: 1 }],
    });
    expect(diffSelectorTables({}, one).stale).toHaveLength(1);
  });

  it("reports a swapped selector as one addition and one stale entry", () => {
    const swapped: SelectorTable = { "a.ts": { "literal:editorial@1": 2 } };
    const { added, stale } = diffSelectorTables(swapped, one);
    expect([added.length, stale.length]).toEqual([1, 1]);
  });

  it("reports nothing when code and allowlist match", () => {
    expect(diffSelectorTables(one, one)).toEqual({ added: [], stale: [] });
  });
});

describe("template selector scan scope", () => {
  it.each([
    ["components/Nav.tsx", true],
    ["app/(public)/roster/page.tsx", true],
    ["lib/club-context.ts", true],
    ["scripts/pilot-site-coordination.ts", true],
    ["middleware.ts", true],
    ["sites/new-club/Home.tsx", true],
    ["tests/contracts/editorial-template.test.ts", false],
    ["tests/helpers/template-selectors.ts", false],
    ["lib/__tests__/shop-editor-rebase.test.ts", false],
    ["scripts/check-site-performance-redirect.test.mjs", false],
    ["packages/presentation/index.ts", true],
    ["docs/site-architecture.md", false],
    ["supabase/migrations/20261022200815_about_content_policy.sql", false],
  ])("%s scanned: %s", (path, scanned) => {
    expect(isScannedPath(path)).toBe(scanned);
  });
});

describe("committed selector baseline", () => {
  it("reads the branch base rather than a raised working or committed allowlist", () => {
    const root = mkdtempSync(resolve(tmpdir(), "onzio-selector-baseline-"));
    const git = (...args: string[]) => execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const original: SelectorTable = { "a.ts": { "literal:academy@1": 1 } };
    const raised: SelectorTable = { "a.ts": { "literal:academy@1": 2 } };
    try {
      git("init");
      git("config", "user.name", "Selector Test");
      git("config", "user.email", "selector@example.invalid");
      mkdirSync(resolve(root, "tests/architecture"), { recursive: true });
      writeFileSync(resolve(root, ALLOWLIST_PATH), canonicalSelectorJson(original));
      git("add", ".");
      git("commit", "-m", "initial selector baseline");
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      writeFileSync(resolve(root, ALLOWLIST_PATH), canonicalSelectorJson(raised));
      git("add", ".");
      git("commit", "-m", "raise selector count");
      const baseline = readBaselineSelectorAllowlist(root, ALLOWLIST_PATH);
      expect(baseline).toEqual(original);
      expect(diffSelectorTables(raised, baseline ?? {}).added).toEqual([
        { path: "a.ts", signature: "literal:academy@1", allowed: 1, found: 2 },
      ]);
      expect(readBaselineSelectorAllowlist(root, "not-introduced.json")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
