import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDIT_TARGET_ATTRIBUTE,
  EDIT_TARGET_REGISTRY,
  createEditTargets,
  editTargetProps,
  editTargetRowId,
  parseEditTarget,
  resolveEditTarget,
  type EditTargetRegistry,
} from "@/lib/admin-edit-targets";
import { EDIT_TARGET_FLASH_ATTRIBUTE, EDIT_TARGET_FLASH_MS, editTargetAt, findEditTarget, focusEditTarget, pickEditTarget } from "@/components/admin/ui/editor-kit/editTargets";
import { EditorDialogBody, useEditorDialog } from "@/components/admin/ui/editor-kit/EditorDialog";
import {
  createFocusInterruption,
  FOCUS_GIVE_UP_MS,
  FOCUS_SETTLE_MS,
  editorDialogReducer,
  initialEditorDialogState,
  stepFocusRequest,
  type EditorDialogAction,
  type FocusStepDeps,
  type FocusStepState,
} from "@/components/admin/ui/editor-kit/editorDialogFocus";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** A fixture registry: the real one starts empty and fills in as each rollout PR lands. */
const FIXTURE: EditTargetRegistry = {
  homepage: {
    route: "/admin/homepage",
    sections: {
      hero: { fields: ["lineOne", "intro"] },
      prices: { rowFields: ["price", "label"] },
    },
  },
};
const fixture = createEditTargets(FIXTURE);

describe("edit target ids", () => {
  it("parse `editor.section.field` and `editor.section.row:<id>.field`", () => {
    expect(parseEditTarget("homepage.hero.lineOne")).toEqual({ editor: "homepage", section: "hero", field: "lineOne" });
    expect(parseEditTarget("homepage.prices.row:3f2a-9_b.price")).toEqual({ editor: "homepage", section: "prices", field: "price", row: "3f2a-9_b" });
  });

  it.each(["", "homepage", "homepage.hero", "homepage.hero.line one", "Homepage.hero.lineOne", "homepage.prices.3.price", "homepage.prices.row:.price", "a.b.c.d.e"])(
    "reject %j", (id) => expect(parseEditTarget(id)).toBeNull());

  it("turn any row key into a valid row id", () => {
    expect(editTargetRowId("6b6188f0-0776-46d4-b6e3-c3f132a22323")).toBe("6b6188f0-0776-46d4-b6e3-c3f132a22323");
    expect(editTargetRowId(4)).toBe("4");
    expect(editTargetRowId("card:7 x")).toBe("card_7_x");
    expect(parseEditTarget(`homepage.prices.row:${editTargetRowId("card:7 x")}.price`)).not.toBeNull();
  });
});

describe("the registry is the only source of targets", () => {
  it("resolves a declared field to its route and dialog section", () => {
    expect(fixture.resolve("homepage.hero.lineOne")).toMatchObject({ route: "/admin/homepage", section: "hero", field: "lineOne" });
    expect(fixture.target("homepage", "prices", "price", "row-1")).toBe("homepage.prices.row:row-1.price");
  });

  it("a missing target fails: building an undeclared id throws", () => {
    expect(() => fixture.target("homepage", "hero", "lineThree")).toThrow(/Unknown edit target "homepage\.hero\.lineThree"/);
    expect(() => fixture.target("homepage", "footer", "lineOne")).toThrow(/Unknown edit target/);
    expect(() => fixture.target("shop", "hero", "lineOne")).toThrow(/Unknown edit target/);
  });

  it("keeps single fields and row fields apart", () => {
    expect(fixture.resolve("homepage.prices.price")).toBeNull();
    expect(fixture.resolve("homepage.hero.row:1.lineOne")).toBeNull();
    expect(fixture.resolve("homepage.hero.constructor")).toBeNull();
  });

  it("lists every declared single field", () => {
    expect(fixture.all()).toEqual(["homepage.hero.lineOne", "homepage.hero.intro"]);
  });

  it("stamps only a real id, under one attribute", () => {
    expect(editTargetProps(fixture.target("homepage", "hero", "intro"))).toEqual({ [EDIT_TARGET_ATTRIBUTE]: "homepage.hero.intro" });
    expect(editTargetProps(null)).toEqual({});
  });

  it("every editor in the real registry names a route and only well-formed sections and fields", () => {
    for (const [editor, spec] of Object.entries(EDIT_TARGET_REGISTRY)) {
      expect(spec.route).toMatch(/^\/admin\//);
      for (const [section, fields] of Object.entries(spec.sections)) {
        for (const field of fields.fields ?? []) expect(resolveEditTarget(`${editor}.${section}.${field}`)).not.toBeNull();
        for (const field of fields.rowFields ?? []) expect(resolveEditTarget(`${editor}.${section}.row:0.${field}`)).not.toBeNull();
      }
    }
  });
});

describe("source stamps only declared targets", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|mts)$/.test(name) ? [path] : [];
  });
  const sources = ["components", "app", "lib"].flatMap(files).map(path => ({ path, text: readFileSync(path, "utf8") }));

  it("every literal editTarget(...) call resolves in EDIT_TARGET_REGISTRY", () => {
    const unknown: string[] = [];
    for (const { path, text } of sources) {
      for (const call of text.matchAll(/\beditTarget\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"(\s*,[^)]+)?\)/g)) {
        const id = call[4] ? `${call[1]}.${call[2]}.row:0.${call[3]}` : `${call[1]}.${call[2]}.${call[3]}`;
        if (!resolveEditTarget(id)) unknown.push(`${path}: ${id}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("no hand-written data-edit-target strings (build ids with editTarget, stamp with editTargetProps)", () => {
    const offenders = sources
      .filter(({ path }) => !path.endsWith("lib/admin-edit-targets.ts"))
      .filter(({ text }) => /data-edit-target=["'{]|"data-edit-target":/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});

describe("preview click hit test", () => {
  const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
  const candidates = [
    { id: "homepage.hero.intro", rect: box(0, 0, 400, 300) },
    { id: "homepage.hero.lineOne", rect: box(20, 20, 200, 40) },
    { id: "homepage.prices.row:1.price", rect: box(500, 0, 80, 20) },
  ];

  it("picks the innermost target under the point", () => {
    expect(pickEditTarget(candidates, 30, 30)).toBe("homepage.hero.lineOne");
    expect(pickEditTarget(candidates, 300, 200)).toBe("homepage.hero.intro");
    expect(pickEditTarget(candidates, 540, 10)).toBe("homepage.prices.row:1.price");
  });

  it("falls back (null) outside every target and ignores collapsed nodes", () => {
    expect(pickEditTarget(candidates, 450, 400)).toBeNull();
    expect(pickEditTarget([{ id: "homepage.hero.intro", rect: box(10, 10, 0, 50) }], 10, 20)).toBeNull();
  });
});

describe("EditorDialog field focus", () => {
  const props = {
    open: true, onClose: () => undefined, title: "Edit homepage", labelId: "l",
    sections: [{ id: "hero", title: "Top of the page" }], activeId: "hero", onActiveChange: () => undefined,
    renderSection: () => createElement("input", { "aria-label": "Line one", ...editTargetProps(fixture.target("homepage", "hero", "lineOne")) }),
  };

  it("renders exactly the same dialog with or without a focus request", () => {
    const without = renderToStaticMarkup(createElement(EditorDialogBody, props));
    const withRequest = renderToStaticMarkup(createElement(EditorDialogBody, { ...props, focusRequest: { target: "homepage.hero.lineOne", nonce: 1 } }));
    expect(withRequest).toBe(without);
    expect(without).toContain('data-edit-target="homepage.hero.lineOne"');
  });

  it("useEditorDialog offers focusField and focusRequest beside the section API", () => {
    let api: ReturnType<typeof useEditorDialog> | null = null;
    renderToStaticMarkup(createElement(() => { api = useEditorDialog(); return null; }));
    expect(api).toMatchObject({ focusRequest: null });
    expect(typeof api!.focusField).toBe("function");
    expect(typeof api!.switchTo).toBe("function");
  });

  it("the dialog runs the tested step loop with the real DOM helpers and keeps the tab wrap", () => {
    const source = read("components/admin/ui/editor-kit/EditorDialog.tsx");
    expect(source).toMatch(/focus: \(\) => focusEditTarget\(container, requestTarget\)/);
    expect(source).toMatch(/const next = stepFocusRequest\(step, deps\);\s*step = next\.state;\s*if \(next\.outcome === "continue"\) frame = window\.requestAnimationFrame\(tick\);\s*else handledNonce\.current = requestNonce;/);
    expect(source).toMatch(/if \(!requestTarget \|\| requestNonce === handledNonce\.current \|\| loading\) return;/);
    expect(source).toMatch(/const interruption = createFocusInterruption\(\(\) => step\.focusedAt !== null\);/);
    expect(source).toMatch(/document\.addEventListener\("pointerdown", interruption\.onInput, true\);\s*document\.addEventListener\("keydown", interruption\.onInput, true\);/);
    expect(source).toMatch(/interrupted: interruption\.interrupted,/);
    expect(source).toMatch(/document\.removeEventListener\("pointerdown", interruption\.onInput, true\);\s*document\.removeEventListener\("keydown", interruption\.onInput, true\);/);
    expect(source).toMatch(/setView\("section"\);\s*setTab\("fields"\);/);
    expect(source).toMatch(/onKeyDown=\{trapTab\}/);
    expect(source).toMatch(/useReducer\(editorDialogReducer<Id>/);
  });

  it("the ring is the classic focus ring, animated only when motion is allowed", () => {
    const css = read("components/admin/ui/editor-kit/EditorDialog.module.css");
    const ring = css.slice(css.indexOf("Click-to-field"));
    expect(ring).toMatch(/outline: 2px solid hsl\(var\(--ring\)\)/);
    expect(ring).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.shell :global\(\[data-edit-target-flash=""\]\)\s*\{\s*animation:/);
    expect(ring).not.toMatch(/#a855f7|#5b21b6|purple|box-shadow|transition:\s*all/);
  });
});

describe("EditorDialog focus requests (state)", () => {
  type Id = "hero" | "prices";
  const run = (...actions: EditorDialogAction<Id>[]) => actions.reduce(editorDialogReducer<Id>, initialEditorDialogState);
  const field = "homepage.hero.lineOne";

  it("a request made with the open survives it (preview click: open, then focus)", () => {
    expect(run({ type: "open", id: "hero" }, { type: "focus", target: field }).focusRequest).toEqual({ target: field, nonce: 1 });
    expect(run({ type: "switch", id: "hero" }, { type: "focus", target: field }).focusRequest).toEqual({ target: field, nonce: 1 });
  });

  it.each([
    ["close", { type: "close" }],
    ["a plain Edit (openSection)", { type: "open", id: "hero" }],
    ["a section switch", { type: "switch", id: "prices" }],
  ] as const)("%s drops an earlier request, so it is never focused again", (_, action) => {
    const after = run({ type: "open", id: "hero" }, { type: "focus", target: field }, action as EditorDialogAction<Id>);
    expect(after.focusRequest).toBeNull();
  });

  it("close, then reopen with the normal Edit button: no request", () => {
    expect(run({ type: "open", id: "hero" }, { type: "focus", target: field }, { type: "close" }, { type: "open", id: "hero" }).focusRequest).toBeNull();
  });

  it("nonces only grow, so a new request after a clear is never mistaken for a handled one", () => {
    const after = run({ type: "open", id: "hero" }, { type: "focus", target: field }, { type: "close" }, { type: "open", id: "hero" }, { type: "focus", target: field });
    expect(after.focusRequest).toEqual({ target: field, nonce: 2 });
  });

  it("close keeps the last section showing while the dialog fades out", () => {
    expect(run({ type: "open", id: "prices" }, { type: "close" })).toMatchObject({ openId: null, lastId: "prices" });
  });
});

describe("EditorDialog focus loop (one step per frame)", () => {
  /** Drives stepFocusRequest frame by frame (16ms) against a fake field. */
  function drive(field: { mountsAt?: number; stolenAt?: number[]; interruptAt?: number }, frames = 200) {
    let t = 0;
    let mounted = false;
    let focused = false;
    const calls = { focus: 0, refocus: 0 };
    const deps: FocusStepDeps = {
      now: () => t,
      focus: () => { calls.focus += 1; if (!mounted) return false; focused = true; return true; },
      holds: () => focused,
      refocus: () => { calls.refocus += 1; focused = true; },
      interrupted: () => field.interruptAt !== undefined && t >= field.interruptAt,
    };
    let state: FocusStepState = { startedAt: 0, focusedAt: null };
    for (let frame = 0; frame < frames; frame++) {
      mounted = field.mountsAt !== undefined && t >= field.mountsAt;
      if (field.stolenAt?.includes(t)) focused = false;
      const next = stepFocusRequest(state, deps);
      state = next.state;
      if (next.outcome !== "continue") return { outcome: next.outcome, at: t, calls, state, focused };
      t += 16;
    }
    return { outcome: "continue" as const, at: t, calls, state, focused };
  }

  it("retries until the field mounts, focuses it once, then marks the request handled after the hold", () => {
    const result = drive({ mountsAt: 48 });
    expect(result.calls.focus).toBe(4);
    expect(result.state.focusedAt).toBe(48);
    expect(result.outcome).toBe("handled");
    expect(result.at - 48).toBeGreaterThan(FOCUS_SETTLE_MS);
    expect(result.at - 48).toBeLessThanOrEqual(FOCUS_SETTLE_MS + 16);
  });

  it("drops a request whose field never mounts, so it cannot linger", () => {
    const result = drive({});
    expect(result.outcome).toBe("dropped");
    expect(result.at).toBeGreaterThan(FOCUS_GIVE_UP_MS);
    expect(result.at).toBeLessThanOrEqual(FOCUS_GIVE_UP_MS + 16);
  });

  it("takes focus back when the modal's initial focus steals it during the hold", () => {
    const result = drive({ mountsAt: 0, stolenAt: [32, 96] });
    expect(result.calls.refocus).toBe(2);
    expect(result.focused).toBe(true);
    expect(result.outcome).toBe("handled");
  });

  it("does not fight the person: a click or key during the hold ends it at once", () => {
    const result = drive({ mountsAt: 0, stolenAt: [64], interruptAt: 64 });
    expect(result.outcome).toBe("handled");
    expect(result.at).toBe(64);
    expect(result.calls.refocus).toBe(0);
  });

  it("never re-focuses while focus is already on the field", () => {
    expect(drive({ mountsAt: 0 }).calls.refocus).toBe(0);
  });
});

/**
 * A minimal stand-in for the DOM, enough for the edit-target helpers (the unit project runs in node, with no DOM).
 * It answers exactly the queries the helpers make: [data-edit-target], iframe, and the focusable-control selector.
 */
type Rect = { left: number; top: number; width: number; height: number };
class FakeNode {
  readonly attrs = new Map<string, string>();
  readonly children: FakeNode[] = [];
  rect: Rect = { left: 0, top: 0, width: 0, height: 0 };
  focusable = false;
  focusCalls: unknown[] = [];
  scrolled: ScrollIntoViewOptions | null = null;
  clientWidth = 0;
  clientLeft = 0;
  clientTop = 0;
  contentDocument: FakeNode | null = null;
  body: FakeNode | null = null;
  constructor(readonly tag: string, init: Partial<Pick<FakeNode, "rect" | "focusable" | "clientWidth" | "clientLeft" | "clientTop">> & { target?: string; children?: FakeNode[] } = {}) {
    Object.assign(this, { rect: init.rect ?? this.rect, focusable: init.focusable ?? false, clientWidth: init.clientWidth ?? 0, clientLeft: init.clientLeft ?? 0, clientTop: init.clientTop ?? 0 });
    if (init.target) this.attrs.set(EDIT_TARGET_ATTRIBUTE, init.target);
    this.children.push(...(init.children ?? []));
  }
  private *all(): Generator<FakeNode> { for (const child of this.children) { yield child; yield* child.all(); } }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  getBoundingClientRect() { return this.rect; }
  querySelectorAll(selector: string) {
    const nodes = [...this.all()];
    if (selector === `[${EDIT_TARGET_ATTRIBUTE}]`) return nodes.filter(node => node.attrs.has(EDIT_TARGET_ATTRIBUTE));
    if (selector === "iframe") return nodes.filter(node => node.tag === "iframe");
    throw new Error(`FakeNode: unexpected selector ${selector}`);
  }
  matches() { return this.focusable; }
  querySelector() { return [...this.all()].find(node => node.focusable) ?? null; }
  focus(options?: FocusOptions) { this.focusCalls.push(options); }
  scrollIntoView(options: ScrollIntoViewOptions) { this.scrolled = options; }
}
const asElement = (node: FakeNode) => node as unknown as HTMLElement;
const frameOf = (doc: FakeNode, init: ConstructorParameters<typeof FakeNode>[1]) => {
  const frame = new FakeNode("iframe", init);
  const document = new FakeNode("#document", { children: [doc] });
  document.body = doc;
  frame.contentDocument = document;
  return frame;
};

describe("focusEditTarget on a stamped field", () => {
  afterEach(() => vi.useRealTimers());
  const field = () => {
    const input = new FakeNode("input", { focusable: true });
    const wrapper = new FakeNode("div", { target: "homepage.hero.lineOne", children: [new FakeNode("label"), input] });
    return { input, wrapper, container: new FakeNode("div", { children: [wrapper] }) };
  };

  it("focuses the field's control without scrolling twice, scrolls the field to the centre and rings it", () => {
    vi.useFakeTimers();
    const { input, wrapper, container } = field();
    expect(focusEditTarget(container as unknown as ParentNode, "homepage.hero.lineOne", { reducedMotion: false })).toBe(true);
    expect(input.focusCalls).toEqual([{ preventScroll: true }]);
    expect(wrapper.scrolled).toEqual({ block: "center", inline: "nearest", behavior: "smooth" });
    expect(wrapper.getAttribute(EDIT_TARGET_FLASH_ATTRIBUTE)).toBe("");
    vi.advanceTimersByTime(EDIT_TARGET_FLASH_MS);
    expect(wrapper.getAttribute(EDIT_TARGET_FLASH_ATTRIBUTE)).toBeNull();
  });

  it("under reduced motion: jumps instead of smooth scrolling and marks the ring static", () => {
    const { wrapper, container } = field();
    focusEditTarget(container as unknown as ParentNode, "homepage.hero.lineOne", { reducedMotion: true });
    expect(wrapper.scrolled?.behavior).toBe("auto");
    expect(wrapper.getAttribute(EDIT_TARGET_FLASH_ATTRIBUTE)).toBe("static");
  });

  it("focuses a stamped control itself, and reports false when the field is not there", () => {
    const input = new FakeNode("input", { focusable: true, target: "homepage.hero.intro" });
    const container = new FakeNode("div", { children: [input] });
    expect(focusEditTarget(container as unknown as ParentNode, "homepage.hero.intro", { reducedMotion: true })).toBe(true);
    expect(input.focusCalls).toHaveLength(1);
    expect(focusEditTarget(container as unknown as ParentNode, "homepage.hero.lineOne", { reducedMotion: true })).toBe(false);
  });

  it("picks the first matching field in document order", () => {
    const first = new FakeNode("div", { target: "homepage.hero.lineOne" });
    const second = new FakeNode("div", { target: "homepage.hero.lineOne" });
    const container = new FakeNode("div", { children: [new FakeNode("section", { children: [first] }), second] });
    expect(findEditTarget(container as unknown as ParentNode, "homepage.hero.lineOne")).toBe(first);
  });
});

describe("editTargetAt through a scaled preview iframe", () => {
  const resolve = fixture.resolve;
  // A 600px-wide preview document shown at about half size: the iframe's box is 301px wide at (100, 50), with a 10px border.
  const preview = () => {
    const lineOne = new FakeNode("h1", { target: "homepage.hero.lineOne", rect: { left: 200, top: 100, width: 100, height: 40 } });
    const intro = new FakeNode("p", { target: "homepage.hero.intro", rect: { left: 0, top: 0, width: 600, height: 400 } });
    const doc = new FakeNode("body", { children: [intro, lineOne] });
    const frame = frameOf(doc, { rect: { left: 100, top: 50, width: 301, height: 201 }, clientWidth: 600, clientLeft: 10, clientTop: 10 });
    return new FakeNode("div", { children: [frame] });
  };
  // scale s = 301 / 600; Line one maps to left 100 + 10s + 200s, top 50 + 10s + 100s, 100s by 40s.
  const s = 301 / 600;
  const at = (x: number, y: number) => editTargetAt(asElement(preview()), x, y, resolve);

  it("maps document coordinates by the iframe's scale and border", () => {
    expect(at(100 + 10 * s + 210 * s, 50 + 10 * s + 110 * s)).toBe("homepage.hero.lineOne");
  });

  it("does not use unscaled coordinates (where Line one would be at full size)", () => {
    expect(at(100 + 10 + 290, 50 + 10 + 130)).toBe("homepage.hero.intro");
  });

  it("offsets by the scaled iframe border (a point just left of Line one's bordered edge is not on it)", () => {
    expect(at(100 + 200 * s + 2, 50 + 10 * s + 110 * s)).toBe("homepage.hero.intro");
    expect(at(100 + 10 * s + 210 * s, 50 + 100 * s + 2)).toBe("homepage.hero.intro");
  });

  it("returns the outer declared field around the inner one, and null outside the preview", () => {
    expect(at(100 + 10 * s + 20 * s, 50 + 10 * s + 300 * s)).toBe("homepage.hero.intro");
    expect(at(20, 20)).toBeNull();
  });

  it("ignores ids the registry does not declare, even when they are innermost", () => {
    const stray = new FakeNode("span", { target: "homepage.hero.lineThree", rect: { left: 300, top: 300, width: 10, height: 10 } });
    const intro = new FakeNode("p", { target: "homepage.hero.intro", rect: { left: 0, top: 0, width: 600, height: 400 } });
    const root = new FakeNode("div", { children: [intro, stray] });
    expect(editTargetAt(asElement(root), 305, 305, resolve)).toBe("homepage.hero.intro");
    expect(editTargetAt(asElement(new FakeNode("div", { children: [stray] })), 305, 305, resolve)).toBeNull();
  });
});

describe("the person's click or key ends the focus hold", () => {
  it("counts input only once the field has focus", () => {
    let focused = false;
    const interruption = createFocusInterruption(() => focused);
    interruption.onInput();
    expect(interruption.interrupted()).toBe(false);
    focused = true;
    interruption.onInput();
    expect(interruption.interrupted()).toBe(true);
  });
});
