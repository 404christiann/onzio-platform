import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("editorial About page", () => {
  it("dispatches editorial@1 before the existing clubhouse and classic branches", () => {
    const source = read("app/%5Fclubs/[slug]/club/about/page.tsx");
    const editorialIndex = source.indexOf('"editorial@1"');
    const clubhouseIndex = source.indexOf('"clubhouse@1"');

    expect(source).toContain(
      'import EditorialAboutPage from "@/components/editorial/EditorialAboutPage";',
    );
    expect(editorialIndex).toBeGreaterThan(-1);
    expect(clubhouseIndex).toBeGreaterThan(editorialIndex);
    expect(source).toContain("<EditorialAboutPage content={content.about} />");
    expect(source).toContain("<ClubhouseAboutPage content={content.about} sponsors={sponsors} />");
    expect(source).toContain("<AboutClubPageClient content={content.about} />");
  });

  it("ports the shared About layout with real tenant content and resilient media", () => {
    const source = read("components/editorial/EditorialAboutPage.tsx");

    expect(source).toContain("DBAboutPageContent");
    expect(source).toContain('import ResilientImage from "@/components/ResilientImage";');
    expect(source).toContain("useClubContext()");
    expect(source).toContain("content.hero_title");
    expect(source).toContain("content.story_paragraphs.map");
    expect(source).toContain("content.feature_image_url");
    expect(source).toContain("src={content.feature_image_url}");
    expect(source).toContain('fallbackVariant="photo"');
    expect(source).toContain("className={`manifesto");
    expect(source).toContain('className="value-section"');
    expect(source).toContain('className="value-grid"');
    expect(source).toContain('className="value-card"');
    expect(source).toContain("content.values.map");
    expect(source).toContain("value.title");
    expect(source).toContain("value.description");
    expect(source).toContain('String(index + 1).padStart(2, "0")');
    expect(source).toContain('className="head-rule"');
    expect(source).toContain('className="about-closing"');
    expect(source).toContain("content.closing_text");
    expect(source).toContain("href={content.closing_cta_href}");
    expect(source).toContain("content.closing_cta_label");
    expect(source).toContain(
      "content.closing_cta_label && content.closing_cta_href",
    );
    expect(source).not.toContain("useEditorialIdentity");
    expect(source).not.toMatch(/Lions|Columbus|<form/i);

    const css = read("styles/editorial.css");
    expect(css).toContain(
      "padding: calc(var(--header-h) + clamp(48px, 6vw, 72px)) var(--pad-x)",
    );
    expect(css).toContain(
      "grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr);",
    );
    expect(css).toContain('[data-site-template="editorial"] .manifesto-media');
    expect(css).toContain("min-height: 320px;");
    expect(css).toContain('[data-site-template="editorial"] .about-closing');
    expect(css).toContain("text-align: center;");
    expect(css).toMatch(
      /\.club-page \.interior-hero h1 \{[^}]*color: var\(--primary\);/,
    );
    expect(css).toMatch(
      /\.about-closing p \{[^}]*color: var\(--accent\);/,
    );
  });
});
