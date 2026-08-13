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

  it("uses real about and identity content without club-specific copy or a form", () => {
    const source = read("components/editorial/EditorialAboutPage.tsx");

    expect(source).toContain("DBAboutPageContent");
    expect(source).toContain("useEditorialIdentity()");
    expect(source).toContain("content.story_paragraphs.map");
    expect(source).toContain("identity?.mission");
    expect(source).toContain("identity?.highlights");
    expect(source).toContain('className="manifesto"');
    expect(source).toContain('className="find-us"');
    expect(source).not.toMatch(/Lions|Columbus|<form/i);
  });
});
