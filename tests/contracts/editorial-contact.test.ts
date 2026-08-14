import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Editorial (Lions, editorial@1) Contact page contracts.
 *
 * There is no reference implementation of a Contact page on the superseded
 * claude/lions-fc-website-setup-ij0p7t branch, so components/editorial/
 * EditorialContactPage.tsx was built from scratch: structurally modeled on
 * the already-shipped components/AcademyContactPage.tsx (same
 * ContactContent shape from fetchContactContent, same empty-state logic
 * when both `profile` and `page` are null), restyled with editorial's own
 * interior-hero + detail grid pattern instead of DCFC's navy hero and
 * bordered-card mockup styling. This suite is a source-scan contract
 * following the house convention established by
 * tests/contracts/editorial-home.test.ts and
 * tests/contracts/editorial-tryouts.test.ts (this repo's vitest.config.ts
 * has no JSX transform, so no contract test renders a .tsx component --
 * every assertion here reads file source as a string).
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("editorial contact: read-only render", () => {
  it("never renders a <form> or triggers a mutation", () => {
    const source = stripComments(
      read("components/editorial/EditorialContactPage.tsx"),
    );
    expect(source).not.toMatch(/<form/i);
    expect(source).not.toMatch(/onSubmit|useMutation|\.insert\(|\.update\(|\.upsert\(/);
  });

  it("consumes the real ContactContent shape from lib/queries, not a bespoke content type", () => {
    const source = read("components/editorial/EditorialContactPage.tsx");
    expect(source).toContain('import type { ContactContent } from "@/lib/queries"');
  });

  it("derives the empty state the same way AcademyContactPage does: no profile and no page", () => {
    const source = read("components/editorial/EditorialContactPage.tsx");
    expect(source).toContain(
      "const hasContent = Boolean(content.profile || page);",
    );
    expect(source).toContain("!hasContent");
    expect(source).toContain("Contact details coming soon");
  });

  it("uses editorial's own CSS custom properties, never Diverse City's hardcoded navy/red hex colors", () => {
    const source = read("components/editorial/EditorialContactPage.tsx");
    expect(source).not.toMatch(/#1E3653|#FF1616|#14283F|#D70000|#B9E3F6|#F9FAFD/i);

    const css = read("styles/editorial.css");
    expect(css).toContain('[data-site-template="editorial"] .contact-hero-cta {');
    expect(css).toContain("align-self: flex-start;");
    expect(css).toContain("width: fit-content;");
    expect(css).toContain('[data-site-template="editorial"] .contact-details > .eyebrow');
    expect(css).toContain("border-left: 1px solid var(--line);");
  });

  it("renders local inline social marks instead of requesting optional icon URLs", () => {
    const source = read("components/editorial/EditorialContactPage.tsx");
    expect(source).toContain("function SocialIcon(");
    expect(source).toContain("<SocialIcon platform={link.id} />");
    expect(source).toContain("href={link.href}");
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).not.toContain("link.icon");
    expect(source).not.toContain("ResilientImage");
  });

  it("centers and enlarges the social follow section without compromising mobile or keyboard access", () => {
    const source = read("components/editorial/EditorialContactPage.tsx");
    const css = read("styles/editorial.css");

    expect(source).toContain('<h2 className="eyebrow">Follow along</h2>');
    expect(css).toMatch(
      /\[data-site-template="editorial"\] \.contact-social \{[^}]*align-items: center;[^}]*text-align: center;/,
    );
    expect(css).toMatch(
      /\[data-site-template="editorial"\] \.contact-social-links \{[^}]*flex-wrap: wrap;[^}]*justify-content: center;[^}]*width: min\(100%, 520px\);/,
    );
    expect(css).toMatch(
      /\[data-site-template="editorial"\] \.contact-social-icon \{[^}]*width: clamp\(62px, 6vw, 72px\);[^}]*height: clamp\(62px, 6vw, 72px\);/,
    );
    expect(css).toMatch(
      /\[data-site-template="editorial"\] \.contact-social-icon:focus-visible \{[^}]*outline: 3px solid var\(--accent\);[^}]*outline-offset: 4px;/,
    );
    expect(css).toMatch(
      /\[data-site-template="editorial"\] \.contact-page \{[^}]*padding-bottom: 0;/,
    );
    expect(css).toMatch(
      /\[data-site-template="editorial"\] \.contact-social \{[^}]*padding-bottom: clamp\(28px, 4vw, 48px\);/,
    );
  });

  it("keeps the published email on one line without overflowing responsive contact grids", () => {
    const css = read("styles/editorial.css");

    expect(css).toMatch(
      /\.contact-detail-item a\[href\^="mailto:"\] \{[^}]*white-space: nowrap;[^}]*word-break: normal;/,
    );
    expect(css).toContain("@media (min-width: 1351px)");
    expect(css).toContain(
      "grid-template-columns: minmax(420px, 1.5fr) repeat(3, minmax(0, 1fr));",
    );
    expect(css).toContain("@media (max-width: 1350px)");
    expect(css).toContain("@media (max-width: 700px)");
  });
});

describe("editorial contact: dispatch wiring", () => {
  it("adds an editorial@1 branch to the tenant contact route while keeping the academy@1 guard byte-identical and reachable for every other template", () => {
    const route = read("app/%5Fclubs/[slug]/contact/page.tsx");
    expect(route).toContain(
      'import EditorialContactPage from "@/components/editorial/EditorialContactPage"',
    );
    expect(route).toContain('if (club.presentationTemplateKey === "editorial@1")');
    expect(route).toContain("<EditorialContactPage");
    // Pinned by tests/contracts/diverse-city-admin-public-acceptance.test.ts
    // -- must stay exactly this string, still reachable after the editorial
    // branch.
    expect(route).toContain(
      'if (club.presentationTemplateKey !== "academy@1") notFound();',
    );
    const editorialBranchIndex = route.indexOf(
      'if (club.presentationTemplateKey === "editorial@1")',
    );
    const academyGuardIndex = route.indexOf(
      'if (club.presentationTemplateKey !== "academy@1") notFound();',
    );
    expect(editorialBranchIndex).toBeGreaterThan(-1);
    expect(academyGuardIndex).toBeGreaterThan(editorialBranchIndex);
  });

  it("fetches contact content for the editorial branch the same way the academy branch does", () => {
    const route = read("app/%5Fclubs/[slug]/contact/page.tsx");
    const editorialBranch = route.slice(
      route.indexOf('if (club.presentationTemplateKey === "editorial@1")'),
      route.indexOf(
        'if (club.presentationTemplateKey !== "academy@1") notFound();',
      ),
    );
    expect(editorialBranch).toContain("fetchContactContent(club.id, onzio)");
  });
});

describe("editorial contact: classic/clubhouse/academy regression", () => {
  it("never mounts editorial content in any non-editorial contact surface", () => {
    for (const file of [
      "components/AcademyContactPage.tsx",
      "app/(public)/contact/page.tsx",
    ]) {
      expect(stripComments(read(file))).not.toMatch(/editorial/i);
    }
  });

  it("the academy contact page keeps its own mockup-parity classes untouched", () => {
    const source = read("components/AcademyContactPage.tsx");
    expect(source).toContain("#1E3653");
    expect(source).toContain("#FF1616");
  });
});
