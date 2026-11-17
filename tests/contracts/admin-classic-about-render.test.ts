import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ClubhouseAboutPage from "@/components/ClubhouseAboutPage";
import { EMPTY_ABOUT_PAGE_CONTENT } from "@/lib/about-content";

vi.mock("@/components/ResilientImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));

const samples = [
  { name: "populated", content: { ...EMPTY_ABOUT_PAGE_CONTENT, hero_title: "Our club", story_paragraphs: ["A club for our community."], feature_image_url: "/feature.webp", values_heading: "Our values", values: [{ title: "Together", description: "Everyone belongs." }], closing_text: "Join us.", closing_cta_label: "See the schedule", closing_cta_href: "/schedule" } },
  { name: "empty", content: { ...EMPTY_ABOUT_PAGE_CONTENT, hero_title: "", story_paragraphs: [], values: [], values_heading: "", closing_text: "", closing_cta_label: "", closing_cta_href: "" } },
];

const frozen: Record<string, string> = {"populated": "e1ef778f6fbed46270defa18d0efdf489a26fab73cbd7e4954d012f0c38d89c5", "empty": "c9610c0c6f820466c5eb10bed5d016352fda2c29062a1ab871c70cae8850f662"};

describe("Classic About heading seam public output", () => {
  it.each(samples)("preserves frozen default $name output", ({ name, content }) => {
    const html = renderToStaticMarkup(createElement(ClubhouseAboutPage, { content, sponsors: [] }));
    expect(createHash("sha256").update(html).digest("hex")).toBe(frozen[name]);
    expect(renderToStaticMarkup(createElement(ClubhouseAboutPage, { content, sponsors: [], renderHeading: heading => heading }))).toBe(html);
    expect(html).not.toContain("data-admin-editable-region");
  });

  it("lets the supplied callback own a stable editor heading region", () => {
    const html = renderToStaticMarkup(createElement(ClubhouseAboutPage, {
      content: samples[0].content, sponsors: [],
      renderHeading: heading => createElement("header", { "data-test-editor-heading": "" }, heading),
    }));
    expect(html).toContain('<header data-test-editor-heading=""><h2>Our club</h2></header>');
    expect(html.match(/data-test-editor-heading/g)).toHaveLength(1);
    expect(html).toContain("A club for our community.");
  });
});
