import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { editTarget } from "@/lib/admin-edit-targets";
import { PreviewCards } from "@/components/admin/ui/editor-kit/PreviewCards";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";

/**
 * UI-PREVIEW-CLICK-VISITOR-1 (kit): PreviewCards cards open the exact field clicked for an editor that passes `stamps`,
 * and are byte-identical to before for every editor that does not.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const noop = () => undefined;
/** CSS-module class names carry a hash of the file; the pin keeps only the readable part. */
const plain = (markup: string) => markup.replace(/_(\w+?)_[0-9a-f]{6}/g, "$1");
const sections = [
  { id: "a", title: "Alpha", summary: "s", visible: true, onVisibleChange: noop, changed: true },
  { id: "b", title: "Beta", summary: "s" },
];
const renderPreview = (id: string) => createElement("p", null, id);
const markup = (extra: Record<string, unknown> = {}) => plain(renderToStaticMarkup(createElement(PreviewCards, { sections, lazy: false, renderPreview, onEdit: noop, ...extra })));

/** The markup PreviewCards rendered on main before click-to-field, for the two cards above. */
const BASELINE = "<ul class=\"grid\" aria-label=\"Page sections\" data-preview-cards=\"\"><li class=\"card\" data-preview-card=\"a\"><div class=\"previewWrap\"><div class=\"box\" aria-hidden=\"true\" inert=\"\" data-preview-box=\"\" data-preview-mounted=\"true\"><span data-preview-placeholder=\"\" class=\"shimmer placeholder\" data-admin-shimmer=\"\" aria-hidden=\"true\"></span><div class=\"scaled\" style=\"--preview-width:780px;--preview-scale:0.4\"><p>a</p></div></div><button type=\"button\" class=\"admin-press previewButton\" aria-label=\"Edit Alpha\" tabindex=\"-1\" data-preview-button=\"\" data-kit-edit=\"\"></button></div><div class=\"foot\"><h2 class=\"title\"><span class=\"titleText\">Alpha</span><span class=\"dot\" title=\"Unsaved edits\" data-unsaved-dot=\"\"><span class=\"sr-only\"> (unsaved edits)</span></span></h2><div class=\"controls\"><span class=\"visibility\"><span class=\"visibilityText\" aria-hidden=\"true\">Shown</span><span class=\"control\"><button type=\"button\" role=\"switch\" class=\"track\" aria-label=\"Show Alpha on the page\" aria-checked=\"true\"><span class=\"thumb\" aria-hidden=\"true\"></span></button></span></span><button type=\"button\" class=\"admin-press edit\" aria-label=\"Edit Alpha section\" data-preview-edit=\"\" data-kit-edit=\"\">Edit</button></div></div></li><li class=\"card\" data-preview-card=\"b\"><div class=\"previewWrap\"><div class=\"box\" aria-hidden=\"true\" inert=\"\" data-preview-box=\"\" data-preview-mounted=\"true\"><span data-preview-placeholder=\"\" class=\"shimmer placeholder\" data-admin-shimmer=\"\" aria-hidden=\"true\"></span><div class=\"scaled\" style=\"--preview-width:780px;--preview-scale:0.4\"><p>b</p></div></div><button type=\"button\" class=\"admin-press previewButton\" aria-label=\"Edit Beta\" tabindex=\"-1\" data-preview-button=\"\" data-kit-edit=\"\"></button></div><div class=\"foot\"><h2 class=\"title\"><span class=\"titleText\">Beta</span></h2><div class=\"controls\"><span class=\"chip\" data-always-shown=\"\">Always shown</span><button type=\"button\" class=\"admin-press edit\" aria-label=\"Edit Beta section\" data-preview-edit=\"\" data-kit-edit=\"\">Edit</button></div></div></li></ul>";

function findElement(node: ReactNode, match: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) { const found = findElement(child, match); if (found) return found; }
    return null;
  }
  const element = node as ReactElement<Record<string, unknown>>;
  if (match(element)) return element;
  return findElement((element.props as { children?: ReactNode })?.children, match);
}
const call = (element: ReactElement<Record<string, unknown>> | null, name: string, event: unknown) => (element!.props[name] as (event: unknown) => void)(event);

describe("PreviewCards without stamps", () => {
  it("renders the same markup as before click-to-field", () => {
    expect(markup()).toBe(BASELINE);
    expect(markup()).not.toContain("data-field-hover");
  });

  it("with stamps the only difference is one hidden hover outline per card", () => {
    const stamped = markup({ stamps: () => [] });
    expect(stamped).not.toBe(BASELINE);
    expect(stamped.match(/data-field-hover=""/g)).toHaveLength(2);
    expect(stamped.replace(/<span class="fieldHoverClip" data-field-hover-clip="" aria-hidden="true"><span class="fieldHover" data-field-hover="" hidden=""><\/span><\/span>/g, "")).toBe(BASELINE);
  });

  it("a click still calls onEdit with exactly (id, event), and the buttons keep their names and attributes", () => {
    const onEdit = vi.fn();
    const tree = PreviewCards({ sections, lazy: false, renderPreview, onEdit }) as ReactElement;
    const overlay = findElement(tree, element => element.props["data-preview-button"] !== undefined);
    const event = { currentTarget: "button", detail: 1, clientX: 5, clientY: 5 };
    call(overlay, "onClick", event);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0]).toEqual(["a", event]);
    expect(overlay!.props["aria-label"]).toBe("Edit Alpha");
    expect(overlay!.props.onPointerMove).toBeUndefined();
  });
});

/** A card preview's wrapper as the hit test sees it: stamped nodes with boxes, no iframes. */
function wrapper(nodes: { id: string; left: number; top: number; width: number; height: number }[]) {
  return {
    querySelectorAll: (selector: string) => selector === "iframe" ? [] : nodes.map(node => ({
      getAttribute: (name: string) => name === "data-edit-target" ? node.id : null,
      getBoundingClientRect: () => ({ left: node.left, top: node.top, width: node.width, height: node.height }),
    })),
  };
}
const TITLE = editTarget("robinson", "heading", "title");
const SUBTITLE = editTarget("robinson", "heading", "subtitle");
const CAPTION = editTarget("robinson", "seating", "caption");

describe("PreviewCards with stamps: clicks", () => {
  const onEdit = vi.fn();
  const tree = () => PreviewCards({
    sections: [{ id: "heading", title: "Page heading" }, { id: "seating", title: "Seating map" }], lazy: false, renderPreview, onEdit,
    stamps: () => [],
  }) as ReactElement;
  const overlay = (label: string) => findElement(tree(), element => element.props["data-preview-button"] !== undefined && element.props["aria-label"] === label);
  const press = (label: string, detail: number, x: number, y: number, nodes = [{ id: TITLE, left: 0, top: 0, width: 100, height: 20 }, { id: SUBTITLE, left: 0, top: 30, width: 100, height: 20 }]) => {
    onEdit.mockClear();
    call(overlay(label), "onClick", { currentTarget: { parentElement: wrapper(nodes) }, detail, clientX: x, clientY: y });
    return onEdit.mock.calls[0];
  };

  it("a pointer click passes the field under the pointer", () => {
    expect(press("Edit Page heading", 1, 10, 10)?.[2]).toBe(TITLE);
    expect(press("Edit Page heading", 1, 10, 40)?.[2]).toBe(SUBTITLE);
  });

  it("a click on no field, and Enter or Space (detail 0), pass no target", () => {
    expect(press("Edit Page heading", 1, 10, 25)?.[2]).toBeUndefined();
    expect(press("Edit Page heading", 0, 10, 10)?.[2]).toBeUndefined();
    expect(onEdit.mock.calls[0]).toHaveLength(3);
  });

  it("a field of another section is ignored, so the card opens its own section", () => {
    expect(press("Edit Seating map", 1, 10, 10)?.[2]).toBeUndefined();
    expect(press("Edit Seating map", 1, 10, 10, [{ id: CAPTION, left: 0, top: 0, width: 100, height: 20 }])?.[2]).toBe(CAPTION);
  });

  it("ownsTarget replaces the section rule for a card whose id cannot be a registry section (page:partners)", () => {
    onEdit.mockClear();
    const owned = PreviewCards({ sections: [{ id: "page:partners", title: "Club Partners page" }], lazy: false, renderPreview, onEdit, stamps: () => [], ownsTarget: (id, target) => id === "page:partners" && target.section === "heading" }) as ReactElement;
    const button = findElement(owned, element => element.props["data-preview-button"] !== undefined);
    call(button, "onClick", { currentTarget: { parentElement: wrapper([{ id: TITLE, left: 0, top: 0, width: 100, height: 20 }]) }, detail: 1, clientX: 10, clientY: 10 });
    expect(onEdit.mock.calls[0][2]).toBe(TITLE);
    onEdit.mockClear();
    call(button, "onClick", { currentTarget: { parentElement: wrapper([{ id: CAPTION, left: 0, top: 0, width: 100, height: 20 }]) }, detail: 1, clientX: 10, clientY: 10 });
    expect(onEdit.mock.calls[0][2]).toBeUndefined();
  });

  it("the footer Edit button never passes a target", () => {
    onEdit.mockClear();
    const footer = findElement(tree(), element => element.props["data-preview-edit"] !== undefined);
    call(footer, "onClick", { currentTarget: { parentElement: wrapper([{ id: TITLE, left: 0, top: 0, width: 100, height: 20 }]) }, detail: 1, clientX: 10, clientY: 10 });
    expect(onEdit.mock.calls[0]).toHaveLength(2);
  });

  it("the hover outline is mouse-only", () => {
    const button = overlay("Edit Page heading")!;
    const outline = { hidden: true, style: {} as Record<string, string>, dataset: {} as Record<string, string> };
    const clip = { firstElementChild: outline, getBoundingClientRect: () => ({ left: 100, top: 100 }) };
    const parent = { ...wrapper([{ id: TITLE, left: 110, top: 120, width: 50, height: 10 }]), querySelector: () => clip };
    const move = (pointerType: string, x: number, y: number) => call(button, "onPointerMove", { pointerType, clientX: x, clientY: y, currentTarget: { parentElement: parent } });
    move("touch", 120, 125);
    expect(outline.hidden).toBe(true);
    move("mouse", 120, 125);
    expect(outline.hidden).toBe(false);
    expect(outline.dataset.target).toBe(TITLE);
    expect(outline.style).toMatchObject({ left: "10px", top: "20px", width: "50px", height: "10px" });
    move("mouse", 300, 300);
    expect(outline.hidden).toBe(true);
    expect(outline.dataset.target).toBeUndefined();
  });
});

describe("PreviewCards with stamps: source pins", () => {
  const source = read("components/admin/ui/editor-kit/PreviewCards.tsx");
  const css = read("components/admin/ui/editor-kit/PreviewCards.module.css");

  it("only a pointer click (detail > 0) looks for a field, and the section guard stays", () => {
    expect(source).toMatch(/onEdit\(section\.id, event, event\.detail > 0 \? fieldUnder\(event\.currentTarget, section\.id, event\.clientX, event\.clientY, ownsTarget\)\?\.id : undefined\)/);
    expect(source).toMatch(/return hit && target && \(ownsTarget \? ownsTarget\(sectionId, target\) : target\.section === sectionId\) \? hit : null;/);
  });

  it("the footer Edit button passes the event alone", () => {
    expect(source).toMatch(/onClick=\{\(event\) => onEdit\(section\.id, event\)\}\s*data-preview-edit=""/);
  });

  it("each preview is stamped by the shared watcher on its own scaled node, again when the stamps change", () => {
    expect(source).toMatch(/return node && near && stamps \? watchEditTargetStamps\(node, stamps\) : undefined;\s*\}, \[near, stamps\]\);/);
    expect(source).toMatch(/stamps=\{stamps\?\.\(section\.id\)\}/);
  });

  it("the hover outline is moved without React state, mouse only, and hidden without hover", () => {
    expect(source).toMatch(/if \(event\.pointerType === "mouse"\) showFieldHover\(/);
    expect(css).toMatch(/\.fieldHover \{[^}]*outline: 2px solid hsl\(var\(--primary\)\);[^}]*outline-offset: 2px;[^}]*pointer-events: none;/);
    expect(css).toMatch(/@media \(hover: none\) \{\s*\.fieldHover \{\s*display: none;/);
    const hover = css.slice(css.indexOf(".fieldHoverClip"), css.indexOf(".foot {"));
    expect(hover).not.toMatch(/transition|animation|box-shadow/);
  });

  it("existing hooks other tools rely on are untouched", () => {
    for (const hook of ['data-preview-button=""', 'data-preview-edit=""', "KIT_EDIT_PROPS", "aria-label={`Edit ${section.title}`}", "aria-label={`Edit ${section.title} section`}"]) expect(source).toContain(hook);
  });
});
