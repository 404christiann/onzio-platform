import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { EMPTY_ABOUT_PAGE_CONTENT } from "@/lib/about-content";
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as string) }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ name: "Synthetic Club" }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ fallbackVariant: _fallbackVariant, ...props }: Record<string, unknown>) => createElement("img", props) }));
import CinematicAbout from "@/components/cinematic/CinematicAbout";

it("renders authored content and keeps the populated admin canvas identical to public markup", () => {
  const content = { ...EMPTY_ABOUT_PAGE_CONTENT, hero_title: "Edited heading", story_paragraphs: ["Edited first story", "Edited second story"],
    feature_image_url: "/images/authored.webp", values_heading: "Edited values", values: [{ title: "Edited value", description: "Edited description" }],
    closing_text: "Edited invitation", closing_cta_label: "Edited button", closing_cta_href: "/schedule" };
  const html = renderToStaticMarkup(createElement(CinematicAbout, { content }));
  for (const text of [content.hero_title, ...content.story_paragraphs, content.values_heading, content.values[0].title, content.values[0].description, content.closing_text, content.closing_cta_label]) expect(html).toContain(text);
  expect(html).toContain('src="/images/authored.webp"');
  expect(html).toContain('href="/schedule"');
  for (const section of ["hero", "story", "values", "closing"]) expect(html).toContain(`data-about-editor-section="${section}"`);
  expect(html).not.toContain("Rose City"); expect(html).not.toContain("Robinson"); expect(html).not.toContain("/_next/image");
  expect(renderToStaticMarkup(createElement(CinematicAbout, { content, editorEmptySections: true }))).toBe(html);
});
it("keeps cleared public sections empty while retaining all first authoring targets", () => {
  const html = renderToStaticMarkup(createElement(CinematicAbout, { content: EMPTY_ABOUT_PAGE_CONTENT }));
  expect(html).not.toContain('class="about-story'); expect(html).not.toContain('class="about-values"'); expect(html).not.toContain('class="about-closing"'); expect(html).not.toContain("Add your");
  const editor = renderToStaticMarkup(createElement(CinematicAbout, { content: EMPTY_ABOUT_PAGE_CONTENT, editorEmptySections: true }));
  for (const section of ["hero", "story", "values", "closing"]) expect(editor).toContain(`data-about-editor-section="${section}"`);
  expect(editor).toContain("Add your first club value");
});
it("does not expose a broken closing link when its label or destination is cleared", () => {
  for (const content of [{ ...EMPTY_ABOUT_PAGE_CONTENT, closing_cta_label: "Schedule" }, { ...EMPTY_ABOUT_PAGE_CONTENT, closing_cta_href: "/schedule" }]) {
    expect(renderToStaticMarkup(createElement(CinematicAbout, { content }))).not.toContain('class="about-schedule"');
  }
});
