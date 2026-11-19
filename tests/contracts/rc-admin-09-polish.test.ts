import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { emptyStadiumContent, hydrateStadiumContent, type StadiumContent } from "@/lib/stadium-content";
import { applyFoothillCrop, cropPercentLabel } from "@/components/admin/stadium/foothill-sections";
import { FoothillSectionFields, type FoothillFieldsApi } from "@/components/admin/stadium/FoothillSectionFields";
import { PreviewCards } from "@/components/admin/ui/editor-kit/PreviewCards";
import { SettledPreview } from "@/components/admin/stadium/SettledPreview";
import { DISCARD_CONFIRM } from "@/components/admin/editor-copy";
import { SCOPED_PREVIEW_ATTRIBUTES, scopePreviewIds } from "@/components/admin/ui/editor-kit/scopePreviewIds";

vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => createElement("a", props) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));

const read = (path: string) => readFileSync(path, "utf8");

describe("RC-ADMIN-09 Foothill crop decimals are display only", () => {
  const odd: StadiumContent = { ...emptyStadiumContent(), phoneMapLayout: "split", phoneMapCrop: { x: 0.040336, y: 0.27395, width: 0.5, height: 0.25 } };
  const api = (draft: StadiumContent): FoothillFieldsApi => ({
    draft, page: hydrateStadiumContent(draft, []) as unknown as FoothillFieldsApi["page"], locked: false, uploading: null,
    update: () => { throw new Error("an untouched render must not edit"); }, replace: () => { throw new Error("an untouched render must not replace"); },
    upload: async () => false, removeImage: () => undefined,
  });

  it("rounds the label to at most one decimal", () => {
    expect(cropPercentLabel(0.040336)).toBe("4");
    expect(cropPercentLabel(0.27395)).toBe("27.4");
    expect(cropPercentLabel(0.5)).toBe("50");
    expect(cropPercentLabel(0)).toBe("0");
  });

  it("renders rounded values and leaves the draft byte-identical", () => {
    const before = JSON.stringify(odd);
    const html = renderToStaticMarkup(createElement(FoothillSectionFields, { api: api(odd), id: "map" }));
    expect(html).toContain('value="4"');
    expect(html).toContain('value="27.4"');
    expect(html).not.toContain("4.0336");
    expect(html).not.toContain("27.395");
    expect(JSON.stringify(odd)).toBe(before);
  });

  it("saves exactly what the owner types, and nothing else", () => {
    const next = applyFoothillCrop(odd, "phoneMapCrop", "x", 4.05);
    expect(next?.phoneMapCrop.x).toBeCloseTo(0.0405, 10);
    expect(next?.phoneMapCrop.y).toBe(0.27395);
    expect(next?.phoneMapCrop.width).toBe(0.5);
    expect(odd.phoneMapCrop.x).toBe(0.040336);
  });
});

describe("RC-ADMIN-09 preview placeholder", () => {
  const cards = (lazy: boolean, wrap: boolean) => renderToStaticMarkup(createElement(PreviewCards, {
    sections: [{ id: "a", title: "A", visible: true, onVisibleChange: () => undefined }], lazy, onEdit: () => undefined,
    renderPreview: () => (wrap ? createElement(SettledPreview, { urls: [], children: createElement("p", null, "content") }) : createElement("p", null, "content")),
  }));
  const css = read("components/admin/ui/editor-kit/PreviewCards.module.css");

  it("unmounted shows the placeholder", () => {
    const html = cards(true, false);
    expect(html).toContain('data-preview-mounted="false"');
    expect(html).toContain("data-preview-placeholder");
    expect(html).not.toContain("content");
    expect(css).toMatch(/\.box\[data-preview-mounted="false"\] \.placeholder[^{]*\{\s*display: block/);
  });

  it("lazy={false} mounts the preview without the placeholder rule applying", () => {
    const html = cards(false, false);
    expect(html).toContain('data-preview-mounted="true"');
    expect(html).toContain("content");
    expect(html).not.toContain("data-preview-settling");
  });

  it("settling content carries data-preview-settling and the placeholder rule keys on it, not on inline styles", () => {
    const html = cards(false, true);
    expect(html).toContain('data-preview-settling="true"');
    expect(css).toContain('.box:has(.scaled [data-preview-settling="true"]) .placeholder');
    expect(css).not.toMatch(/\[style\*=/);
  });

  it("keeps the box fixed and the reduced-motion fill static", () => {
    expect(css).toMatch(/\.box \{[^}]*block-size: 190px/);
    expect(css).toMatch(/\.box \.placeholder \{[^}]*position: absolute;[^}]*inset: 0/);
    expect(read("components/admin/ui/Shimmer.module.css")).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.shimmer::after \{\s*animation: none/);
  });
});

describe("RC-ADMIN-09 shared discard text and two-line description", () => {
  it("every Foothill, Chick-fil-A, Tickets and Season/KBYG discard dialog reads DISCARD_CONFIRM", () => {
    expect(DISCARD_CONFIRM).toEqual({ title: "Discard your edits?", confirmLabel: "Discard and reload" });
    for (const file of ["stadium/StadiumEditor", "chick-fil-a/ChickFilAEditor", "tickets/TicketsEditor", "ticket-pages/TicketPageEditor"]) {
      const source = read(`components/admin/${file}.tsx`);
      expect(source, file).toContain("title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel}");
      expect(source, file).not.toContain('"Discard your edits?"');
      expect(source, file).not.toContain('"Discard and reload"');
    }
  });

  it("the page description and its skeleton are both two lines at every width", () => {
    const frame = read("components/admin/ui/editor-kit/PageFrame.module.css");
    const skeleton = read("components/admin/ui/editor-kit/skeletons.module.css");
    const description = frame.match(/\n\.description \{[^}]*\}/)?.[0] ?? "";
    expect(description).toContain("-webkit-line-clamp: 2");
    expect(description).toContain("min-block-size: calc(.875rem * 1.5 * 2)");
    expect(description).toContain("max-block-size: calc(.875rem * 1.5 * 2)");
    expect(description).not.toContain("nowrap");
    expect(frame.slice(frame.indexOf("@media (max-width: 767px)"))).not.toMatch(/\.description \{/);
    expect(skeleton.match(/\n\.description \{[^}]*\}/)?.[0]).toContain("block-size: calc(.875rem * 1.5 * 2)");
    expect(skeleton).not.toMatch(/@media[^{]*\{[^@]*\.description \{/);
  });
});

/** Just enough DOM for scopePreviewIds: a tree of elements with attributes. */
class FakeEl {
  attrs = new Map<string, string>();
  children: FakeEl[] = [];
  constructor(public tag: string, attrs: Record<string, string> = {}, children: FakeEl[] = []) { Object.entries(attrs).forEach(([k, v]) => this.attrs.set(k, v)); this.children = children; }
  get id() { return this.attrs.get("id") ?? ""; }
  set id(value: string) { this.attrs.set("id", value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  all(): FakeEl[] { return this.children.flatMap(child => [child, ...child.all()]); }
  querySelectorAll(selector: string) { return selector === "[id]" ? this.all().filter(el => el.attrs.has("id")) : this.all(); }
}
const preview = () => new FakeEl("div", {}, [new FakeEl("section", { "aria-labelledby": "perks-title" }, [
  new FakeEl("h2", { id: "perks-title" }), new FakeEl("p", { id: "note" }), new FakeEl("button", { "aria-describedby": "note x" }),
  new FakeEl("label", { for: "f" }), new FakeEl("input", { id: "f" }), new FakeEl("a", { href: "#note" }),
])]);

describe("RC-ADMIN-09 inline preview ids are unique per card", () => {
  it("prefixes ids and keeps references inside each preview pointing into that preview", () => {
    const a = preview(), b = preview();
    scopePreviewIds(a as unknown as Element, "pva-"); scopePreviewIds(b as unknown as Element, "pvb-");
    const ids = [...a.querySelectorAll("[id]"), ...b.querySelectorAll("[id]")].map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [root, p] of [[a, "pva-"], [b, "pvb-"]] as const) {
      const own = new Set(root.querySelectorAll("[id]").map(el => el.id));
      const byTag = (tag: string) => root.all().find(el => el.tag === tag)!;
      expect(byTag("section").getAttribute("aria-labelledby")).toBe(`${p}perks-title`);
      expect(byTag("button").getAttribute("aria-describedby")).toBe(`${p}note x`);
      expect(byTag("label").getAttribute("for")).toBe(`${p}f`);
      expect(byTag("a").getAttribute("href")).toBe(`#${p}note`);
      for (const target of [`${p}perks-title`, `${p}f`, `${p}note`]) expect(own.has(target)).toBe(true);
    }
  });

  it("is idempotent and rescopes a reference React re-rendered with its raw value", () => {
    const a = preview();
    scopePreviewIds(a as unknown as Element, "pva-");
    const snapshot = JSON.stringify([...a.all().map(el => [...el.attrs])]);
    scopePreviewIds(a as unknown as Element, "pva-");
    expect(JSON.stringify([...a.all().map(el => [...el.attrs])])).toBe(snapshot);
    a.all().find(el => el.tag === "section")!.setAttribute("aria-labelledby", "perks-title");
    scopePreviewIds(a as unknown as Element, "pva-");
    expect(a.all().find(el => el.tag === "section")!.getAttribute("aria-labelledby")).toBe("pva-perks-title");
  });
});

describe("RC-ADMIN-09 SVG references and the observer list", () => {
  const svg = () => new FakeEl("div", {}, [new FakeEl("svg", {}, [
    new FakeEl("defs", {}, [new FakeEl("linearGradient", { id: "g" }), new FakeEl("clipPath", { id: "c" }), new FakeEl("path", { id: "shape" })]),
    new FakeEl("rect", { fill: "url(#g)", stroke: "url('#g')", "clip-path": 'url("#c")', mask: "url(#outside)", style: "fill:url(#g); filter: url( #c )" }),
    new FakeEl("use", { href: "#shape" }), new FakeEl("use", { "xlink:href": "#shape" }), new FakeEl("use", { href: "#outside" }),
    new FakeEl("line", { "marker-end": "url(#g)", filter: "url(#c)" }), new FakeEl("p", { "aria-errormessage": "g", "aria-flowto": "c shape" }),
  ])]);
  const find = (root: FakeEl, tag: string, n = 0) => root.all().filter(el => el.tag === tag)[n];
  const dump = (root: FakeEl) => JSON.stringify(root.all().map(el => [...el.attrs]));

  it("rewrites url(#id), style, href and xlink:href inside their own preview only", () => {
    const a = svg(), b = svg();
    scopePreviewIds(a as unknown as Element, "pva-"); scopePreviewIds(b as unknown as Element, "pvb-");
    for (const [root, p] of [[a, "pva-"], [b, "pvb-"]] as const) {
      const rect = find(root, "rect");
      expect(rect.getAttribute("fill")).toBe(`url(#${p}g)`);
      expect(rect.getAttribute("stroke")).toBe(`url('#${p}g')`);
      expect(rect.getAttribute("clip-path")).toBe(`url("#${p}c")`);
      expect(rect.getAttribute("style")).toBe(`fill:url(#${p}g); filter: url(#${p}c)`);
      expect(find(root, "use", 0).getAttribute("href")).toBe(`#${p}shape`);
      expect(find(root, "use", 1).getAttribute("xlink:href")).toBe(`#${p}shape`);
      expect(find(root, "line").getAttribute("marker-end")).toBe(`url(#${p}g)`);
      expect(find(root, "line").getAttribute("filter")).toBe(`url(#${p}c)`);
      expect(find(root, "p").getAttribute("aria-errormessage")).toBe(`${p}g`);
      expect(find(root, "p").getAttribute("aria-flowto")).toBe(`${p}c ${p}shape`);
    }
    expect(find(a, "linearGradient").id).toBe("pva-g");
    expect(find(b, "linearGradient").id).toBe("pvb-g");
  });

  it("leaves references to ids outside the preview alone", () => {
    const a = svg();
    scopePreviewIds(a as unknown as Element, "pva-");
    expect(find(a, "rect").getAttribute("mask")).toBe("url(#outside)");
    expect(find(a, "use", 2).getAttribute("href")).toBe("#outside");
  });

  it("is idempotent", () => {
    const a = svg();
    scopePreviewIds(a as unknown as Element, "pva-");
    const snapshot = dump(a);
    scopePreviewIds(a as unknown as Element, "pva-");
    expect(dump(a)).toBe(snapshot);
  });

  it("the observer watches id and every attribute the rewrite touches", () => {
    for (const name of ["id", "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-details", "aria-activedescendant", "aria-errormessage", "aria-flowto", "for",
      "fill", "stroke", "clip-path", "mask", "filter", "marker-start", "marker-mid", "marker-end", "style", "href", "xlink:href"]) expect(SCOPED_PREVIEW_ATTRIBUTES, name).toContain(name);
    expect(read("components/admin/ui/editor-kit/PreviewCards.tsx")).toContain("attributeFilter: SCOPED_PREVIEW_ATTRIBUTES");
  });
});
