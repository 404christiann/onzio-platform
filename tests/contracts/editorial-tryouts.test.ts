import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Editorial (Lions, editorial@1) Tryouts page contracts.
 *
 * Unlike the superseded claude/lions-fc-website-setup-ij0p7t reference
 * branch's EditorialTryoutsView.tsx (informational-only
 * sessions[]/whatToBring[] copy off a table that no longer exists), this
 * phase's editorial tryouts page consumes the SAME real per-event data
 * Diverse City's academy@1 page already uses -- onzio.tryouts via
 * fetchTryouts, mapped through lib/queries.ts's mapTryout. This suite is a
 * source-scan contract following the house convention established by
 * tests/contracts/editorial-home.test.ts (this repo's vitest.config.ts has
 * no JSX transform, so no contract test renders a .tsx component -- every
 * assertion here reads file source as a string).
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("editorial tryouts: read-only render", () => {
  it("never renders a <form> or triggers a mutation", () => {
    const source = stripComments(read("components/editorial/EditorialTryouts.tsx"));
    expect(source).not.toMatch(/<form/i);
    expect(source).not.toMatch(/onSubmit|useMutation|\.insert\(|\.update\(|\.upsert\(/);
  });

  it("consumes the real per-event TryoutContent shape, not the superseded sessions[]/whatToBring[] page-content shape", () => {
    const source = read("components/editorial/EditorialTryouts.tsx");
    expect(source).toContain('import type { TryoutContent } from "@/lib/queries"');
    expect(source).toContain(
      'import type { TryoutsPageContent } from "@/lib/tryouts-page-content"',
    );
    expect(source).not.toMatch(/whatToBring|session\.ageGroup|session\.dateRange|feeNote/);
  });

  it("renders a status badge, date/location/cost, and derives the empty state from tryouts_page_content", () => {
    const source = read("components/editorial/EditorialTryouts.tsx");
    expect(source).toContain("tryout.status");
    expect(source).toContain("tryout.eventDate");
    expect(source).toContain("tryout.location");
    expect(source).toContain("tryout.costText");
    expect(source).toContain("content.introWithTryouts");
    expect(source).toContain("content.introNoTryouts");
  });

  it("renders the registration/contact action exactly as the real action shape dictates: registration opens in a new tab, contact does not, and a null action shows unavailable copy", () => {
    const source = read("components/editorial/EditorialTryouts.tsx");
    expect(source).toContain("tryout.action");
    expect(source).toMatch(
      /tryout\.action\.kind === "registration"\s*\n\s*\? \{ target: "_blank", rel: "noopener noreferrer" \}/,
    );
    expect(source).toContain("Registration is currently unavailable.");
  });

  it("shows the closedMessage only for closed tryouts", () => {
    const source = read("components/editorial/EditorialTryouts.tsx");
    expect(source).toMatch(
      /tryout\.status === "closed" && tryout\.closedMessage/,
    );
  });

  it("uses editorial's own CSS custom properties, never Diverse City's hardcoded navy/red hex colors", () => {
    const source = read("components/editorial/EditorialTryouts.tsx");
    expect(source).not.toMatch(/#1E3653|#FF1616|#14283F|#D70000/i);
  });
});

describe("editorial tryouts: dispatch wiring", () => {
  it("adds an editorial@1 branch to the tenant tryouts route while keeping the academy@1 guard byte-identical and reachable for every other template", () => {
    const route = read("app/%5Fclubs/[slug]/tryouts/page.tsx");
    expect(route).toContain('import EditorialTryouts from "@/components/editorial/EditorialTryouts"');
    expect(route).toContain('if (club.presentationTemplateKey === "editorial@1")');
    expect(route).toContain("<EditorialTryouts");
    // Pinned by tests/contracts/diverse-city-tryouts-admin.test.ts and
    // tests/contracts/diverse-city-admin-public-acceptance.test.ts -- must
    // stay exactly this string, still reachable after the editorial branch.
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

  it("fetches the same three data sources for the editorial branch as the academy branch", () => {
    const route = read("app/%5Fclubs/[slug]/tryouts/page.tsx");
    const editorialBranch = route.slice(
      route.indexOf('if (club.presentationTemplateKey === "editorial@1")'),
      route.indexOf(
        'if (club.presentationTemplateKey !== "academy@1") notFound();',
      ),
    );
    expect(editorialBranch).toContain("fetchTryouts(club.id, onzio)");
    expect(editorialBranch).toContain("fetchContactProfile(club.id, onzio)");
    expect(editorialBranch).toContain("fetchTryoutsPageContent(club.id, onzio)");
  });
});

describe("editorial tryouts: classic/clubhouse/academy regression", () => {
  it("never mounts editorial content in any non-editorial tryouts surface", () => {
    for (const file of [
      "components/AcademyTryoutsPage.tsx",
      "app/(public)/tryouts/page.tsx",
    ]) {
      expect(stripComments(read(file))).not.toMatch(/editorial/i);
    }
  });

  it("the academy tryouts page keeps its own mockup-parity classes untouched", () => {
    const source = read("components/AcademyTryoutsPage.tsx");
    expect(source).toContain("#1E3653");
    expect(source).toContain("#FF1616");
  });
});
