import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

  it("excludes test sources from the real application inventory", () => {
    expect(Object.keys(found).every(isScannedPath)).toBe(true);
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

  it("never increases an allowlist count from current main", () => {
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

  it("counts every use of a destructured template alias, including a new branch", () => {
    const before = scan(`render(club.presentationTemplateKey);`);
    const after = scan(`
      const { presentationTemplateKey: key } = club;
      render(key);
      if (key.startsWith("academy")) use();
    `);
    expect(after).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 2 });
    expect(diffSelectorTables({ "a.ts": after }, { "a.ts": before }).added).toEqual([
      { path: "a.ts", signature: "flag:key", allowed: 0, found: 2 },
    ]);
  });

  it("tracks nested and static string destructured aliases through derived values", () => {
    expect(scan(`
      const { nested: { "presentationTemplateKey": key } } = club;
      const selected = key.startsWith("academy");
      use(selected);
    `)).toEqual({
      "read:presentationTemplateKey": 1,
      "flag:key": 1,
      "flag:selected": 1,
    });
  });

  it("keeps destructured aliases inside their lexical scope and respects shadows", () => {
    expect(scan(`
      {
        const { presentationTemplateKey: key } = club;
        use(key);
        function f(key) { use(key); }
        { const { key } = unrelated; use(key); }
        for (const key of unrelated) use(key);
        try {} catch (key) { use(key); }
      }
      use(key);
    `)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1 });
  });

  it("limits loop destructuring aliases to the loop", () => {
    expect(scan(`
      for (const { presentationTemplateKey: key } of clubs) use(key);
      use(key);
    `)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1 });
  });

  it.each([
    `if (visible) { var { presentationTemplateKey: key } = club; }`,
    `for (var { presentationTemplateKey: key } of clubs) use();`,
  ])("keeps var destructuring aliases available in the enclosing function", (declaration) => {
    expect(scan(`
      function render() {
        ${declaration}
        if (key.startsWith("academy")) use();
      }
      use(key);
    `)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1 });
  });

  it.each([
    `var key = club.presentationTemplateKey;`,
    `var { presentationTemplateKey: key } = club;`,
  ])("counts a body-level var alias and its new branch", (declaration) => {
    const before = scan(`function render() { renderKey(club.presentationTemplateKey); }`);
    const after = scan(`
      function render() {
        ${declaration}
        if (key.startsWith("academy")) use();
      }
    `);
    expect(after).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1 });
    expect(diffSelectorTables({ "a.ts": after }, { "a.ts": before }).added).toEqual([
      { path: "a.ts", signature: "flag:key", allowed: 0, found: 1 },
    ]);
  });

  it.each([
    `key = club.presentationTemplateKey`,
    `{ key = club.presentationTemplateKey }`,
  ])("counts a default binding initializer and its new branch", (parameter) => {
    const before = scan(`function render() { renderKey(club.presentationTemplateKey); }`);
    const after = scan(`
      function render(${parameter}) {
        if (key.startsWith("academy")) use();
      }
      use(key);
    `);
    expect(after).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1 });
    expect(diffSelectorTables({ "a.ts": after }, { "a.ts": before }).added).toEqual([
      { path: "a.ts", signature: "flag:key", allowed: 0, found: 1 },
    ]);
  });

  it.each([
    `var key = unrelated;`,
    `var { key } = unrelated;`,
    `if (visible) { var key = unrelated; }`,
    `for (var key of unrelated) use(key);`,
  ])("respects a nested function's unrelated var binding", (declaration) => {
    expect(scan(`
      function render() {
        var key = club.presentationTemplateKey;
        use(key);
        function nested() {
          ${declaration}
          use(key);
        }
        use(key);
      }
    `)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 2 });
  });

  it.each([
    `var key = unrelated;`,
    `if (visible) { var key = unrelated; }`,
    `for (var key of unrelated) use(key);`,
    `function key() {}`,
    `class key {}`,
  ])("does not derive through an unrelated nested binding", (declaration) => {
    expect(scan(`
      const key = club.presentationTemplateKey;
      use(key);
      function nested() {
        ${declaration}
        const selected = key.startsWith("academy");
        use(selected);
      }
    `)).toEqual({
      "read:presentationTemplateKey": 1,
      "flag:key": 1,
    });
  });

  it("keeps a named function expression's binding inside that function", () => {
    expect(scan(`
      const key = club.presentationTemplateKey;
      const nested = function key() { use(key); };
      const selected = key.startsWith("academy");
      use(selected);
    `)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1, "flag:selected": 1 });
  });

  it.each([
    ["selected = key", "selected"],
    ["selected = { key }", "selected.key"],
    ["selected = () => key", "selected()"],
    ["selected = () => ({ key })", "selected().key"],
  ])("keeps a named function expression's self-binding visible to defaults %s", (parameter, value) => {
    const source = `
      const key = club.presentationTemplateKey;
      const render = function key(${parameter}) {
        function key() {} use(typeof ${value});
      };
    `;
    const observed: string[] = [];
    new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, (value: string) => observed.push(value),
    );
    expect(observed).toEqual(["function"]);
    expect(scan(source)).toEqual({ "read:presentationTemplateKey": 1 });
  });

  it("keeps a named expression's own parameter before its self-binding", () => {
    const source = `
      const key = club.presentationTemplateKey;
      const render = function key(key = key) { function key() {} use(key); };
    `;
    expect(() => new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, () => {},
    )).toThrow(ReferenceError);
    expect(scan(source)).toEqual({ "read:presentationTemplateKey": 1 });
  });

  it("resolves outside a named expression when the self-binding has another name", () => {
    const source = `
      const key = club.presentationTemplateKey;
      const render = function other(selected = key.startsWith("academy")) {
        function key() {} use(selected);
      };
    `;
    const observed: boolean[] = [];
    new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, (value: boolean) => observed.push(value),
    );
    expect(observed).toEqual([true]);
    expect(scan(source)).toEqual({
      "read:presentationTemplateKey": 1, "flag:key": 1, "flag:selected": 1,
    });
  });

  it("derives defaults from earlier parameters and keeps the aliases inside their function", () => {
    expect(scan(`
      function render(key = club.presentationTemplateKey, selected = key.startsWith("academy")) {
        use(selected);
      }
      use(key, selected);
    `)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1, "flag:selected": 1 });
  });

  it("resolves a parameter default before the body var environment", () => {
    const source = `
      const key = club.presentationTemplateKey;
      function render(selected = key.startsWith("academy")) {
        var key = unrelated;
        use(selected);
      }
    `;
    const observed: boolean[] = [];
    new Function("club", "unrelated", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, "other", (value: boolean) => observed.push(value),
    );
    expect(observed).toEqual([true]);
    expect(scan(source)).toEqual({
      "read:presentationTemplateKey": 1, "flag:key": 1, "flag:selected": 1,
    });
  });

  it("counts the outer key and derived default before a body function declaration", () => {
    const before = `const key = club.presentationTemplateKey;`;
    const source = before + `function render(selected=key.startsWith('academy')){function key(){}use(selected)}`;
    const observed: boolean[] = [];
    new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, (value: boolean) => observed.push(value),
    );
    expect(observed).toEqual([true]);
    const after = scan(source);
    expect(after).toEqual({
      "read:presentationTemplateKey": 1, "flag:key": 1, "flag:selected": 1,
    });
    expect(diffSelectorTables({ "a.ts": after }, { "a.ts": scan(before) }).added).toEqual([
      { path: "a.ts", signature: "flag:key", allowed: 0, found: 1 },
      { path: "a.ts", signature: "flag:selected", allowed: 0, found: 1 },
    ]);
  });

  it.each([
    `var key = "other";`,
    `let key = "other";`,
    `const key = "other";`,
    `class key {}`,
  ])("keeps the outer key visible to defaults with a body declaration %s", (declaration) => {
    const source = `
      const key = club.presentationTemplateKey;
      function render(selected = key.startsWith("academy")) {
        ${declaration}
        use(selected);
      }
    `;
    const observed: boolean[] = [];
    new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, (value: boolean) => observed.push(value),
    );
    expect(observed).toEqual([true]);
    expect(scan(source)).toEqual({
      "read:presentationTemplateKey": 1, "flag:key": 1, "flag:selected": 1,
    });
  });

  it.each([
    [`selected = () => key.startsWith("academy")`, `selected()`, { "flag:key": 1 }],
    [`selected = { key }`, `selected.key.startsWith("academy")`, { "flag:key": 1 }],
    [
      `selected = (() => { const chosen = key.startsWith("academy"); return chosen; })()`,
      `selected`, { "flag:key": 1, "flag:chosen": 1 },
    ],
  ])("resolves value reads in parameter initializers and their closures %s", (parameter, value, flags) => {
    const source = `
      const key = club.presentationTemplateKey;
      function render(${parameter}) { function key() {} use(${value}); }
    `;
    const observed: boolean[] = [];
    new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, (value: boolean) => observed.push(value),
    );
    expect(observed).toEqual([true]);
    expect(scan(source)).toEqual({ "read:presentationTemplateKey": 1, ...flags });
  });

  it("resolves through nested parameter environments before body function bindings", () => {
    const source = `
      const key = club.presentationTemplateKey;
      function render(selected = function nested(value = key.startsWith("academy")) {
        function key() {} return value;
      }) { function key() {} use(selected()); }
    `;
    const observed: boolean[] = [];
    new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, (value: boolean) => observed.push(value),
    );
    expect(observed).toEqual([true]);
    expect(scan(source)).toEqual({
      "read:presentationTemplateKey": 1, "flag:key": 1, "flag:value": 1,
    });
  });

  it("keeps a closure's own shadow inside a parameter initializer", () => {
    const source = `
      const key = club.presentationTemplateKey;
      function render(selected = (key => ({ key }))("other")) {
        function key() {} use(selected.key.startsWith("academy"));
      }
    `;
    const observed: boolean[] = [];
    new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, (value: boolean) => observed.push(value),
    );
    expect(observed).toEqual([false]);
    expect(scan(source)).toEqual({ "read:presentationTemplateKey": 1 });
  });

  it("keeps earlier and own parameters visible despite a body function declaration", () => {
    const source = `
      const key = "other";
      function render(key = club.presentationTemplateKey, selected = key.startsWith("academy")) {
        function key() {} use(selected);
      }
    `;
    const observed: boolean[] = [];
    new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, (value: boolean) => observed.push(value),
    );
    expect(observed).toEqual([true]);
    expect(scan(source)).toEqual({
      "read:presentationTemplateKey": 1, "flag:key": 1, "flag:selected": 1,
    });
  });

  it("keeps an own parameter binding visible in its default", () => {
    const source = `
      const key = club.presentationTemplateKey;
      function render(key = key) { function key() {} use(key); }
    `;
    expect(() => new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, () => {},
    )).toThrow(ReferenceError);
    expect(scan(source)).toEqual({ "read:presentationTemplateKey": 1 });
  });

  it("resolves a destructured parameter default outside its body function binding", () => {
    const source = `
      const key = club.presentationTemplateKey;
      function render({ selected = key.startsWith("academy") } = {}) {
        function key() {} use(selected);
      }
    `;
    const observed: boolean[] = [];
    new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, (value: boolean) => observed.push(value),
    );
    expect(observed).toEqual([true]);
    expect(scan(source)).toEqual({
      "read:presentationTemplateKey": 1, "flag:key": 1, "flag:selected": 1,
    });
  });

  it("assigns from a default to the outer binding instead of a body function", () => {
    const source = `
      let key = "other";
      function render(selected = (key = club.presentationTemplateKey)) {
        function key() {} use(typeof key);
      }
      render();
      use(key);
    `;
    const observed: unknown[] = [];
    new Function("club", "use", source)(
      { presentationTemplateKey: "academy@1" }, (value: unknown) => observed.push(value),
    );
    expect(observed).toEqual(["function", "academy@1"]);
    expect(scan(source)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 2 });
  });

  it("keeps body function derivation out of unrelated defaults and shorthand values", () => {
    const source = `
      const key = "other";
      function render(selected = key.startsWith("academy"), copy = { key }) {
        function key() {}
        key = club.presentationTemplateKey;
        use(selected, copy.key.startsWith("academy"), key);
      }
    `;
    const observed: unknown[][] = [];
    new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, (...values: unknown[]) => observed.push(values),
    );
    expect(observed).toEqual([[false, false, "academy@1"]]);
    expect(scan(source)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 3 });
  });

  it("does not expose a body-only key when a default has no outer binding", () => {
    const source = `
      function render(selected = key.startsWith("academy")) {
        function key() {}
        key = club.presentationTemplateKey;
        use(selected, key);
      }
    `;
    expect(() => new Function("club", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, () => {},
    )).toThrow(ReferenceError);
    expect(scan(source)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 3 });
  });

  it("assigns a catch var initializer to the catch binding", () => {
    const source = `
      function render() {
        try { throw unrelated; } catch (key) {
          var key = club.presentationTemplateKey;
          if (key.startsWith("academy")) use(true);
        }
      }
    `;
    const observed: boolean[] = [];
    new Function("club", "unrelated", "use", `${source}; render();`)(
      { presentationTemplateKey: "academy@1" }, "other", (value: boolean) => observed.push(value),
    );
    expect(observed).toEqual([true]);
    expect(scan(source)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1 });
  });

  it("keeps body var derivation out of unrelated parameter defaults", () => {
    expect(scan(`
      const key = unrelated;
      function render(selected = key.startsWith("academy")) {
        var key = club.presentationTemplateKey;
        use(selected, key);
      }
    `)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1 });
  });

  it("keeps a catch var initializer out of references before and after the catch", () => {
    expect(scan(`
      function render() {
        use(key);
        try { throw unrelated; } catch (key) {
          var key = club.presentationTemplateKey;
          const selected = key.startsWith("academy");
          use(selected);
        }
        const outside = key.startsWith("academy");
        use(outside);
      }
    `)).toEqual({
      "read:presentationTemplateKey": 1, "flag:key": 1, "flag:selected": 1,
    });
  });

  it("keeps a catch shadow unrelated to a derived function var", () => {
    expect(scan(`
      function render() {
        var key = club.presentationTemplateKey;
        use(key);
        try { throw unrelated; } catch (key) {
          const selected = key.startsWith("academy");
          use(selected);
        }
        use(key);
      }
    `)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 2 });
  });

  it("counts a shorthand property's local value and respects its parameter shadow", () => {
    expect(scan(`
      const key = club.presentationTemplateKey;
      use({ key });
      function render(key) { use({ key }); }
    `)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1 });
  });

  it("tracks an identifier assignment through its resolved local binding", () => {
    expect(scan(`
      let key;
      key = club.presentationTemplateKey;
      const selected = key.startsWith("academy");
      use(selected);
      function unrelated(key) { use(key); }
    `)).toEqual({
      "read:presentationTemplateKey": 1, "flag:key": 2, "flag:selected": 1,
    });
  });

  it("resolves an identifier assignment inside a catch without deriving the outer binding", () => {
    expect(scan(`
      let key = unrelated;
      try { throw unrelated; } catch (key) {
        key = club.presentationTemplateKey;
        const selected = key.startsWith("academy");
        use(selected);
      }
      const outside = key.startsWith("academy");
      use(outside);
    `)).toEqual({
      "read:presentationTemplateKey": 1, "flag:key": 2, "flag:selected": 1,
    });
  });

  it("limits parameter destructuring aliases to their function", () => {
    expect(scan(`
      function render({ presentationTemplateKey: key }) { use(key); }
      use(key);
    `)).toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1 });
  });

  it.each([
    ["type assertion", `<string>club.presentationTemplateKey`],
    ["satisfies expression", `club.presentationTemplateKey satisfies string`],
  ])("tracks aliases wrapped in a %s", (_, expression) => {
    expect(scan(`const key = ${expression}; if (key.startsWith("academy")) use();`, "lib/example.ts"))
      .toEqual({ "read:presentationTemplateKey": 1, "flag:key": 1 });
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

function withSelectorRepository(
  run: (root: string, git: (...args: string[]) => string, save: (table: SelectorTable) => void) => void,
) {
  const root = mkdtempSync(resolve(tmpdir(), "onzio-selector-regression-"));
  const git = (...args: string[]) => execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const save = (table: SelectorTable) => {
    mkdirSync(resolve(root, "tests/architecture"), { recursive: true });
    writeFileSync(resolve(root, ALLOWLIST_PATH), canonicalSelectorJson(table));
    git("add", ".");
    git("commit", "-m", "record selector inventory");
  };
  try {
    git("init");
    git("config", "user.name", "Selector Test");
    git("config", "user.email", "selector@example.invalid");
    git("commit", "--allow-empty", "-m", "before selector guard");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    run(root, git, save);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

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

describe("committed selector baseline", () => {
  const large: SelectorTable = { "a.ts": { "literal:academy@1": 3 } };
  const small: SelectorTable = { "a.ts": { "literal:academy@1": 1 } };

  it("allows first introduction only while current main has no inventory", () => {
    withSelectorRepository((root, _, save) => {
      save(large);
      expect(readBaselineSelectorAllowlist(root, ALLOWLIST_PATH)).toBeNull();
    });
  });

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
