import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { editTarget, editTargetRowId, resolveEditTarget } from "@/lib/admin-edit-targets";
import { ItemPreviewCards } from "@/components/admin/list-cards/ItemPreviewCards";

/**
 * UI-PREVIEW-CLICK-LIST-1 (kit): ItemPreviewCards cards open the exact field clicked for an editor that passes `stamps`,
 * and are byte-identical to before for every editor that does not (News, Sponsors and any other list page).
 */
/** ItemPreviewCards calls useId, so reading its element tree directly (as the kit's PreviewCards test does) needs a stand-in outside a render. */
const direct = vi.hoisted(() => ({ on: false }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useId: () => (direct.on ? ":r0:" : actual.useId()) };
});
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const noop = () => undefined;
/** CSS-module class names carry a hash of the file; the pin keeps only the readable part. */
const plain = (markup: string) => markup.replace(/_(\w+?)_[0-9a-f]{6}/g, "$1");
const items = [{ id: "a", label: "Alpha", changed: true, flags: [{ text: "Name needed", tone: "needed" as const }] }, { id: "b", label: "Beta" }];
const renderPreview = (id: string) => createElement("p", null, id);
const base = { items, lazy: false, renderPreview, onEdit: noop, onMove: noop, noun: "partner", label: "Partners", disabled: false, add: { label: "Add partner", count: "2 of 9", disabled: false, onAdd: noop, hint: "A hint" } };
const markup = (extra: Record<string, unknown> = {}) => plain(renderToStaticMarkup(createElement(ItemPreviewCards, { ...base, ...extra })));

/** The markup ItemPreviewCards rendered on main before click-to-field, for the two cards above. */
const BASELINE = "<ul class=\"grid\" aria-label=\"Partners\" data-item-cards=\"\"><li class=\"card\" data-item-card=\"a\"><div class=\"previewWrap\"><div class=\"box\" aria-hidden=\"true\" inert=\"\" data-preview-box=\"\" data-preview-mounted=\"true\"><span data-preview-placeholder=\"\" class=\"shimmer placeholder\" data-admin-shimmer=\"\" aria-hidden=\"true\"></span><div class=\"scaled\" style=\"--preview-scale:0.72\"><p>a</p></div></div><button type=\"button\" class=\"admin-press previewButton\" aria-label=\"Edit Alpha\" tabindex=\"-1\" data-preview-button=\"\" data-kit-edit=\"\"></button></div><div class=\"foot\"><span class=\"number\"><span>#1</span><span class=\"dot\" title=\"Unsaved edits\" data-unsaved-dot=\"\"><span class=\"sr-only\"> (unsaved edits)</span></span><span class=\"flag\" data-tone=\"needed\">Name needed</span></span><span class=\"controls\"><button type=\"button\" class=\"admin-press icon\" aria-label=\"Move Alpha earlier\" data-move=\"a:-1\" disabled=\"\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path d=\"M18.5435 15.4548L12.0027 8.91409L5.46199 15.4548C5.41317 15.5036 5.36057 15.5464 5.30512 15.583C4.91696 15.8393 4.38948 15.7965 4.04778 15.4548C3.8037 15.2108 3.71217 14.8719 3.77319 14.5567C3.8098 14.3676 3.90133 14.1871 4.04778 14.0406L11.2956 6.79277C11.4832 6.60523 11.7375 6.49988 12.0027 6.49988C12.2679 6.49988 12.5223 6.60523 12.7098 6.79277L19.9577 14.0406C20.3482 14.4311 20.3482 15.0643 19.9577 15.4548C19.5672 15.8454 18.934 15.8454 18.5435 15.4548Z\" fill=\"currentColor\"></path></svg></button><button type=\"button\" class=\"admin-press icon\" aria-label=\"Move Alpha later\" data-move=\"a:1\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path d=\"M5.46394 8.54509L12.0047 15.0858L18.5454 8.54509C18.9359 8.15457 19.5691 8.15457 19.9596 8.54509C20.3501 8.93562 20.3501 9.56878 19.9596 9.9593L12.7118 17.2071C12.5242 17.3947 12.2699 17.5 12.0047 17.5C11.7395 17.5 11.4851 17.3947 11.2976 17.2071L4.04973 9.9593C4.00091 9.91049 3.9582 9.85788 3.92159 9.80243C3.66531 9.41428 3.70802 8.8868 4.04973 8.54509C4.44025 8.15457 5.07342 8.15457 5.46394 8.54509Z\" fill=\"currentColor\"></path></svg></button><button type=\"button\" class=\"admin-press edit\" aria-label=\"Edit Alpha partner\" data-preview-edit=\"\" data-kit-edit=\"\">Edit</button></span></div></li><li class=\"card\" data-item-card=\"b\"><div class=\"previewWrap\"><div class=\"box\" aria-hidden=\"true\" inert=\"\" data-preview-box=\"\" data-preview-mounted=\"true\"><span data-preview-placeholder=\"\" class=\"shimmer placeholder\" data-admin-shimmer=\"\" aria-hidden=\"true\"></span><div class=\"scaled\" style=\"--preview-scale:0.72\"><p>b</p></div></div><button type=\"button\" class=\"admin-press previewButton\" aria-label=\"Edit Beta\" tabindex=\"-1\" data-preview-button=\"\" data-kit-edit=\"\"></button></div><div class=\"foot\"><span class=\"number\"><span>#2</span></span><span class=\"controls\"><button type=\"button\" class=\"admin-press icon\" aria-label=\"Move Beta earlier\" data-move=\"b:-1\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path d=\"M18.5435 15.4548L12.0027 8.91409L5.46199 15.4548C5.41317 15.5036 5.36057 15.5464 5.30512 15.583C4.91696 15.8393 4.38948 15.7965 4.04778 15.4548C3.8037 15.2108 3.71217 14.8719 3.77319 14.5567C3.8098 14.3676 3.90133 14.1871 4.04778 14.0406L11.2956 6.79277C11.4832 6.60523 11.7375 6.49988 12.0027 6.49988C12.2679 6.49988 12.5223 6.60523 12.7098 6.79277L19.9577 14.0406C20.3482 14.4311 20.3482 15.0643 19.9577 15.4548C19.5672 15.8454 18.934 15.8454 18.5435 15.4548Z\" fill=\"currentColor\"></path></svg></button><button type=\"button\" class=\"admin-press icon\" aria-label=\"Move Beta later\" data-move=\"b:1\" disabled=\"\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path d=\"M5.46394 8.54509L12.0047 15.0858L18.5454 8.54509C18.9359 8.15457 19.5691 8.15457 19.9596 8.54509C20.3501 8.93562 20.3501 9.56878 19.9596 9.9593L12.7118 17.2071C12.5242 17.3947 12.2699 17.5 12.0047 17.5C11.7395 17.5 11.4851 17.3947 11.2976 17.2071L4.04973 9.9593C4.00091 9.91049 3.9582 9.85788 3.92159 9.80243C3.66531 9.41428 3.70802 8.8868 4.04973 8.54509C4.44025 8.15457 5.07342 8.15457 5.46394 8.54509Z\" fill=\"currentColor\"></path></svg></button><button type=\"button\" class=\"admin-press edit\" aria-label=\"Edit Beta partner\" data-preview-edit=\"\" data-kit-edit=\"\">Edit</button></span></div></li><li class=\"addItem\"><button type=\"button\" class=\"admin-press add\" aria-describedby=\"_R_0_\" data-add-item=\"\"><svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path d=\"M11.0019 20C11.0019 20.5523 11.4497 21 12.0019 21C12.5542 21 13.0019 20.5523 13.0019 20L13.0019 12.9999L20.0019 12.9999C20.5542 12.9999 21.0019 12.5522 21.0019 11.9999C21.0019 11.4476 20.5542 10.9999 20.0019 10.9999H13.0019L13.0019 4C13.0019 3.44772 12.5542 3 12.0019 3C11.4497 3 11.0019 3.44772 11.0019 4V10.9999H4.00195C3.44967 10.9999 3.00195 11.4476 3.00195 11.9999C3.00195 12.5522 3.44967 12.9999 4.00195 12.9999H11.0019V20Z\" fill=\"currentColor\"></path></svg><b>Add partner</b><span>2 of 9</span></button><p id=\"_R_0_\" class=\"addHint\">A hint</p></li></ul>";

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
/** The card (list item) for one id: ItemPreviewCards is a plain function component, so its tree is read directly. */
const tree = (extra: Record<string, unknown> = {}) => {
  direct.on = true;
  try { return ItemPreviewCards({ ...base, ...extra } as never) as ReactElement; } finally { direct.on = false; }
};
const cardOf = (root: ReactElement, id: string) => findElement(root, element => element.props["data-item-card"] === id)!;
const call = (element: ReactElement<Record<string, unknown>> | null, name: string, event: unknown) => (element!.props[name] as (event: unknown) => void)(event);

describe("ItemPreviewCards without stamps", () => {
  it("renders the same markup as before click-to-field", () => {
    expect(markup()).toBe(BASELINE);
    expect(markup()).not.toContain("data-field-hover");
  });

  it("with stamps the only difference is one hidden hover outline per item card", () => {
    const stamped = markup({ stamps: () => [] });
    expect(stamped).not.toBe(BASELINE);
    expect(stamped.match(/data-field-hover=""/g)).toHaveLength(2);
    expect(stamped.replace(/<span class="fieldHoverClip" data-field-hover-clip="" aria-hidden="true"><span class="fieldHover" data-field-hover="" hidden=""><\/span><\/span>/g, "")).toBe(BASELINE);
  });

  it("a click still calls onEdit with exactly (id, event), and every hook and name is kept", () => {
    const onEdit = vi.fn();
    const root = tree({ onEdit });
    const overlay = findElement(cardOf(root, "a"), element => element.props["data-preview-button"] !== undefined);
    const event = { currentTarget: "button", detail: 1, clientX: 5, clientY: 5 };
    call(overlay, "onClick", event);
    expect(onEdit.mock.calls[0]).toEqual(["a", event]);
    expect(overlay!.props["aria-label"]).toBe("Edit Alpha");
    expect(overlay!.props.onPointerMove).toBeUndefined();
    expect(overlay!.props.onPointerLeave).toBeUndefined();
    const m = markup();
    for (const hook of ['data-item-card="a"', 'data-move="a:-1"', 'data-move="b:1"', "data-add-item", 'aria-label="Move Alpha earlier"', 'aria-label="Move Beta later"', 'aria-label="Edit Alpha partner"', 'aria-label="Edit Beta"', "data-preview-edit", "data-preview-button", "data-unsaved-dot"]) expect(m, hook).toContain(hook);
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
const A_ID = "11111111-1111-4111-8111-111111111111", B_ID = "22222222-2222-4222-8222-222222222222";
const A_NAME = editTarget("partners", "partner", "name", A_ID);
const A_ROLE = editTarget("partners", "partner", "role", A_ID);
const B_NAME = editTarget("partners", "partner", "name", B_ID);
const PAGE_TITLE = editTarget("partners", "partners", "title");
/** Item "a" is partner A, item "b" partner B: a field belongs to the item whose uuid is its row. */
const owns = (itemId: string, target: { section: string; row?: string }) => target.section === "partner" && target.row === editTargetRowId(itemId === "a" ? A_ID : B_ID);

describe("ItemPreviewCards with stamps: clicks", () => {
  const onEdit = vi.fn();
  const root = () => tree({ onEdit, stamps: () => [], ownsTarget: owns });
  const overlay = (id: string) => findElement(cardOf(root(), id), element => element.props["data-preview-button"] !== undefined);
  const NODES: { id: string; left: number; top: number; width: number; height: number }[] = [{ id: A_NAME, left: 0, top: 0, width: 100, height: 20 }, { id: A_ROLE, left: 0, top: 30, width: 100, height: 20 }];
  const press = (id: string, detail: number, x: number, y: number, nodes = NODES) => {
    onEdit.mockClear();
    call(overlay(id), "onClick", { currentTarget: { parentElement: wrapper(nodes) }, detail, clientX: x, clientY: y });
    return onEdit.mock.calls[0];
  };

  it("a pointer click passes the field under the pointer", () => {
    expect(press("a", 1, 10, 10)?.[2]).toBe(A_NAME);
    expect(press("a", 1, 10, 40)?.[2]).toBe(A_ROLE);
    expect(press("a", 1, 10, 40)?.[0]).toBe("a");
  });

  it("a click on no field, and Enter or Space (detail 0), pass no target", () => {
    expect(press("a", 1, 10, 25)?.[2]).toBeUndefined();
    expect(press("a", 0, 10, 10)?.[2]).toBeUndefined();
    expect(onEdit.mock.calls[0]).toHaveLength(3);
  });

  it("a field of another item or of the page is ignored, so the card opens its own item", () => {
    expect(press("b", 1, 10, 10)?.[2]).toBeUndefined();
    expect(press("b", 1, 10, 10, [{ id: PAGE_TITLE, left: 0, top: 0, width: 100, height: 20 }])?.[2]).toBeUndefined();
    expect(press("b", 1, 10, 10, [{ id: B_NAME, left: 0, top: 0, width: 100, height: 20 }])?.[2]).toBe(B_NAME);
    expect(press("a", 1, 10, 10, [{ id: "partners.partner.row:not-declared.name", left: 0, top: 0, width: 100, height: 20 }])?.[2]).toBeUndefined();
  });

  it("without ownsTarget every declared field in the card's own preview counts", () => {
    onEdit.mockClear();
    const open = findElement(cardOf(tree({ onEdit, stamps: () => [] }), "b"), element => element.props["data-preview-button"] !== undefined);
    call(open, "onClick", { currentTarget: { parentElement: wrapper([{ id: A_NAME, left: 0, top: 0, width: 100, height: 20 }]) }, detail: 1, clientX: 10, clientY: 10 });
    expect(onEdit.mock.calls[0][2]).toBe(A_NAME);
  });

  it("the footer Edit button and the move buttons never pass a target", () => {
    onEdit.mockClear();
    const click = { currentTarget: { parentElement: wrapper([{ id: A_NAME, left: 0, top: 0, width: 100, height: 20 }]) }, detail: 1, clientX: 10, clientY: 10 };
    const footer = findElement(cardOf(root(), "a"), element => element.props["data-preview-edit"] !== undefined);
    call(footer, "onClick", click);
    expect(onEdit.mock.calls[0]).toHaveLength(2);
    const onMove = vi.fn();
    const move = findElement(cardOf(tree({ onEdit, onMove, stamps: () => [], ownsTarget: owns }), "b"), element => element.props["data-move"] === "b:-1");
    call(move, "onClick", click);
    expect(onMove.mock.calls[0]).toEqual(["b", -1]);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("the hover outline is mouse-only, follows the field under the pointer and hides off a field or an unowned field", () => {
    const button = overlay("a")!;
    const outline = { hidden: true, style: {} as Record<string, string>, dataset: {} as Record<string, string> };
    const clip = { firstElementChild: outline, getBoundingClientRect: () => ({ left: 100, top: 100 }) };
    const parent = (id: string) => ({ ...wrapper([{ id, left: 110, top: 120, width: 50, height: 10 }]), querySelector: (selector: string) => (selector.includes("> [data-field-hover]") ? outline : clip) });
    const move = (pointerType: string, x: number, y: number, id = A_NAME) => call(button, "onPointerMove", { pointerType, clientX: x, clientY: y, currentTarget: { parentElement: parent(id) } });
    move("touch", 120, 125);
    expect(outline.hidden).toBe(true);
    move("mouse", 120, 125);
    expect(outline.hidden).toBe(false);
    expect(outline.dataset.target).toBe(A_NAME);
    expect(outline.style).toMatchObject({ left: "10px", top: "20px", width: "50px", height: "10px" });
    move("mouse", 300, 300);
    expect(outline.hidden).toBe(true);
    move("mouse", 120, 125);
    move("mouse", 120, 125, B_NAME);
    expect(outline.hidden).toBe(true);
    expect(outline.dataset.target).toBeUndefined();
    move("mouse", 120, 125);
    expect(outline.hidden).toBe(false);
    call(button, "onPointerLeave", { currentTarget: { parentElement: parent(A_NAME) } });
    expect(outline.hidden).toBe(true);
  });
});

describe("ItemPreviewCards with stamps: source pins", () => {
  const source = read("components/admin/list-cards/ItemPreviewCards.tsx");
  const css = read("components/admin/list-cards/ItemPreviewCards.module.css");

  it("only a pointer click (detail > 0) looks for a field, and the item guard stays", () => {
    expect(source).toMatch(/onEdit\(item\.id, event, event\.detail > 0 \? fieldUnder\(event\.currentTarget, item\.id, event\.clientX, event\.clientY, ownsTarget\)\?\.id : undefined\)/);
    expect(source).toMatch(/return hit && target && \(!ownsTarget \|\| ownsTarget\(itemId, target\)\) \? hit : null;/);
  });

  it("the footer Edit button passes the event alone, and the move buttons call onMove only", () => {
    expect(source).toMatch(/onClick=\{event => onEdit\(item\.id, event\)\} data-preview-edit=""/);
    expect(source).toMatch(/onClick=\{\(\) => onMove\(item\.id, -1\)\}/);
    expect(source).toMatch(/onClick=\{\(\) => onMove\(item\.id, 1\)\}/);
  });

  it("each preview is stamped by the shared watcher on its own scaled node, again when the stamps change", () => {
    expect(source).toMatch(/return node && near && stamps \? watchEditTargetStamps\(node, stamps\) : undefined;\s*\}, \[near, stamps\]\);/);
    expect(source).toMatch(/stamps=\{stamps\?\.\(item\.id\)\}/);
    expect(source).toMatch(/<div ref=\{scaledRef\} className=\{`\$\{styles\.scaled\}/);
  });

  it("the hover outline is moved without React state, mouse only, and hidden without hover", () => {
    expect(source).toMatch(/if \(event\.pointerType === "mouse"\) showFieldHover\(/);
    expect(source).toMatch(/onPointerLeave=\{stamps \? event => hideFieldHover\(event\.currentTarget\) : undefined\}/);
    expect(css).toMatch(/\.fieldHover \{[^}]*outline: 2px solid hsl\(var\(--primary\)\);[^}]*outline-offset: 2px;[^}]*pointer-events: none;/);
    expect(css).toMatch(/@media \(hover: none\) \{ \.fieldHover \{ display: none; \} \}/);
    const hover = css.slice(css.indexOf(".fieldHoverClip"), css.indexOf(".foot {"));
    expect(hover).not.toMatch(/transition|animation|box-shadow/);
  });
});

describe("the registry's list rows resolve for the kit's guard", () => {
  it("a partner field resolves to the one partner section with the uuid as its row", () => {
    expect(resolveEditTarget(A_NAME)).toMatchObject({ editor: "partners", section: "partner", row: A_ID, field: "name", route: "/admin/partners" });
  });
});
