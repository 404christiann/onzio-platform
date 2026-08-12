import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClubIdentityContent } from "@/lib/club-identity";

/**
 * Real Starter-tier Lions editorial club-story page (`/club`) contracts.
 *
 * Following this repository's established editorial-*.test.ts conventions:
 * real server renders through react-dom/server against a real seeded-shaped
 * `club_identity` fixture, plus static source assertions for the dispatch/
 * mirror/middleware wiring. Per Christian's already-approved decision, this
 * is story + "Find us" info only — no contact form — so this suite also
 * proves the mockup's decorative form was intentionally not ported.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/club",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: Record<string, unknown> & { children?: unknown; href?: string }) =>
    createElement("a", { href, ...props }, children as never),
}));

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const LIONS_IDENTITY: ClubIdentityContent = {
  shortName: "Lions FC",
  initials: "LFC",
  foundedYear: 2014,
  league: "Midwest Premier League",
  division: "Ohio Valley Division",
  city: "Columbus",
  state: "OH",
  venue: "Scioto Field",
  timeZone: "America/New_York",
  contactEmail: "hello@lionsfc.example",
  contactPhone: "(614) 555-0142",
  contactAddress: "1814 W Broad St, Columbus, OH 43223",
  heroHeadlineTop: "Capital City.",
  heroHeadlineEm: "Roar as One.",
  heroIntro:
    "Columbus-built football, carried by a club that plays for the city and every supporter behind it.",
  slideshowHeadingTop: "This is how",
  slideshowHeadingEm: "Columbus roars.",
  identityHeadingTop: "A club shaped by",
  identityHeadingEm: "Columbus.",
  storyHeadingTop: "From Columbus.",
  storyHeadingEm: "For the Capital City.",
  mission: "Roar as one for Columbus.",
  highlights: [
    "2025 Ohio Valley Division Champions",
    "Three connected player pathways",
    "Columbus-owned and community-backed",
  ],
};

// Transcribed verbatim from the real seeded supabase/seed.sql
// about_page_content row for the Lions tenant.
const LIONS_STORY_PARAGRAPHS = [
  "Lions Football Club was founded to give Columbus a club that competes with ambition and belongs to its community. From Scioto Field to every neighborhood training ground, we wear the badge for the Capital City with purpose.",
  "Our first team, U23s, and academy share one pathway: local players, brave soccer, and standards that travel beyond matchday. One pathway, one badge, one city behind it.",
];

async function renderWithIdentity(
  element: ReturnType<typeof createElement>,
  identity: ClubIdentityContent | null = LIONS_IDENTITY,
) {
  const { EditorialIdentityProvider } = await import(
    "@/components/editorial/EditorialIdentityContext"
  );
  return renderToStaticMarkup(
    createElement(EditorialIdentityProvider, {
      value: { identity, crestUrl: "", crestOnDarkUrl: "" },
      children: element,
    }),
  );
}

describe("editorial club story view", () => {
  it("renders the interior hero from story_heading_top/em", async () => {
    const { default: EditorialClubStoryView } = await import(
      "@/components/editorial/EditorialClubStoryView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialClubStoryView, {
        storyParagraphs: LIONS_STORY_PARAGRAPHS,
      }),
    );
    expect(html).toContain('class="interior-hero"');
    expect(html).toContain("From Columbus.");
    expect(html).toContain("<em>For the Capital City.</em>");
  });

  it("renders both real seeded story paragraphs", async () => {
    const { default: EditorialClubStoryView } = await import(
      "@/components/editorial/EditorialClubStoryView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialClubStoryView, {
        storyParagraphs: LIONS_STORY_PARAGRAPHS,
      }),
    );
    for (const paragraph of LIONS_STORY_PARAGRAPHS) {
      expect(html).toContain(paragraph);
    }
  });

  it("renders a founded-year story mark derived from club_identity.founded_year", async () => {
    const { default: EditorialClubStoryView } = await import(
      "@/components/editorial/EditorialClubStoryView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialClubStoryView, { storyParagraphs: [] }),
    );
    expect(html).toContain('class="story-mark"');
    expect(html).toContain("14");
    expect(html).toContain("Founded 2014");
  });

  it("renders club_identity.mission as a blockquote", async () => {
    const { default: EditorialClubStoryView } = await import(
      "@/components/editorial/EditorialClubStoryView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialClubStoryView, { storyParagraphs: [] }),
    );
    expect(html).toContain("<blockquote>");
    expect(html).toContain("Roar as one for Columbus.");
  });

  it("renders every highlights entry as a plain list item", async () => {
    const { default: EditorialClubStoryView } = await import(
      "@/components/editorial/EditorialClubStoryView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialClubStoryView, { storyParagraphs: [] }),
    );
    expect(html).toContain('class="club-highlights"');
    for (const highlight of LIONS_IDENTITY.highlights) {
      expect(html).toContain(`<li>${highlight}</li>`);
    }
  });

  it("renders no highlights section when club_identity has none", async () => {
    const { default: EditorialClubStoryView } = await import(
      "@/components/editorial/EditorialClubStoryView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialClubStoryView, { storyParagraphs: [] }),
      { ...LIONS_IDENTITY, highlights: [] },
    );
    expect(html).not.toContain('class="club-highlights"');
  });

  it("renders a Find us block with contact_email, contact_phone, contact_address, and venue", async () => {
    const { default: EditorialClubStoryView } = await import(
      "@/components/editorial/EditorialClubStoryView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialClubStoryView, { storyParagraphs: [] }),
    );
    expect(html).toContain('class="find-us"');
    expect(html).toContain("Find us");
    expect(html).toContain(LIONS_IDENTITY.venue);
    expect(html).toContain(LIONS_IDENTITY.contactAddress);
    expect(html).toContain(`href="mailto:${LIONS_IDENTITY.contactEmail}"`);
    expect(html).toContain(LIONS_IDENTITY.contactEmail);
    expect(html).toContain(LIONS_IDENTITY.contactPhone);
  });

  it("never renders a contact form — story + Find us info only, per the approved plan", async () => {
    const { default: EditorialClubStoryView } = await import(
      "@/components/editorial/EditorialClubStoryView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialClubStoryView, {
        storyParagraphs: LIONS_STORY_PARAGRAPHS,
      }),
    );
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<button");

    const source = read("components/editorial/EditorialClubStoryView.tsx");
    expect(source).not.toMatch(/<form|<input|<textarea|useState/);
  });

  it("renders a safe empty state outside any identity data", async () => {
    const { default: EditorialClubStoryView } = await import(
      "@/components/editorial/EditorialClubStoryView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialClubStoryView, { storyParagraphs: [] }),
      null,
    );
    expect(html).toContain('class="interior club-page"');
  });

  it("is entirely data-driven: the component source contains no hardcoded Lions copy", () => {
    const source = read("components/editorial/EditorialClubStoryView.tsx");
    expect(source).not.toMatch(
      /Columbus|Capital City|Lions|Scioto|2014|LFC/,
    );
  });
});

describe("editorial club story container", () => {
  it("fetches about_page_content once via the existing fetchAboutClubContent helper", () => {
    const source = read("components/editorial/EditorialClubStory.tsx");
    expect(source).toContain("fetchAboutClubContent(club.id)");
    expect(source).toContain("useClubContext()");
    expect(source).toContain("EditorialClubStoryView");
  });
});

describe("editorial club story: dispatch, mirror, and middleware wiring", () => {
  it("only editorial-template tenants reach EditorialClubStory from the shared /club route; classic 404s", () => {
    const page = read("app/(public)/club/page.tsx");
    expect(page).toContain('club.siteTemplate === "editorial"');
    expect(page).toContain(
      'const EditorialClubStory = nextDynamic(\n  () => import("@/components/editorial/EditorialClubStory"),\n);',
    );
    expect(page).toContain("<EditorialClubStory />");
    expect(page).toContain("notFound()");
  });

  it("mirrors /club under the tenant route group, matching the roster/staff mirror pattern", () => {
    const mirror = read("app/%5Fclubs/[slug]/club/page.tsx").trim();
    expect(mirror).toBe('export { default } from "@/app/(public)/club/page";');
  });

  it("does not collide with the classic /club/about or /club/logo routes", () => {
    expect(
      readFileSync(
        resolve(process.cwd(), "app/(public)/club/about/page.tsx"),
        "utf8",
      ),
    ).toBeTruthy();
    expect(
      readFileSync(
        resolve(process.cwd(), "app/(public)/club/logo/page.tsx"),
        "utf8",
      ),
    ).toBeTruthy();
    // The new dispatcher lives at app/(public)/club/page.tsx — a distinct
    // Next.js route (/club) from app/(public)/club/about/page.tsx (/club/about)
    // and app/(public)/club/logo/page.tsx (/club/logo).
    const page = read("app/(public)/club/page.tsx");
    expect(page).not.toContain("AboutClubPageClient");
  });

  it("is registered in the tenant-rewrite allowlist so it resolves real club context", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toMatch(/PUBLIC_TENANT_PATHS = new Set\(\[[\s\S]*?"\/club"/);
  });
});

describe("editorial club story: classic regression", () => {
  it("classic components never mention the editorial club story page", () => {
    for (const file of [
      "components/Nav.tsx",
      "components/Footer.tsx",
      "components/AboutClubPageClient.tsx",
    ]) {
      expect(read(file)).not.toMatch(/editorial/i);
    }
  });
});
