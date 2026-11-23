import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NEWS_IDS, NEWS_NEW_KEY, newsCardsFixture } from "../fixtures/visitor-click-fixtures";
import { editTargetRowId } from "@/lib/admin-edit-targets";
import { NewsCards } from "@/components/admin/news/NewsCards";
import { newsOwnsTarget, newsTarget } from "@/components/admin/news/news-edit-targets";

/**
 * UI-PREVIEW-CLICK-LIST-2 (kit): NewsCards cards open the exact field clicked for an editor that passes `stamps`, and are
 * byte-identical to before for one that does not.
 */
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const noop = () => undefined;
/** CSS-module class names carry a hash of the file; the pin keeps only the readable part. */
const plain = (markup: string) => markup.replace(/_(\w+?)_[0-9a-f]{6}/g, "$1");
const cards = newsCardsFixture();
const base = { cards, shared: null, timeZone: "America/Los_Angeles", locked: false, onEdit: noop, onRemove: noop, onRestore: noop, onDiscard: noop };
const markup = (extra: Record<string, unknown> = {}) => plain(renderToStaticMarkup(createElement(NewsCards, { ...base, ...extra } as never)));

/** The markup NewsCards rendered on main before click-to-field, for the four cards in newsCardsFixture (a removed one has no preview button). */
const BASELINE = "<ul class=\"grid\" aria-label=\"Articles\" data-news-cards=\"\"><li class=\"card\" data-news-card=\"ffffffff-0000-4000-8000-000000000001\"><div class=\"previewWrap\"><div class=\"box\" aria-hidden=\"true\" inert=\"\" data-news-thumb=\"\" data-preview-mounted=\"false\"><span data-preview-placeholder=\"\" class=\"shimmer placeholder\" data-admin-shimmer=\"\" aria-hidden=\"true\"></span></div><button type=\"button\" class=\"admin-press previewButton\" tabindex=\"-1\" aria-label=\"Edit New bus line to Robinson\" data-preview-button=\"\" data-kit-edit=\"\"></button></div><div class=\"foot\"><div class=\"text\"><h2 class=\"title\"><span class=\"titleText\" title=\"New bus line to Robinson\">New bus line to Robinson</span><span class=\"dot\" data-unsaved-dot=\"\"><span class=\"sr-only\"> (unsaved edits)</span></span></h2><p class=\"meta\"><span class=\"status\" data-status=\"live\">Live</span><span class=\"category\"><i style=\"background:#3ba84b\" aria-hidden=\"true\"></i>News</span><span>Nov 10, 2026</span></p></div><div class=\"controls\"><button type=\"button\" class=\"admin-press action\" aria-label=\"Edit New bus line to Robinson article\" data-preview-edit=\"\" data-kit-edit=\"\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M7.58579 11.9142C7.21071 12.2892 7 12.7979 7 13.3284V16C7 16.5522 7.44772 17 8 17H10.6716C11.202 17 11.7107 16.7892 12.0858 16.4142L21.5858 6.91416C22.3668 6.13311 22.3668 4.86678 21.5858 4.08573L19.9142 2.41416C19.1332 1.63311 17.8668 1.63311 17.0858 2.41416L7.58579 11.9142ZM10.6716 15H9L9 13.3284L18.5 3.82837L20.1716 5.49995L10.6716 15Z\" fill=\"currentColor\"></path><path d=\"M10 3.99994C10 4.55223 9.55229 4.99995 9 4.99995H4L4 20H19V15C19 14.4477 19.4477 14 20 14C20.5523 14 21 14.4477 21 15V20C21 21.1045 20.1046 22 19 22H4C2.89543 22 2 21.1045 2 20V4.99995C2 3.89538 2.89543 2.99994 4 2.99994H9C9.55229 2.99994 10 3.44766 10 3.99994Z\" fill=\"currentColor\"></path></svg>Edit</button><button type=\"button\" tabindex=\"0\" aria-haspopup=\"menu\" id=\"base-ui-_R_6qh_\" aria-label=\"More actions for New bus line to Robinson\" class=\"admin-press iconButton\"><svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path d=\"M3.25 12C3.25 12.9665 4.0335 13.75 5 13.75C5.9665 13.75 6.75 12.9665 6.75 12C6.75 11.0335 5.9665 10.25 5 10.25C4.0335 10.25 3.25 11.0335 3.25 12Z\" fill=\"currentColor\"></path><path d=\"M12 13.75C11.0335 13.75 10.25 12.9665 10.25 12C10.25 11.0335 11.0335 10.25 12 10.25C12.9665 10.25 13.75 11.0335 13.75 12C13.75 12.9665 12.9665 13.75 12 13.75Z\" fill=\"currentColor\"></path><path d=\"M19 13.75C18.0335 13.75 17.25 12.9665 17.25 12C17.25 11.0335 18.0335 10.25 19 10.25C19.9665 10.25 20.75 11.0335 20.75 12C20.75 12.9665 19.9665 13.75 19 13.75Z\" fill=\"currentColor\"></path></svg></button></div></div></li><li class=\"card\" data-removed=\"true\" data-news-card=\"ffffffff-0000-4000-8000-000000000002\"><div class=\"previewWrap\"><div class=\"box\" aria-hidden=\"true\" inert=\"\" data-news-thumb=\"\" data-preview-mounted=\"false\"><span data-preview-placeholder=\"\" class=\"shimmer placeholder\" data-admin-shimmer=\"\" aria-hidden=\"true\"></span></div></div><div class=\"foot\"><div class=\"text\"><h2 class=\"title\"><span class=\"titleText\" title=\"Fan night is back\">Fan night is back</span></h2><p class=\"meta\"><span class=\"status\" data-status=\"removed\">Removed</span><span class=\"category\"><i style=\"background:#ffa924\" aria-hidden=\"true\"></i>Community</span><span>Nov 11, 2026</span></p></div><div class=\"controls\"><button type=\"button\" class=\"admin-press action\" aria-label=\"Restore Fan night is back\">Restore</button></div></div></li><li class=\"card\" data-news-card=\"ffffffff-0000-4000-8000-000000000003\"><div class=\"previewWrap\"><div class=\"box\" aria-hidden=\"true\" inert=\"\" data-news-thumb=\"\" data-preview-mounted=\"false\"><span data-preview-placeholder=\"\" class=\"shimmer placeholder\" data-admin-shimmer=\"\" aria-hidden=\"true\"></span></div><button type=\"button\" class=\"admin-press previewButton\" tabindex=\"-1\" aria-label=\"Edit The derby preview\" data-preview-button=\"\" data-kit-edit=\"\"></button></div><div class=\"foot\"><div class=\"text\"><h2 class=\"title\"><span class=\"titleText\" title=\"The derby preview\">The derby preview</span></h2><p class=\"meta\"><span class=\"status\" data-status=\"live\">Live</span><span class=\"category\"><i style=\"background:#5361ff\" aria-hidden=\"true\"></i>Partner</span><span>Nov 12, 2026</span></p></div><div class=\"controls\"><button type=\"button\" class=\"admin-press action\" aria-label=\"Edit The derby preview article\" data-preview-edit=\"\" data-kit-edit=\"\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M7.58579 11.9142C7.21071 12.2892 7 12.7979 7 13.3284V16C7 16.5522 7.44772 17 8 17H10.6716C11.202 17 11.7107 16.7892 12.0858 16.4142L21.5858 6.91416C22.3668 6.13311 22.3668 4.86678 21.5858 4.08573L19.9142 2.41416C19.1332 1.63311 17.8668 1.63311 17.0858 2.41416L7.58579 11.9142ZM10.6716 15H9L9 13.3284L18.5 3.82837L20.1716 5.49995L10.6716 15Z\" fill=\"currentColor\"></path><path d=\"M10 3.99994C10 4.55223 9.55229 4.99995 9 4.99995H4L4 20H19V15C19 14.4477 19.4477 14 20 14C20.5523 14 21 14.4477 21 15V20C21 21.1045 20.1046 22 19 22H4C2.89543 22 2 21.1045 2 20V4.99995C2 3.89538 2.89543 2.99994 4 2.99994H9C9.55229 2.99994 10 3.44766 10 3.99994Z\" fill=\"currentColor\"></path></svg>Edit</button><button type=\"button\" tabindex=\"0\" aria-haspopup=\"menu\" id=\"base-ui-_R_6qj_\" aria-label=\"More actions for The derby preview\" class=\"admin-press iconButton\"><svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path d=\"M3.25 12C3.25 12.9665 4.0335 13.75 5 13.75C5.9665 13.75 6.75 12.9665 6.75 12C6.75 11.0335 5.9665 10.25 5 10.25C4.0335 10.25 3.25 11.0335 3.25 12Z\" fill=\"currentColor\"></path><path d=\"M12 13.75C11.0335 13.75 10.25 12.9665 10.25 12C10.25 11.0335 11.0335 10.25 12 10.25C12.9665 10.25 13.75 11.0335 13.75 12C13.75 12.9665 12.9665 13.75 12 13.75Z\" fill=\"currentColor\"></path><path d=\"M19 13.75C18.0335 13.75 17.25 12.9665 17.25 12C17.25 11.0335 18.0335 10.25 19 10.25C19.9665 10.25 20.75 11.0335 20.75 12C20.75 12.9665 19.9665 13.75 19 13.75Z\" fill=\"currentColor\"></path></svg></button></div></div></li><li class=\"card\" data-news-card=\"new-1\"><div class=\"previewWrap\"><div class=\"box\" aria-hidden=\"true\" inert=\"\" data-news-thumb=\"\" data-preview-mounted=\"false\"><span data-preview-placeholder=\"\" class=\"shimmer placeholder\" data-admin-shimmer=\"\" aria-hidden=\"true\"></span></div><button type=\"button\" class=\"admin-press previewButton\" tabindex=\"-1\" aria-label=\"Edit A brand new article\" data-preview-button=\"\" data-kit-edit=\"\"></button></div><div class=\"foot\"><div class=\"text\"><h2 class=\"title\"><span class=\"titleText\" title=\"A brand new article\">A brand new article</span></h2><p class=\"meta\"><span class=\"status\" data-status=\"new\">Not saved yet</span><span class=\"category\"><i style=\"background:#3ba84b\" aria-hidden=\"true\"></i>News</span><span>Nov 21, 2026</span></p></div><div class=\"controls\"><button type=\"button\" class=\"admin-press action\" aria-label=\"Edit A brand new article article\" data-preview-edit=\"\" data-kit-edit=\"\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M7.58579 11.9142C7.21071 12.2892 7 12.7979 7 13.3284V16C7 16.5522 7.44772 17 8 17H10.6716C11.202 17 11.7107 16.7892 12.0858 16.4142L21.5858 6.91416C22.3668 6.13311 22.3668 4.86678 21.5858 4.08573L19.9142 2.41416C19.1332 1.63311 17.8668 1.63311 17.0858 2.41416L7.58579 11.9142ZM10.6716 15H9L9 13.3284L18.5 3.82837L20.1716 5.49995L10.6716 15Z\" fill=\"currentColor\"></path><path d=\"M10 3.99994C10 4.55223 9.55229 4.99995 9 4.99995H4L4 20H19V15C19 14.4477 19.4477 14 20 14C20.5523 14 21 14.4477 21 15V20C21 21.1045 20.1046 22 19 22H4C2.89543 22 2 21.1045 2 20V4.99995C2 3.89538 2.89543 2.99994 4 2.99994H9C9.55229 2.99994 10 3.44766 10 3.99994Z\" fill=\"currentColor\"></path></svg>Edit</button><button type=\"button\" tabindex=\"0\" aria-haspopup=\"menu\" id=\"base-ui-_R_6qk_\" aria-label=\"More actions for A brand new article\" class=\"admin-press iconButton\"><svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path d=\"M3.25 12C3.25 12.9665 4.0335 13.75 5 13.75C5.9665 13.75 6.75 12.9665 6.75 12C6.75 11.0335 5.9665 10.25 5 10.25C4.0335 10.25 3.25 11.0335 3.25 12Z\" fill=\"currentColor\"></path><path d=\"M12 13.75C11.0335 13.75 10.25 12.9665 10.25 12C10.25 11.0335 11.0335 10.25 12 10.25C12.9665 10.25 13.75 11.0335 13.75 12C13.75 12.9665 12.9665 13.75 12 13.75Z\" fill=\"currentColor\"></path><path d=\"M19 13.75C18.0335 13.75 17.25 12.9665 17.25 12C17.25 11.0335 18.0335 10.25 19 10.25C19.9665 10.25 20.75 11.0335 20.75 12C20.75 12.9665 19.9665 13.75 19 13.75Z\" fill=\"currentColor\"></path></svg></button></div></div></li></ul>";

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
/** NewsCards is a plain function component (its Thumb and menu are child components), so its tree is read directly. */
const tree = (extra: Record<string, unknown> = {}) => NewsCards({ ...base, ...extra } as never) as ReactElement;
const cardOf = (root: ReactElement, key: string) => findElement(root, element => element.props["data-news-card"] === key)!;
const call = (element: ReactElement<Record<string, unknown>> | null, name: string, event: unknown) => (element!.props[name] as (event: unknown) => void)(event);

describe("NewsCards without stamps", () => {
  it("renders the same markup as before click-to-field", () => {
    expect(markup()).toBe(BASELINE);
    expect(markup()).not.toContain("data-field-hover");
  });

  it("with stamps the only difference is one hidden hover outline per card that has a preview button", () => {
    const stamped = markup({ stamps: () => [] });
    expect(stamped).not.toBe(BASELINE);
    expect(stamped.match(/data-field-hover=""/g)).toHaveLength(3);
    expect(stamped.replace(/<span class="fieldHoverClip" data-field-hover-clip="" aria-hidden="true"><span class="fieldHover" data-field-hover="" hidden=""><\/span><\/span>/g, "")).toBe(BASELINE);
  });

  it("a click still calls onEdit with exactly (card, event), and every hook and name is kept", () => {
    const onEdit = vi.fn();
    const root = tree({ onEdit });
    const overlay = findElement(cardOf(root, NEWS_IDS[0]), element => element.props["data-preview-button"] !== undefined);
    const event = { currentTarget: "button", detail: 1, clientX: 5, clientY: 5 };
    call(overlay, "onClick", event);
    expect(onEdit.mock.calls[0]).toEqual([cards[0], event]);
    expect(overlay!.props["aria-label"]).toBe("Edit New bus line to Robinson");
    expect(overlay!.props.onPointerMove).toBeUndefined();
    expect(overlay!.props.onPointerLeave).toBeUndefined();
    for (const hook of [`data-news-card="${NEWS_IDS[0]}"`, "data-news-thumb", "data-preview-button", "data-preview-edit", "data-unsaved-dot", 'aria-label="Edit New bus line to Robinson article"', 'aria-label="Restore Fan night is back"']) expect(markup(), hook).toContain(hook);
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
const A = NEWS_IDS[0], B = NEWS_IDS[2];
const A_TITLE = newsTarget(A, "title"), A_COVER = newsTarget(A, "cover"), B_TITLE = newsTarget(B, "title"), NEW_TITLE = newsTarget(NEWS_NEW_KEY, "title");

describe("NewsCards with stamps: clicks", () => {
  const onEdit = vi.fn();
  const root = () => tree({ onEdit, stamps: () => [], ownsTarget: newsOwnsTarget });
  const overlay = (key: string) => findElement(cardOf(root(), key), element => element.props["data-preview-button"] !== undefined);
  const NODES = [{ id: A_TITLE, left: 0, top: 0, width: 100, height: 20 }, { id: A_COVER, left: 0, top: 30, width: 100, height: 20 }];
  const press = (key: string, detail: number, x: number, y: number, nodes = NODES) => {
    onEdit.mockClear();
    call(overlay(key), "onClick", { currentTarget: { parentElement: wrapper(nodes) }, detail, clientX: x, clientY: y });
    return onEdit.mock.calls[0];
  };

  it("a pointer click passes the field under the pointer, with the article's card", () => {
    expect(press(A, 1, 10, 10)?.[2]).toBe(A_TITLE);
    expect(press(A, 1, 10, 40)?.[2]).toBe(A_COVER);
    expect(press(A, 1, 10, 40)?.[0]).toBe(cards[0]);
  });

  it("a click on no field, and Enter or Space (detail 0), pass no target", () => {
    expect(press(A, 1, 10, 25)?.[2]).toBeUndefined();
    expect(press(A, 0, 10, 10)?.[2]).toBeUndefined();
    expect(onEdit.mock.calls[0]).toHaveLength(3);
  });

  it("a field of another article is ignored, so the card opens its own article", () => {
    expect(press(B, 1, 10, 10)?.[2]).toBeUndefined();
    expect(press(B, 1, 10, 10, [{ id: B_TITLE, left: 0, top: 0, width: 100, height: 20 }])?.[2]).toBe(B_TITLE);
    expect(press(NEWS_NEW_KEY, 1, 10, 10, [{ id: NEW_TITLE, left: 0, top: 0, width: 100, height: 20 }])?.[2]).toBe(NEW_TITLE);
    expect(press(A, 1, 10, 10, [{ id: "news.details.row:not-declared.title" as never, left: 0, top: 0, width: 100, height: 20 }])?.[2]).toBeUndefined();
    expect(press(A, 1, 10, 10, [{ id: "partners.partner.row:x.name" as never, left: 0, top: 0, width: 100, height: 20 }])?.[2]).toBeUndefined();
  });

  it("without ownsTarget every declared field in the card's own preview counts", () => {
    onEdit.mockClear();
    const open = findElement(cardOf(tree({ onEdit, stamps: () => [] }), B), element => element.props["data-preview-button"] !== undefined);
    call(open, "onClick", { currentTarget: { parentElement: wrapper([{ id: A_TITLE, left: 0, top: 0, width: 100, height: 20 }]) }, detail: 1, clientX: 10, clientY: 10 });
    expect(onEdit.mock.calls[0][2]).toBe(A_TITLE);
  });

  it("the footer Edit button never passes a target, and a removed card has no preview button to click", () => {
    onEdit.mockClear();
    const click = { currentTarget: { parentElement: wrapper([{ id: A_TITLE, left: 0, top: 0, width: 100, height: 20 }]) }, detail: 1, clientX: 10, clientY: 10 };
    call(findElement(cardOf(root(), A), element => element.props["data-preview-edit"] !== undefined), "onClick", click);
    expect(onEdit.mock.calls[0]).toHaveLength(2);
    expect(findElement(cardOf(root(), NEWS_IDS[1]), element => element.props["data-preview-button"] !== undefined)).toBeNull();
  });

  it("the hover outline is mouse-only, follows the field under the pointer and hides off a field or another article's field", () => {
    const button = overlay(A)!;
    const outline = { hidden: true, style: {} as Record<string, string>, dataset: {} as Record<string, string> };
    const clip = { firstElementChild: outline, getBoundingClientRect: () => ({ left: 100, top: 100 }) };
    const parent = (id: string) => ({ ...wrapper([{ id, left: 110, top: 120, width: 50, height: 10 }]), querySelector: (selector: string) => (selector.includes("> [data-field-hover]") ? outline : clip) });
    const move = (pointerType: string, x: number, y: number, id: string = A_TITLE) => call(button, "onPointerMove", { pointerType, clientX: x, clientY: y, currentTarget: { parentElement: parent(id) } });
    move("touch", 120, 125);
    move("pen", 120, 125);
    expect(outline.hidden).toBe(true);
    move("mouse", 120, 125);
    expect(outline.hidden).toBe(false);
    expect(outline.dataset.target).toBe(A_TITLE);
    expect(outline.style).toMatchObject({ left: "10px", top: "20px", width: "50px", height: "10px" });
    move("mouse", 300, 300);
    expect(outline.hidden).toBe(true);
    move("mouse", 120, 125);
    move("mouse", 120, 125, B_TITLE);
    expect(outline.hidden).toBe(true);
    expect(outline.dataset.target).toBeUndefined();
    move("mouse", 120, 125);
    call(button, "onPointerLeave", { currentTarget: { parentElement: parent(A_TITLE) } });
    expect(outline.hidden).toBe(true);
  });
});

describe("NewsCards with stamps: source pins", () => {
  const source = read("components/admin/news/NewsCards.tsx");
  const css = read("components/admin/news/NewsCards.module.css");

  it("only a pointer click (detail > 0) looks for a field, and the article guard is passed", () => {
    expect(source).toMatch(/onEdit\(card, event, event\.detail > 0 \? fieldUnder\(event\.currentTarget, card\.key, event\.clientX, event\.clientY, ownsTarget\)\?\.id : undefined\)/);
  });

  it("the footer Edit button passes the event alone", () => {
    expect(source).toMatch(/onClick=\{event => onEdit\(card, event\)\} data-preview-edit=""/);
  });

  it("each thumbnail is stamped by the shared watcher on its own scaled node, again when the stamps change, and the memo sees them", () => {
    expect(source).toMatch(/return node && near && stamps \? watchEditTargetStamps\(node, stamps\) : undefined;\s*\}, \[near, stamps\]\);/);
    expect(source).toMatch(/stamps=\{stamps\?\.\(card\.key\)\}/);
    expect(source).toMatch(/<div ref=\{scaledRef\} className=\{styles\.scaled\}/);
    expect(source).toMatch(/a\.lazy === b\.lazy && a\.stamps === b\.stamps &&/);
  });

  it("the hover outline is moved without React state, mouse only, and hidden without hover", () => {
    expect(source).toMatch(/if \(event\.pointerType === "mouse"\) showFieldHover\(/);
    expect(source).toMatch(/onPointerLeave=\{stamps \? event => hideFieldHover\(event\.currentTarget\) : undefined\}/);
    expect(css).toMatch(/\.fieldHover \{[^}]*outline: 2px solid hsl\(var\(--primary\)\);[^}]*outline-offset: 2px;[^}]*pointer-events: none;/);
    expect(css).toMatch(/@media \(hover: none\) \{ \.fieldHover \{ display: none; \} \}/);
    const hover = css.slice(css.indexOf(".fieldHoverClip"), css.indexOf(".fieldHover[hidden]") + 40);
    expect(hover).not.toMatch(/transition|animation|box-shadow/);
  });

  it("a row id is the article's id as the registry spells it", () => {
    expect(editTargetRowId(NEWS_NEW_KEY)).toBe("new-1");
    expect(newsTarget(NEWS_NEW_KEY, "cover")).toBe("news.photo.row:new-1.cover");
  });
});
