import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { homepageDraft } from "../fixtures/homepage-editor";
import { EMPTY_HOMEPAGE_HERO_CONTENT, DEFAULT_HOMEPAGE_HERO_CONTENT } from "../../lib/homepage-content";
import { buildHomepageSaveRequest } from "../../lib/homepage-editor/adapter";
import { createHomepageEditorState, reduceHomepageEditor } from "../../lib/homepage-editor/model";

const fixture = vi.hoisted(() => ({ club: { id: "alpha", name: "Alpha FC", slug: "alpha", presentationTemplateKey: null as string | null, primaryColor: null, secondaryColor: null } }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => fixture.club }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "" }) }));
vi.mock("@/lib/homepage-editor/preview-context", () => ({ useHomepagePreview: () => null, useHomepagePiece: () => ({}) }));
vi.mock("@/lib/queries", () => ({ fetchHomepageContent: vi.fn(), fetchHomepageHeroContent: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => createElement("a", props) }));
import Hero from "../../components/Hero";
import AcademyHero from "../../components/sites/diverse-city/Hero";
const content = { ...EMPTY_HOMEPAGE_HERO_CONTENT, ...homepageDraft().hero };
beforeEach(() => { fixture.club.slug = "alpha"; fixture.club.presentationTemplateKey = null; });
for (const kind of ["generic", "clubhouse", "academy"]) describe(kind + " secondary homepage button", () => {
 const render = (label: string) => {
  fixture.club.presentationTemplateKey = kind === "clubhouse" ? "clubhouse@1" : kind === "academy" ? "academy@1" : null;
  return renderToStaticMarkup(createElement(kind === "academy" ? AcademyHero : Hero, { initialContent: { ...content, secondary_cta_label: label, secondary_cta_href: "/contact?from=hero" } }));
 };
 for (const blank of ["", "   ", "\t\n"]) it("omits a blank second button " + JSON.stringify(blank), () => {
  const html = render(blank); expect(html.match(/<a\b/g)).toHaveLength(1); expect(html).not.toContain('/contact?from=hero'); expect(html).toContain(content.primary_cta_label);
 });
 it("keeps nonempty wording and href", () => { const html = render("  Meet our club  "); expect(html.match(/<a\b/g)).toHaveLength(2); expect(html).toContain('href="/contact?from=hero"'); expect(html).toContain(">Meet our club</a>"); });
});
it("keeps legacy-fixed Rose City output independent of the editable DTO", () => {
 fixture.club.slug = "rose-city";
 const render = (label: string) => renderToStaticMarkup(createElement(Hero, { initialContent: { ...content, secondary_cta_label: label } }));
 expect(render("")).toBe(render("A different editable button"));
});
it("keeps shipped default nonempty wording and treats neutral blank as one button", () => {
 expect(renderToStaticMarkup(createElement(Hero, { initialContent: DEFAULT_HOMEPAGE_HERO_CONTENT })).match(/<a\b/g)).toHaveLength(2);
 expect(renderToStaticMarkup(createElement(Hero, { initialContent: EMPTY_HOMEPAGE_HERO_CONTENT })).match(/<a\b/g)).toHaveLength(1);
});
it("preserves exact blank in the existing request and immutable retry, without changing its href", () => {
 let state = createHomepageEditorState({ content: homepageDraft(), revision: "1", designRevision: "design1", editableSections: ["hero"] });
 state = reduceHomepageEditor(state, { type: "field-changed", field: "hero.secondary_cta_label", value: "" });
 const first = buildHomepageSaveRequest(state, { templateKey: null, slideshowVariant: "matchday" }, "33333333-3333-4333-8333-333333333333");
 expect(first.sections.hero?.secondary_cta_label).toBe(""); expect(first.sections.hero?.secondary_cta_href).toBe("/roster");
 state = reduceHomepageEditor(state, { type: "save-started", operationId: first.operationId });
 state = reduceHomepageEditor(state, { type: "save-failed", code: "SAVE_UNCERTAIN", message: "Unknown" });
 expect(buildHomepageSaveRequest(state, { templateKey: null, slideshowVariant: "matchday" }, "44444444-4444-4444-8444-444444444444")).toEqual(first);
});
