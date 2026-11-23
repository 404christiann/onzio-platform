import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { homepageDraft } from "../fixtures/homepage-editor";
import { defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, resolveEditTarget } from "@/lib/admin-edit-targets";
import type { HomepageDraft } from "@/lib/homepage-editor/model";
import { applyEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
import { HOMEPAGE_PARTS, type PartId } from "@/components/admin/homepage/homepage-parts";
import HomepagePartFields, { type HomepagePartEditor } from "@/components/admin/homepage/HomepagePartFields";
import { HOMEPAGE_TARGETS, homepagePreviewStamps, priceRowTarget } from "@/components/admin/homepage/homepage-edit-targets";

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ storeEnabled: true }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const draft = (): HomepageDraft => {
  const revamp = defaultCinematicHomepageContent();
  revamp.prices.rows = [
    { id: "general", label: "General Seats", price: "$5", description: "No bad view", note: "", accent: "aqua" },
    { id: "tennis", label: "Tennis Ball Throw", price: "$5", description: "Closest ball wins", note: "Each ball", accent: "lime" },
  ];
  return { ...homepageDraft(), revamp };
};
const editor = (value: HomepageDraft): HomepagePartEditor => ({
  draft: value, disabled: false, maxPhotos: 7, programs: [], photoCaptionEditable: false, videoSourceSet: true,
  field: () => undefined, setRevamp: () => undefined, setPhotos: () => undefined, updatePhoto: () => undefined, removePhoto: () => undefined,
  retryPhoto: () => undefined, addPhotos: () => undefined, replaceArtwork: () => undefined, retryArtwork: () => undefined,
});
const stampedIn = (part: PartId, value = draft()) => {
  const markup = renderToStaticMarkup(createElement(HomepagePartFields, { part, e: editor(value) }));
  return [...markup.matchAll(new RegExp(`${EDIT_TARGET_ATTRIBUTE}="([^"]+)"`, "g"))].map(match => match[1]);
};

describe("Homepage Overview: every declared field has its control in the dialog", () => {
  const sections = EDIT_TARGET_REGISTRY.homepage.sections;

  it("the registry's sections are Overview parts", () => {
    const parts = new Set(HOMEPAGE_PARTS.map(part => part.id));
    for (const section of Object.keys(sections)) expect(parts.has(section as PartId)).toBe(true);
  });

  it.each(Object.keys(EDIT_TARGET_REGISTRY.homepage.sections))("%s: each single field is stamped on exactly one control", (section) => {
    const stamped = stampedIn(section as PartId);
    for (const field of sections[section].fields ?? []) {
      expect(stamped.filter(id => id === `homepage.${section}.${field}`)).toHaveLength(1);
    }
    // Nothing on the section's controls is undeclared.
    for (const id of stamped) expect(resolveEditTarget(id)?.section).toBe(section);
  });

  it("prices: every ticket option's four fields carry that row's id", () => {
    const value = draft();
    const stamped = stampedIn("prices", value);
    expect(value.revamp!.prices.rows.length).toBeGreaterThan(1);
    for (const row of value.revamp!.prices.rows) {
      for (const field of ["label", "price", "description", "note"] as const) expect(stamped).toContain(priceRowTarget(row.id, field));
    }
  });

  it("a stamp is a data attribute only: the controls keep their labels", () => {
    const markup = renderToStaticMarkup(createElement(HomepagePartFields, { part: "hero", e: editor(draft()) }));
    expect(markup).toMatch(new RegExp(`<label class="[^"]*" ${EDIT_TARGET_ATTRIBUTE}="homepage\\.hero\\.headlineLineOne"><span[^>]*>Line one</span><input`));
  });
});

/** Matches the stamp selectors by a list per node, enough to run applyEditTargetStamps without a DOM. */
class Node {
  readonly attrs = new Map<string, string>();
  parentElement: Node | null = null;
  constructor(readonly matches: string[], readonly children: Node[] = []) { for (const child of children) child.parentElement = this; }
  private *all(): Generator<Node> { for (const child of this.children) { yield child; yield* child.all(); } }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  querySelectorAll(selector: string) { return [...this.all()].filter(node => node.matches.includes(selector) || (selector === ":scope > .price-item" && node.matches.includes(".price-item") && node.parentElement === this)); }
  closest(selector: string): Node | null { return this.matches.includes(selector) ? this : this.parentElement?.closest(selector) ?? null; }
}

describe("Homepage Overview: preview stamps", () => {
  const stamps = (value: HomepageDraft) => homepagePreviewStamps(value);
  const selector = (fragment: string) => stamps(draft()).find(stamp => stamp.selector.includes(fragment))!.selector;

  it("every fixed stamp is a declared target", () => {
    for (const id of Object.values(HOMEPAGE_TARGETS)) expect(resolveEditTarget(id)).not.toBeNull();
  });

  it("maps each ticket option's price to that row's id by position, not to the first row", () => {
    const value = draft();
    const [first, second] = value.revamp!.prices.rows;
    const price = (index: number) => new Node([selector("price-item > h3 > span")]);
    const prices = [price(0), price(1)];
    const items = prices.map(span => new Node([".price-item"], [new Node([selector("price-item > h3")], [span])]));
    const card = new Node([".prices-card"], items);
    const root = new Node([], [card]);
    applyEditTargetStamps(root as unknown as ParentNode, stamps(value));
    expect(prices[0].getAttribute(EDIT_TARGET_ATTRIBUTE)).toBe(priceRowTarget(first.id, "price"));
    expect(prices[1].getAttribute(EDIT_TARGET_ATTRIBUTE)).toBe(priceRowTarget(second.id, "price"));
  });

  it("clears a stamp whose row is gone and leaves Schedule-owned text unstamped", () => {
    const value = draft();
    value.revamp!.prices.rows = value.revamp!.prices.rows.slice(0, 1);
    const orphan = new Node([selector("price-item > h3 > span")]);
    orphan.setAttribute(EDIT_TARGET_ATTRIBUTE, "homepage.prices.row:gone.price");
    const card = new Node([".prices-card"], [new Node([".price-item"]), new Node([".price-item"], [new Node([selector("price-item > h3")], [orphan])])]);
    applyEditTargetStamps(new Node([], [card]) as unknown as ParentNode, stamps(value));
    expect(orphan.getAttribute(EDIT_TARGET_ATTRIBUTE)).toBeNull();
    expect(stamps(value).some(stamp => /match-date|teams|venue:not|result/.test(stamp.selector))).toBe(false);
  });

  it("only the preview frame stamps public nodes; the public components gain nothing", () => {
    const preview = read("components/admin/homepage/HomepageOverviewPreview.tsx");
    expect(preview).toMatch(/watchEditTargetStamps\(body, homepagePreviewStamps\(draft\)\)/);
    for (const file of ["components/cinematic/CinematicHome.tsx", "components/cinematic/CinematicHero.tsx", "components/cinematic/CinematicEpisode.tsx", "components/cinematic/CinematicSponsors.tsx"]) {
      expect(read(file)).not.toMatch(/edit-target|editTarget/);
    }
  });
});

describe("Homepage Overview: clicks", () => {
  const preview = read("components/admin/homepage/HomepageOverviewPreview.tsx");
  const editorSource = read("components/admin/homepage/HomepageOverviewEditor.tsx");

  it("a pointer click passes the field under the pointer; Enter or Space (detail 0) opens the part as before", () => {
    expect(preview).toMatch(/onOpen\(button\.part, event\.currentTarget, event\.detail > 0 \? fieldUnder\(event\.currentTarget, event\.clientX, event\.clientY\)\?\.id : undefined\)/);
    expect(preview).toMatch(/const fieldUnder = \(button: HTMLElement, x: number, y: number\) => button\.parentElement \? editTargetHitAt\(button\.parentElement, x, y\) : null;/);
  });

  it("the part buttons and their names stay (the numbered fallback and verify-rc-admin's kit path)", () => {
    // UI-PREVIEW-OVERVIEW-OVERLAY-FIX moved the names into layoutPartButtons (behaviour tested in homepage-overview-editor.test.ts).
    expect(preview).toMatch(/"data-part": button\.part, "data-kit-edit": "", "aria-label": button\.label/);
    expect(preview).toMatch(/label: hidden \? `\$\{title\}\. Hidden on the page\.` : number \? `\$\{title\} \(part \$\{number\}\)` : title/);
  });

  it("the editor opens the field's own section and asks the dialog to focus it", () => {
    expect(editorSource).toMatch(/const section = resolveEditTarget\(target\)\?\.section as PartId \| undefined;\s*dialog\.switchTo\(section && parts\.some\(item => item\.id === section\) \? section : part\);\s*if \(section\) dialog\.focusField\(target\);/);
    expect(editorSource).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });

  it("the field hover is mouse-only, moved without React state, and hidden without hover", () => {
    expect(preview).toMatch(/onPointerMove: \(event: React\.PointerEvent<HTMLButtonElement>\) => \{ if \(event\.pointerType === "mouse"\) showFieldHover/);
    const css = read("components/admin/homepage/HomepageOverview.module.css");
    expect(css).toMatch(/\.fieldHover \{[^}]*outline: 2px solid hsl\(var\(--primary\)\);[^}]*pointer-events: none;/);
    expect(css).toMatch(/@media \(hover: none\) \{ \.fieldHover \{ display: none; \} \}/);
    const hover = css.split("\n").filter(line => line.includes("fieldHover")).join("\n");
    expect(hover).not.toMatch(/transition|animation|#a855f7|purple|box-shadow/);
  });
});
