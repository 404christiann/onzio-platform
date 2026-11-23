import { readFileSync, readdirSync } from "node:fs";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appendItem, appendRow, appendString, normalizeRows, patchAt, removeAt, removeRow, setCell, setStringAt } from "@/components/admin/ui/editor-kit/listOps";
import { createSaveLifecycle, type SaveState } from "@/components/admin/ui/useSaveState";
import {
  EditorDialogBody,
  ImageFieldWithDescription,
  ObjectListField,
  PAGE_SAVE_STATES,
  PageFrame,
  PageFrameSkeleton,
  PageSaveButton,
  PreviewCards,
  PreviewCardsSkeleton,
  SectionCards,
  SectionCardsSkeleton,
  StringListField,
  TableEditor,
  ValidationMessage,
  derivePageSaveState,
  hasUnsavedEdits,
  isPageSaveActionable,
  pageSaveAnnouncement,
  pageSaveLabel,
  reconcileKeys,
  wrapTarget,
  type PageSaveState,
} from "@/components/admin/ui/editor-kit";

vi.mock("@/components/ResilientImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));

const html = (node: ReactElement) => renderToStaticMarkup(node);
const noop = () => {};

// ---- find a prop on a rendered element tree without a DOM ----
function findElement(node: ReactNode, match: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return null;
  }
  const element = node as ReactElement<Record<string, unknown>>;
  if (match(element)) return element;
  return findElement((element.props as { children?: ReactNode })?.children, match);
}

describe("PageSaveButton: every state", () => {
  const expected: Record<PageSaveState, { label: string; disabled: boolean }> = {
    clean: { label: "Save", disabled: true },
    dirty: { label: "Save", disabled: false },
    saving: { label: "Saving…", disabled: true },
    saved: { label: "Saved", disabled: true },
    retry: { label: "Retry same save", disabled: false },
    error: { label: "Save failed. Try again", disabled: false },
    conflict: { label: "Resolve conflict", disabled: false },
  };

  it.each(PAGE_SAVE_STATES)("renders %s with its label, data-state and disabled semantics", (state) => {
    const markup = html(createElement(PageSaveButton, { state, onSave: noop }));
    expect(markup).toContain(`data-state="${state}"`);
    expect(markup).toContain(`>${expected[state].label}</span>`);
    expect(markup).toContain(`aria-disabled="${expected[state].disabled}"`);
    expect(pageSaveLabel(state)).toBe(expected[state].label);
    expect(isPageSaveActionable(state)).toBe(!expected[state].disabled);
  });

  it("draws the check only when saved and shows the ring only while saving", () => {
    for (const state of PAGE_SAVE_STATES) {
      const markup = html(createElement(PageSaveButton, { state, onSave: noop }));
      expect(markup.includes("data-page-save-check")).toBe(state === "saved");
      expect(markup.includes("data-page-save-ring")).toBe(state === "saving");
      expect(markup.includes('aria-busy="true"')).toBe(state === "saving");
    }
  });

  it("never says 'All changes saved', in any state, label or announcement", () => {
    for (const state of PAGE_SAVE_STATES) {
      const markup = html(createElement(PageSaveButton, { state, onSave: noop }));
      expect(markup.toLowerCase()).not.toContain("all changes saved");
      expect(pageSaveAnnouncement(state).toLowerCase()).not.toContain("all changes saved");
    }
  });

  it("announces saving, saved, retry, error and conflict, and stays silent for clean and dirty", () => {
    expect(pageSaveAnnouncement("clean")).toBe("");
    expect(pageSaveAnnouncement("dirty")).toBe("");
    expect(pageSaveAnnouncement("saving")).toBe("Saving…");
    expect(pageSaveAnnouncement("saved")).toBe("Saved");
    for (const state of ["retry", "error", "conflict"] as const) expect(pageSaveAnnouncement(state)).not.toBe("");
    expect(html(createElement(PageSaveButton, { state: "saved", onSave: noop }))).toContain('role="status"');
    expect(html(createElement(PageSaveButton, { state: "saved", onSave: noop, announce: false }))).not.toContain('role="status"');
  });

  function press(state: PageSaveState, handlers: { onSave?: () => void; onRetry?: () => void; onConflict?: () => void }) {
    const tree = PageSaveButton({ state, onSave: handlers.onSave ?? noop, onRetry: handlers.onRetry, onConflict: handlers.onConflict }) as ReactElement;
    const button = findElement(tree, (element) => element.type === "button");
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    (button!.props.onClick as (event: unknown) => void)(event);
    return event;
  }

  it("hands each press to the right flow", () => {
    const onSave = vi.fn();
    const onRetry = vi.fn();
    const onConflict = vi.fn();

    press("dirty", { onSave, onRetry, onConflict });
    press("error", { onSave, onRetry, onConflict });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onRetry).not.toHaveBeenCalled();

    press("retry", { onSave, onRetry, onConflict });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(2);

    press("conflict", { onSave, onRetry, onConflict });
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("falls back to onSave when no retry or conflict handler is given", () => {
    const onSave = vi.fn();
    press("retry", { onSave });
    press("conflict", { onSave });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("ignores presses while clean, saving or saved", () => {
    const onSave = vi.fn();
    const onRetry = vi.fn();
    const onConflict = vi.fn();
    for (const state of ["clean", "saving", "saved"] as const) {
      const event = press(state, { onSave, onRetry, onConflict });
      expect(event.preventDefault).toHaveBeenCalled();
    }
    expect(onSave).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    expect(onConflict).not.toHaveBeenCalled();
  });
});

describe("page save state transitions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** What the frame shows as useSaveState and a failure flag move: base from isDirty + the lifecycle phase. */
  function base(isDirty: boolean, phase: "idle" | "saving" | "saved"): SaveState {
    return phase === "saving" ? "saving" : isDirty ? "dirty" : phase === "saved" ? "saved" : "clean";
  }

  it("clean -> dirty -> saving -> saved -> clean on a successful save", async () => {
    let phase: "idle" | "saving" | "saved" = "idle";
    const lifecycle = createSaveLifecycle((next) => { phase = next; });
    const seen: PageSaveState[] = [derivePageSaveState(base(false, phase))];

    seen.push(derivePageSaveState(base(true, phase)));
    const operation = lifecycle.save(async () => {});
    seen.push(derivePageSaveState(base(true, phase)));
    await operation;
    await vi.advanceTimersByTimeAsync(400);
    seen.push(derivePageSaveState(base(false, phase)));
    await vi.advanceTimersByTimeAsync(1900);
    seen.push(derivePageSaveState(base(false, phase)));

    expect(seen).toEqual(["clean", "dirty", "saving", "saved", "clean"]);
  });

  it("a later edit leaves Saved at once", () => {
    expect(derivePageSaveState(base(true, "saved"))).toBe("dirty");
  });

  it("saving -> error -> saving -> saved: a failure shows after Saving and Save retries the draft", async () => {
    let phase: "idle" | "saving" | "saved" = "idle";
    const lifecycle = createSaveLifecycle((next) => { phase = next; });
    let failure: "error" | null = null;
    const seen: PageSaveState[] = [];

    const first = lifecycle.save(async () => { throw new Error("boom"); }).catch(() => { failure = "error"; });
    seen.push(derivePageSaveState(base(true, phase), failure));
    await vi.advanceTimersByTimeAsync(400);
    await first;
    seen.push(derivePageSaveState(base(true, phase), failure));

    failure = null;
    const second = lifecycle.save(async () => {});
    seen.push(derivePageSaveState(base(true, phase), failure));
    await second;
    await vi.advanceTimersByTimeAsync(400);
    seen.push(derivePageSaveState(base(false, phase), failure));

    expect(seen).toEqual(["saving", "error", "saving", "saved"]);
    await vi.runAllTimersAsync();
  });

  it("a running save wins over any failure, and a failure wins over dirty, clean and saved", () => {
    for (const failure of ["retry", "error", "conflict"] as const) {
      expect(derivePageSaveState("saving", failure)).toBe("saving");
      for (const state of ["clean", "dirty", "saved"] as const) expect(derivePageSaveState(state, failure)).toBe(failure);
    }
    for (const state of ["clean", "dirty", "saving", "saved"] as const) expect(derivePageSaveState(state, null)).toBe(state);
  });

  it("retry -> saving -> saved, and conflict clears to dirty or clean once the editor's flow resolves it", () => {
    expect(derivePageSaveState("dirty", "retry")).toBe("retry");
    expect(derivePageSaveState("saving", "retry")).toBe("saving");
    expect(derivePageSaveState("saved", null)).toBe("saved");
    expect(derivePageSaveState("dirty", "conflict")).toBe("conflict");
    expect(derivePageSaveState("dirty", null)).toBe("dirty"); // Load latest and keep my edits
    expect(derivePageSaveState("clean", null)).toBe("clean"); // Reload saved page
  });

  it("treats exactly dirty, retry, error and conflict as unsaved edits", () => {
    expect(PAGE_SAVE_STATES.filter(hasUnsavedEdits)).toEqual(["dirty", "retry", "error", "conflict"]);
  });
});

describe("PageFrame", () => {
  const frame = (state: PageSaveState, extra: Record<string, unknown> = {}) =>
    html(createElement(PageFrame, {
      title: "Robinson Stadium",
      breadcrumb: [{ label: "Website", href: "/admin/stadium" }],
      openPageHref: "/stadium",
      state,
      onSave: noop,
      onDiscard: noop,
      children: createElement("p", null, "content"),
      ...extra,
    }));

  it("shows the Discard changes link only while edits are unsaved", () => {
    for (const state of PAGE_SAVE_STATES) {
      expect(frame(state).includes("Discard changes")).toBe(hasUnsavedEdits(state));
    }
    expect(frame("dirty", { onDiscard: undefined })).not.toContain("Discard changes");
  });

  it("renders the breadcrumb, an Open page link to a new tab, and one Save button", () => {
    const markup = frame("dirty");
    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="/stadium"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain("Open page");
    expect(markup).toContain("(opens in a new tab)");
    expect(markup.match(/data-page-save-button/g)).toHaveLength(1);
    expect(html(createElement(PageFrame, { title: "x", state: "clean", onSave: noop, children: null }))).not.toContain("Open page");
  });

  it("puts the notice between the header and the content", () => {
    const markup = frame("conflict", { notice: createElement("div", { id: "notice" }, "Changed elsewhere") });
    expect(markup.indexOf("</header>")).toBeLessThan(markup.indexOf('id="notice"'));
    expect(markup.indexOf('id="notice"')).toBeLessThan(markup.indexOf("content"));
  });
});

describe("SectionCards", () => {
  const sections = [
    { id: "a", title: "Heading", summary: "Title and intro" },
    { id: "b", title: "Seating", summary: "3 blocks", visible: true, onVisibleChange: noop },
    { id: "c", title: "Directions", summary: "Hidden", visible: false, onVisibleChange: noop },
  ];

  it("renders one card per section in the given order with an Edit button each", () => {
    const markup = html(createElement(SectionCards, { sections, onEdit: noop }));
    expect(markup.match(/data-section-card="/g)).toHaveLength(3);
    expect(markup.indexOf('data-section-card="a"')).toBeLessThan(markup.indexOf('data-section-card="b"'));
    expect(markup.indexOf('data-section-card="b"')).toBeLessThan(markup.indexOf('data-section-card="c"'));
    for (const section of sections) expect(markup).toContain(`aria-label="Edit ${section.title}"`);
    expect(markup).toContain("Title and intro");
  });

  it("shows 'Always shown' without a visibility pair and a labelled switch with one", () => {
    const markup = html(createElement(SectionCards, { sections, onEdit: noop }));
    expect(markup.match(/data-always-shown/g)).toHaveLength(1);
    expect(markup.match(/role="switch"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Show Seating on the page"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('aria-checked="false"');
    expect(markup).toContain('data-hidden="true"');
  });

  it("treats a flag without a setter (or the reverse) as always shown", () => {
    const markup = html(createElement(SectionCards, { sections: [{ id: "x", title: "X", visible: true }, { id: "y", title: "Y", onVisibleChange: noop }], onEdit: noop }));
    expect(markup.match(/data-always-shown/g)).toHaveLength(2);
    expect(markup).not.toContain('role="switch"');
  });

  it("offers no reordering controls", () => {
    const markup = html(createElement(SectionCards, { sections, onEdit: noop }));
    expect(markup.toLowerCase()).not.toMatch(/move (up|down)|reorder|draggable/);
  });
});

describe("EditorDialog content (desktop render)", () => {
  const sections = [
    { id: "one", title: "Heading", summary: "Intro" },
    { id: "two", title: "Seating", summary: "3 blocks" },
  ];
  const body = (extra: Record<string, unknown> = {}) =>
    html(createElement(EditorDialogBody, {
      open: true,
      onClose: noop,
      title: "Edit Robinson Stadium",
      sections,
      activeId: "two",
      onActiveChange: noop,
      renderSection: (id: string) => createElement("p", { "data-fields": id }, `fields for ${id}`),
      labelId: "dlg",
      ...extra,
    }));

  it("lists the sections on the left, marks the active one, and mounts only its fields", () => {
    const markup = body();
    expect(markup).toContain('aria-label="Sections"');
    expect(markup.match(/aria-current="true"/g)).toHaveLength(1);
    expect(markup.indexOf("Seating")).toBeGreaterThan(markup.indexOf("Heading"));
    expect(markup).toContain('data-fields="two"');
    expect(markup).not.toContain('data-fields="one"');
    expect(markup).toContain('aria-labelledby="dlg-panel"');
    expect(markup).toContain('id="dlg"');
  });

  it("has Close and Done, no Back button, and says edits stay on the page", () => {
    const markup = body();
    expect(markup).toContain('aria-label="Close"');
    expect(markup).toContain("data-editor-dialog-done");
    expect(markup).not.toContain("data-editor-dialog-back");
    expect(markup).toContain("Edits stay on the page until you press Save.");
    expect(markup.toLowerCase()).not.toContain("all changes saved");
  });

  it("falls back to the first section for an unknown active id", () => {
    expect(body({ activeId: "missing" })).toContain('data-fields="one"');
  });

  it("shows the skeleton in the same body while loading, with aria-busy", () => {
    const markup = body({ loading: true });
    expect(markup).toContain("data-editor-dialog-skeleton");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain("data-fields");
  });
});

describe("ValidationMessage", () => {
  it("renders the yellow tile and maps live to the right role", () => {
    const base = html(createElement(ValidationMessage, null, "Use an https link."));
    expect(base).toContain("data-validation-tile");
    expect(base).not.toContain("role=");
    expect(html(createElement(ValidationMessage, { live: "assertive", children: "x" }))).toContain('role="alert"');
    expect(html(createElement(ValidationMessage, { live: "polite", children: "x" }))).toContain('role="status"');
  });
});

describe("field pieces", () => {
  it("StringListField names every control by item, caps adds at max and honours min", () => {
    const markup = html(createElement(StringListField, { label: "Perks", items: ["a", "b"], onChange: noop, max: 2, min: 2, itemLabel: "perk" }));
    expect(markup).toContain('aria-label="Perks, perk 1"');
    expect(markup).toContain('aria-label="Remove perk 2"');
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Add perk/);
    expect(markup).toContain("Maximum of 2 perks reached.");
    expect(markup.match(/aria-label="Remove perk \d"[^>]*disabled/g)).toHaveLength(2);
  });

  it("string list edits add, edit and remove, and respect max and min", () => {
    expect(appendString(["a", "b"], 3)).toEqual(["a", "b", ""]);
    expect(appendString(["a", "b"], 2)).toEqual(["a", "b"]);
    expect(setStringAt(["a", "b"], 1, "z")).toEqual(["a", "z"]);
    expect(removeAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    expect(removeAt(["a", "b"], 0, 2)).toEqual(["a", "b"]);
  });

  it("ObjectListField keys records by their own id and disables Add at max", () => {
    const items = [{ id: "x1", name: "One" }, { id: "x2", name: "Two" }];
    const markup = html(createElement(ObjectListField<{ id: string; name: string }>, {
      label: "Blocks",
      items,
      onChange: noop,
      max: 2,
      getId: (item) => item.id,
      createItem: () => ({ id: "new", name: "" }),
      itemLabel: "block",
      renderItem: (item) => createElement("span", null, item.name),
    }));
    expect(markup).toContain("Block 1");
    expect(markup).toContain('aria-label="Remove block 2"');
    expect(markup).toContain("Maximum of 2 blocks reached.");
    expect(markup).toMatch(/disabled[^>]*>(?:(?!<\/button>).)*Add block/);
  });

  it("object list update merges only the patch into one record and add stops at max", () => {
    const items = [{ id: "x1", name: "One", note: "n" }, { id: "x2", name: "Two", note: "m" }];
    expect(patchAt(items, 1, { name: "Changed" })).toEqual([items[0], { id: "x2", name: "Changed", note: "m" }]);
    expect(appendItem(items, { id: "n", name: "", note: "" }, 3)).toHaveLength(3);
    expect(appendItem(items, { id: "n", name: "", note: "" }, 2)).toHaveLength(2);
    expect(removeAt(items, 0)).toEqual([items[1]]);
  });

  it("TableEditor renders column headers, one input per cell, row removal and the row cap", () => {
    const markup = html(createElement(TableEditor, {
      label: "Prices",
      columns: [{ key: "a", label: "Plan" }, { key: "b", label: "Price" }, { key: "c", label: "Notes" }],
      rows: [["Adult", "$10", ""], ["Youth", "$5", ""]],
      onChange: noop,
      maxRows: 2,
      rowLabel: "price row",
    }));
    expect(markup.match(/<th scope="col">/g)).toHaveLength(4);
    expect(markup.match(/<input/g)).toHaveLength(6);
    expect(markup).toContain('aria-label="Price, price row 2"');
    expect(markup).toContain('aria-label="Remove price row 1"');
    expect(markup).toContain("Maximum of 2 price rows reached.");
    expect(markup).toContain('role="region"');
  });

  it("table edits pad short rows, cap rows and keep the column count", () => {
    expect(normalizeRows([["x"]], 2)).toEqual([["x", ""]]);
    expect(setCell([["x"]], 2, 0, 1, "y")).toEqual([["x", "y"]]);
    expect(appendRow([["a", "b"]], 2, 3)).toEqual([["a", "b"], ["", ""]]);
    expect(appendRow([["a", "b"], ["c", "d"]], 2, 2)).toHaveLength(2);
    expect(removeRow([["a", "b"], ["c", "d"]], 2, 0)).toEqual([["c", "d"]]);
    expect(removeRow([["a", "b"]], 2, 0, 1)).toEqual([["a", "b"]]);
  });

  it("ImageFieldWithDescription keeps AdminImageField and adds a described description line", () => {
    const markup = html(createElement(ImageFieldWithDescription, { label: "Bus photo", description: "Shown beside the route. Crops to 4:3.", allowedTypes: ["image/png"], maxBytes: 1048576, onUpload: async () => true }));
    expect(markup).toContain("data-admin-image-field");
    expect(markup).toContain("Shown beside the route. Crops to 4:3.");
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-describedby=');
  });

  it("reconcileKeys keeps existing keys, appends new ones and truncates", () => {
    let n = 0;
    const make = () => `n${++n}`;
    expect(reconcileKeys(["a", "b"], 2, make)).toEqual(["a", "b"]);
    expect(reconcileKeys(["a", "b"], 4, make)).toEqual(["a", "b", "n1", "n2"]);
    expect(reconcileKeys(["a", "b", "c"], 1, make)).toEqual(["a"]);
  });
});

describe("shape-matched skeletons", () => {
  it("reuse the real layout classes and hide from assistive tech", () => {
    const frame = html(createElement(PageFrameSkeleton, { cardCount: 4 }));
    const cards = html(createElement(SectionCardsSkeleton, { count: 4 }));
    expect(frame).toContain('aria-hidden="true"');
    expect(frame.match(/<li/g)).toHaveLength(4);
    expect(cards.match(/<li/g)).toHaveLength(4);
    // The same module classes as the loaded components, not a generic three-bar panel.
    const loaded = html(createElement(SectionCards, { sections: [{ id: "a", title: "A" }], onEdit: noop }));
    const liClass = /<li class="([^"]+)"/;
    expect(cards.match(liClass)?.[1]).toBe(loaded.match(liClass)?.[1]);
  });
});

describe("PreviewCards", () => {
  const sections = [
    { id: "a", title: "Heading", summary: "x", changed: true },
    { id: "b", title: "Seating", visible: true, onVisibleChange: noop },
    { id: "c", title: "Directions", visible: false, onVisibleChange: noop },
  ];
  const render = (extra: Record<string, unknown> = {}) =>
    html(createElement(PreviewCards, { sections, onEdit: noop, lazy: false, renderPreview: (id: string) => createElement("p", { "data-live": id }, `live ${id}`), ...extra }));

  it("renders a live preview per card inside an aria-hidden, inert, non-interactive box", () => {
    const markup = render();
    expect(markup.match(/data-preview-card="/g)).toHaveLength(3);
    expect(markup).toContain('data-live="a"');
    expect(markup.match(/data-preview-box=""/g)).toHaveLength(3);
    expect(markup.match(/aria-hidden="true" inert=""/g)).toHaveLength(3);
  });

  it("makes the whole preview a button named Edit <title>, and keeps a footer Edit button", () => {
    const markup = render();
    expect(markup).toContain('aria-label="Edit Seating"');
    expect(markup.match(/data-preview-button/g)).toHaveLength(3);
    expect(markup.match(/data-preview-edit/g)).toHaveLength(3);
  });

  it("shows the unsaved dot only on a changed section, the switch only with a flag and setter, else the chip", () => {
    const markup = render();
    expect(markup.match(/data-unsaved-dot/g)).toHaveLength(1);
    expect(markup).toContain("(unsaved edits)");
    expect(markup.match(/role="switch"/g)).toHaveLength(2);
    expect(markup.match(/data-always-shown/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Show Seating on the page"');
    expect(markup).toContain('data-hidden="true"');
  });

  it("wires the preview button, the footer Edit and the switch to the callbacks", () => {
    const onEdit = vi.fn();
    const onVisibleChange = vi.fn();
    const tree = PreviewCards({
      sections: [{ id: "b", title: "Seating", visible: true, onVisibleChange }],
      onEdit,
      renderPreview: () => null,
      lazy: false,
    }) as ReactElement;
    const overlay = findElement(tree, (element) => element.props["data-preview-button"] !== undefined);
    const footer = findElement(tree, (element) => element.props["data-preview-edit"] !== undefined);
    const event = { currentTarget: "button" };
    (overlay!.props.onClick as (event: unknown) => void)(event);
    (footer!.props.onClick as (event: unknown) => void)(event);
    expect(onEdit).toHaveBeenCalledTimes(2);
    expect(onEdit).toHaveBeenCalledWith("b", event);
    const toggle = findElement(tree, (element) => typeof element.props.onCheckedChange === "function");
    (toggle!.props.onCheckedChange as (value: boolean) => void)(false);
    expect(onVisibleChange).toHaveBeenCalledWith(false);
  });

  it("the skeleton reuses the card layout classes", () => {
    const skeleton = html(createElement(PreviewCardsSkeleton, { count: 3 }));
    const loaded = render();
    const liClass = /<li class="([^"]+)"/;
    expect(skeleton.match(liClass)?.[1]).toBe(loaded.match(liClass)?.[1]);
    expect(skeleton.match(/<li/g)).toHaveLength(3);
    expect(skeleton).toContain('aria-hidden="true"');
  });
});

describe("EditorDialog split mode and focus wrap", () => {
  const sections = [{ id: "one", title: "Heading" }, { id: "two", title: "Seating" }];
  it("shows the fields and the live section side by side on desktop, the preview inert", () => {
    const markup = html(createElement(EditorDialogBody, {
      open: true, onClose: noop, title: "Edit", sections, activeId: "two", onActiveChange: noop, labelId: "d",
      mode: "split", renderSection: (id: string) => createElement("p", { "data-fields": id }),
      renderPreview: (id: string) => createElement("p", { "data-live": id }),
    }));
    expect(markup).toContain('data-fields="two"');
    expect(markup).toContain('data-live="two"');
    expect(markup).toContain("data-editor-dialog-preview");
    expect(markup).toContain("How this section looks on the page");
    expect(markup).toMatch(/aria-hidden="true" inert=""[^>]*><p data-live="two"/);
    expect(markup).toContain('aria-label="Sections"');
  });

  it("stays fields-only without renderPreview", () => {
    const markup = html(createElement(EditorDialogBody, {
      open: true, onClose: noop, title: "Edit", sections, activeId: "two", onActiveChange: noop, labelId: "d",
      mode: "split", renderSection: () => null,
    }));
    expect(markup).not.toContain("data-editor-dialog-preview");
  });

  it("wraps Tab from the last control to the first and Shift+Tab from the first to the last", () => {
    const make = () => ({ contains: () => true }) as unknown as HTMLElement;
    const container = make();
    const [first, middle, last] = [make(), make(), make()];
    const list = [first, middle, last];
    expect(wrapTarget(list, last as unknown as Element, false, container)).toBe(first);
    expect(wrapTarget(list, first as unknown as Element, true, container)).toBe(last);
    expect(wrapTarget(list, middle as unknown as Element, false, container)).toBeNull();
    expect(wrapTarget(list, middle as unknown as Element, true, container)).toBeNull();
    expect(wrapTarget([], null, false, container)).toBe(container);
    const outside = { contains: () => false } as unknown as HTMLElement;
    expect(wrapTarget(list, first as unknown as Element, false, outside)).toBe(first);
  });
});

describe("PageFrame without Save", () => {
  it("renders no Save group when onSave is omitted", () => {
    const markup = html(createElement(PageFrame, { title: "All website pages", children: null }));
    expect(markup).not.toContain("data-page-save-button");
    expect(markup).not.toContain("Discard changes");
  });
});

describe("kit colours do not depend on the portal's forced --primary-foreground (white)", () => {
  const css = (name: string) => readFileSync(`components/admin/ui/editor-kit/${name}`, "utf8");
  it("sets its own ink on the Save button and Done", () => {
    expect(css("PageSaveButton.module.css")).not.toContain("--primary-foreground");
    expect(css("PageSaveButton.module.css")).toContain("--save-ink-on-green");
    expect(css("EditorDialog.module.css")).not.toContain("--primary-foreground");
  });
  it("has no opacity dimming on hidden cards, no `all` transitions and a solid phone bar", () => {
    expect(css("SectionCards.module.css")).not.toMatch(/data-hidden\][^{]*\{[^}]*opacity/);
    for (const file of ["PageSaveButton", "PageFrame", "SectionCards", "PreviewCards", "EditorDialog", "fields"]) {
      expect(css(`${file}.module.css`)).not.toMatch(/transition:\s*all|transition-property:\s*all/);
    }
    expect(css("PageFrame.module.css")).not.toContain("backdrop-filter");
  });
});

// ---- the one preview link and submit guard (UI-PREVIEW-LINK-GUARD) ----
describe("the shared preview link guard", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const GUARD = "components/admin/ui/editor-kit/previewLinkGuard.ts";
  // Every preview iframe that renders public components must install the guard on its iframe.
  const GUARDED_FRAMES = [
    "components/admin/shop/ShopPreviewFrame.tsx",
    "components/admin/shop/rose-city/ShopScaledFrame.tsx",
    "components/admin/homepage/HomepagePreviewFrame.tsx",
    "components/admin/homepage/HomepageOverviewPreview.tsx",
  ];
  // Frames that still carry their own click/submit handling and are not moved to the guard yet (About and Contact have
  // PRs in flight, Program and Tryouts route their own links). Move one over, then delete it from this list.
  const LEGACY_FRAMES = [
    "components/admin/about/AboutPageCanvas.tsx",
    "components/admin/contact/ContactPageCanvas.tsx",
    "components/admin/ProgramCanvasFrame.tsx",
    "components/admin/TryoutsPreviewFrame.tsx",
  ];

  it("lives in the kit and is exported from its index", () => {
    expect(read("components/admin/ui/editor-kit/index.ts")).toMatch(/usePreviewLinkGuard[^}]*\}\s*from "\.\/previewLinkGuard"/);
  });

  it("listens on the iframe body in the capture phase for click, auxclick and submit", () => {
    const guard = read(GUARD);
    expect(guard).toMatch(/const GUARDED_EVENTS = \["click", "auxclick", "submit"\] as const;/);
    expect(guard).toMatch(/GUARDED_EVENTS\.forEach\(type => body\.addEventListener\(type, listener, \{ capture: true \}\)\)/);
    expect(guard).toMatch(/GUARDED_EVENTS\.forEach\(type => body\.removeEventListener\(type, listener, \{ capture: true \}\)\)/);
    expect(guard).toMatch(/body = frame\.contentDocument\?\.body/);
    expect(guard).not.toMatch(/(?:document|window|doc|win|defaultView)\.addEventListener\(/);
  });

  it("cancels and halts with preventDefault + stopPropagation, never stopImmediatePropagation", () => {
    const guard = read(GUARD);
    expect(guard).toMatch(/event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
    expect(guard).not.toMatch(/stopImmediatePropagation\(\)/);
  });

  it("blocks window.open and gives it back on cleanup, and re-installs on iframe load", () => {
    const guard = read(GUARD);
    expect(guard).toMatch(/win\.open = blocked;/);
    expect(guard).toMatch(/if \(win\.open === blocked\) win\.open = original;/);
    expect(guard).toMatch(/frame\.addEventListener\("load", mount\)/);
    expect(guard).toMatch(/frame\.removeEventListener\("load", mount\)/);
  });

  it.each(GUARDED_FRAMES)("%s installs the guard on its iframe", path => {
    const source = read(path);
    expect(source).toMatch(/import \{[^}]*usePreviewLinkGuard[^}]*\} from "@\/components\/admin\/ui\/editor-kit\/previewLinkGuard";/);
    expect(source).toMatch(/usePreviewLinkGuard\((?:iframe|frame)(?:, near)?\);/);
  });

  // The pieces on the homepage are selected by a bubble-phase onClick that the guard halts for a link; the frame selects the piece first.
  it("the homepage frame selects the piece under a clicked link in the capture phase", () => {
    const frame = read("components/admin/homepage/HomepagePreviewFrame.tsx");
    expect(frame).toMatch(/if \(target\.closest\(PREVIEW_LINK_SELECTOR\)\) \{\s*const piece = target\.closest<HTMLElement>\("\[data-homepage-piece\]"\)\?\.dataset\.homepagePiece;\s*if \(piece\) preview\?\.select\(piece as PieceId\);/);
    expect(frame).toMatch(/if \(target\.closest\("button,iframe"\)\) event\.preventDefault\(\);/);
  });

  // No preview frame keeps its own link/submit guard: scan every file that renders into an iframe body.
  const frameFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? frameFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  }).filter(path => path !== GUARD);
  const previewFrames = frameFiles("components/admin").filter(path => {
    const source = read(path);
    return /createPortal\(/.test(source) && /contentDocument/.test(source);
  });

  it("finds the frames it is meant to scan", () => {
    for (const path of [...GUARDED_FRAMES, ...LEGACY_FRAMES]) expect(previewFrames, path).toContain(path);
  });

  it.each(previewFrames.filter(path => !LEGACY_FRAMES.includes(path)))("%s has no guard of its own", path => {
    const source = read(path);
    expect(source).not.toMatch(/onSubmitCapture\s*=/);
    // closest("a"), closest("a,button"), closest<HTMLElement>('a[href]') ... answered by preventDefault or stopPropagation.
    expect(source).not.toMatch(/closest(?:<[^>]*>)?\(\s*["'`](?:a|area)(?:[,\[:"'`\s])[^)]*\)[^;]{0,200}?(?:preventDefault|stopPropagation)/);
    expect(source).not.toMatch(/closest(?:<[^>]*>)?\(\s*["'`](?:a|area)(?:[,\[:"'`\s])[^)]*\)\)?\s*\{?\s*(?:event\.)?(?:preventDefault|stopPropagation)/);
  });
});
