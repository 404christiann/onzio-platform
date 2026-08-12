import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Fixture } from "@/lib/data";
import type { DBHomepageSlideshowPhoto } from "@/lib/db-types";
import type { ClubIdentityContent } from "@/lib/club-identity";

/**
 * Real Starter-tier Lions editorial homepage contracts (Hero, Next Match,
 * Matchday gallery, "Our story" teaser).
 *
 * Following this repository's established editorial-template.test.ts
 * conventions: static source assertions for browser-only behavior (autoplay
 * interval, pause on interaction, reduced-motion) plus real server renders
 * through react-dom/server for everything observable at render time. Each
 * data-bearing section is presentational (fixtures/photos/excerpt arrive as
 * props from `EditorialHome`'s single fetch), so it can be rendered directly
 * with real seeded-shaped fixtures instead of mocking Supabase.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: Record<string, unknown> & { children?: unknown; href?: string }) =>
    createElement("a", { href, ...props }, children as never),
}));
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...props
  }: Record<string, unknown> & { src?: string; alt?: string }) => {
    void props;
    return createElement("span", {
      "data-mock-image": true,
      "data-src": src,
      "data-alt": alt,
    });
  },
}));

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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

// Transcribed verbatim from the real seeded first-team 2026 fixtures
// (supabase/seed.sql). The suite runs against the real system clock, which
// this fictional platform's local dev/test environment keeps set to 2026, so
// the next fixture genuinely resolves to Capital City Athletic on 2026-08-15
// exactly as the real seeded app does.
const LIONS_FIXTURES: Fixture[] = [
  { date: "2026-05-09", time: "19:00", opponent: "Dayton Rovers SC", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 2, opponentScore: 0 },
  { date: "2026-05-16", time: "18:00", opponent: "Queen City FC", competition: "League", home: false, venue: "Scioto Field", roseCityScore: 1, opponentScore: 1 },
  { date: "2026-05-30", time: "19:30", opponent: "Lake Erie Athletic", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 3, opponentScore: 1 },
  { date: "2026-06-06", time: "18:00", opponent: "Toledo Harbor FC", competition: "League", home: false, venue: "Scioto Field", roseCityScore: 0, opponentScore: 1 },
  { date: "2026-06-20", time: "19:00", opponent: "Akron Union", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 2, opponentScore: 2 },
  { date: "2026-06-27", time: "19:00", opponent: "Franklinton 1909", competition: "League", home: false, venue: "Scioto Field", roseCityScore: 4, opponentScore: 1 },
  { date: "2026-07-11", time: "19:00", opponent: "Scioto Valley FC", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 2, opponentScore: 1 },
  { date: "2026-08-15", time: "19:00", opponent: "Capital City Athletic", competition: "Midwest Premier League", home: false, venue: "Scioto Field", roseCityScore: null, opponentScore: null },
  { date: "2026-08-22", time: "18:00", opponent: "Dayton Rovers SC", competition: "Midwest Premier League", home: true, venue: "Scioto Field", roseCityScore: null, opponentScore: null },
  { date: "2026-09-05", time: "19:00", opponent: "Queen City FC", competition: "Midwest Premier League", home: false, venue: "Scioto Field", roseCityScore: null, opponentScore: null },
  { date: "2026-09-12", time: "18:30", opponent: "Toledo Harbor FC", competition: "Midwest Premier League", home: true, venue: "Scioto Field", roseCityScore: null, opponentScore: null },
];

const LIONS_PHOTOS: DBHomepageSlideshowPhoto[] = [
  { id: "photo-1", url: "https://storage.example/onzio-media/lions/gallery-1.webp", alt: "Lions FC matchday photo 1", sort_order: 0, created_at: "" },
  { id: "photo-2", url: "https://storage.example/onzio-media/lions/gallery-2.webp", alt: "Lions FC matchday photo 2", sort_order: 1, created_at: "" },
  { id: "photo-3", url: "https://storage.example/onzio-media/lions/gallery-3.webp", alt: "Lions FC matchday photo 3", sort_order: 2, created_at: "" },
  { id: "photo-4", url: "https://storage.example/onzio-media/lions/gallery-4.webp", alt: "Lions FC matchday photo 4", sort_order: 3, created_at: "" },
];

const LIONS_CLUB = {
  id: "55555555-5555-4555-8555-555555555555",
  slug: "lions",
  name: "Lions Football Club",
  primaryDomain: "lions-onzio.vercel.app",
  lifecycle: "active" as const,
  publicAccess: "live" as const,
  tier: "starter" as const,
  siteTemplate: "editorial" as const,
  role: null,
};

async function renderWithProviders(
  element: ReturnType<typeof createElement>,
  identity: ClubIdentityContent | null = LIONS_IDENTITY,
  crestUrl = "",
) {
  const { ClubContextProvider } = await import(
    "@/components/ClubContextProvider"
  );
  const { EditorialIdentityProvider } = await import(
    "@/components/editorial/EditorialIdentityContext"
  );
  return renderToStaticMarkup(
    createElement(ClubContextProvider, {
      club: LIONS_CLUB,
      children: createElement(EditorialIdentityProvider, {
        value: { identity, crestUrl },
        children: element,
      }),
    }),
  );
}

describe("editorial home: section composition", () => {
  it("composes Hero, Next Match, Matchday gallery, and Our story teaser in that order", () => {
    const source = stripComments(read("components/editorial/EditorialHome.tsx"));
    const heroIndex = source.indexOf("<EditorialHero");
    const nextMatchIndex = source.indexOf("<EditorialNextMatch");
    const slideshowIndex = source.indexOf("<EditorialMatchdaySlideshow");
    const storyIndex = source.indexOf("<EditorialStoryTeaser");
    expect(heroIndex).toBeGreaterThan(-1);
    expect(nextMatchIndex).toBeGreaterThan(heroIndex);
    expect(slideshowIndex).toBeGreaterThan(nextMatchIndex);
    expect(storyIndex).toBeGreaterThan(slideshowIndex);
  });

  it("renders the hero before the story teaser in the real composed tree", async () => {
    const { default: EditorialHome } = await import(
      "@/components/editorial/EditorialHome"
    );
    const html = await renderWithProviders(createElement(EditorialHome));
    const heroIndex = html.indexOf('class="hero"');
    const storyIndex = html.indexOf('class="club-story"');
    expect(heroIndex).toBeGreaterThan(-1);
    expect(storyIndex).toBeGreaterThan(heroIndex);
  });

  it("never renders sponsor, store, kit, or season-selector content", async () => {
    const { default: EditorialHome } = await import(
      "@/components/editorial/EditorialHome"
    );
    const html = await renderWithProviders(createElement(EditorialHome));
    expect(html).not.toMatch(/sponsor|partner|kit-home|store|season-selector/i);

    const files = [
      "components/editorial/EditorialHome.tsx",
      "components/editorial/EditorialHero.tsx",
      "components/editorial/EditorialNextMatch.tsx",
      "components/editorial/EditorialMatchdaySlideshow.tsx",
      "components/editorial/EditorialStoryTeaser.tsx",
    ];
    for (const file of files) {
      expect(stripComments(read(file))).not.toMatch(
        /sponsor|partner|TierGate|kit-home|\/store/i,
      );
    }
  });
});

describe("editorial hero", () => {
  it("locks the headline to two lines via data-driven span/em, never hardcoded club copy", async () => {
    const { default: EditorialHero } = await import(
      "@/components/editorial/EditorialHero"
    );
    const html = await renderWithProviders(createElement(EditorialHero));
    expect(html).toContain("<span>Capital City.</span>");
    expect(html).toContain("<em>Roar as One.</em>");
    expect(html).toContain(
      "Columbus-built football, carried by a club that plays for the city",
    );
    expect(html).toContain('href="/schedule"');
    expect(html).toContain('href="/roster"');

    const source = read("components/editorial/EditorialHero.tsx");
    expect(source).not.toMatch(/Capital City|Roar as One|Columbus/);
    expect(source).toContain("identity?.heroHeadlineTop");
    expect(source).toContain("identity?.heroHeadlineEm");
    expect(source).toContain("identity?.heroIntro");
  });

  it("falls back to the club name when no identity row exists", async () => {
    const { default: EditorialHero } = await import(
      "@/components/editorial/EditorialHero"
    );
    const html = await renderWithProviders(createElement(EditorialHero), null);
    expect(html).toContain("Lions Football Club");
  });

  it("uses the editorial CSS hero gradient locked to two lines at every breakpoint", () => {
    const css = read("styles/editorial.css");
    expect(css).toMatch(
      /\.hero h1 span,\s*\n\[data-site-template="editorial"\] \.hero h1 em \{\s*\n\s*display: block;\s*\n\s*white-space: nowrap;/,
    );
    expect(css).toContain("var(--club-primary)");
  });
});

describe("editorial next match", () => {
  it("resolves the real next upcoming fixture and formats its details", async () => {
    const { default: EditorialNextMatch } = await import(
      "@/components/editorial/EditorialNextMatch"
    );
    const html = await renderWithProviders(
      createElement(EditorialNextMatch, { fixtures: LIONS_FIXTURES }),
    );
    expect(html).toContain("Capital City Athletic");
    expect(html).toContain("August 15, 2026");
    expect(html).toContain("Scioto Field");
    expect(html).toContain(">Away<");
    expect(html).toContain("Midwest Premier League");
    // Latest played result: 2026-07-11 Lions 2-1 Scioto Valley FC (home win).
    expect(html).toContain("LFC 2");
    expect(html).toContain("1 SVF");
    expect(html).toContain('href="/schedule"');
  });

  it("renders nothing while fixtures are still loading or when none are upcoming", async () => {
    const { default: EditorialNextMatch } = await import(
      "@/components/editorial/EditorialNextMatch"
    );
    expect(
      await renderWithProviders(
        createElement(EditorialNextMatch, { fixtures: null }),
      ),
    ).toBe("");
    expect(
      await renderWithProviders(
        createElement(EditorialNextMatch, { fixtures: [] }),
      ),
    ).toBe("");
  });

  it("falls back to a text monogram for opponents without a crest asset", () => {
    const source = read("components/editorial/EditorialNextMatch.tsx");
    expect(source).toContain("next.opponentLogoUrl");
    expect(source).toContain("monogram(next.opponent)");
  });
});

describe("editorial matchday slideshow", () => {
  it("renders exactly the seeded photos, in seeded order", async () => {
    const { default: EditorialMatchdaySlideshow } = await import(
      "@/components/editorial/EditorialMatchdaySlideshow"
    );
    const html = await renderWithProviders(
      createElement(EditorialMatchdaySlideshow, { photos: LIONS_PHOTOS }),
    );
    const order = [...html.matchAll(/data-src="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([
      "https://storage.example/onzio-media/lions/gallery-1.webp",
      "https://storage.example/onzio-media/lions/gallery-1.webp",
      "https://storage.example/onzio-media/lions/gallery-2.webp",
      "https://storage.example/onzio-media/lions/gallery-2.webp",
      "https://storage.example/onzio-media/lions/gallery-3.webp",
      "https://storage.example/onzio-media/lions/gallery-3.webp",
      "https://storage.example/onzio-media/lions/gallery-4.webp",
      "https://storage.example/onzio-media/lions/gallery-4.webp",
    ]);
    expect(
      (html.match(/class="matchday-slide"/g) ?? []).length,
    ).toBe(4);
    expect(html).toContain("This is how");
    expect(html).toContain("Columbus roars.");
  });

  it("hides the whole section gracefully when there are no photos", async () => {
    const { default: EditorialMatchdaySlideshow } = await import(
      "@/components/editorial/EditorialMatchdaySlideshow"
    );
    const html = await renderWithProviders(
      createElement(EditorialMatchdaySlideshow, { photos: [] }),
    );
    expect(html).toBe("");
  });

  it("advances every four seconds and disables autoplay under prefers-reduced-motion", () => {
    const source = read("components/editorial/EditorialMatchdaySlideshow.tsx");
    expect(source).toContain("SLIDE_DURATION = 4000");
    expect(source).toContain("window.setInterval");
    expect(source).toContain(
      'window.matchMedia("(prefers-reduced-motion: reduce)").matches',
    );
    // The reduced-motion check gates the interval registration itself.
    expect(source).toMatch(
      /if \(\s*photos\.length < 2 \|\|\s*paused \|\|\s*window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\s*\)\s*\{\s*\n\s*return;/,
    );
  });

  it("pauses on pointer and keyboard interaction and exposes arrow and direct slide controls", () => {
    const source = read("components/editorial/EditorialMatchdaySlideshow.tsx");
    expect(source).toContain("onMouseEnter={() => setPaused(true)}");
    expect(source).toContain("onMouseLeave={() => setPaused(false)}");
    expect(source).toContain("onFocusCapture={() => setPaused(true)}");
    expect(source).toContain("onBlurCapture={() => setPaused(false)}");
    expect(source).toContain('aria-label="Previous matchday photo"');
    expect(source).toContain('aria-label="Next matchday photo"');
    expect(source).toContain("selectSlide(index)");
  });
});

describe("editorial our story teaser", () => {
  it("renders the identity heading and a short about-page excerpt, linking to /club", async () => {
    const { default: EditorialStoryTeaser } = await import(
      "@/components/editorial/EditorialStoryTeaser"
    );
    const excerpt =
      "Lions Football Club was founded to give Columbus a club that competes with ambition and belongs to its community.";
    const html = await renderWithProviders(
      createElement(EditorialStoryTeaser, { excerpt }),
    );
    expect(html).toContain("A club shaped by");
    expect(html).toContain("<em>Columbus.</em>");
    expect(html).toContain(excerpt);
    expect(html).toContain('href="/club"');

    const source = read("components/editorial/EditorialStoryTeaser.tsx");
    expect(source).not.toMatch(/Columbus|A club shaped by/);
  });

  it("renders no excerpt paragraph when the story hasn't loaded yet", async () => {
    const { default: EditorialStoryTeaser } = await import(
      "@/components/editorial/EditorialStoryTeaser"
    );
    const html = await renderWithProviders(
      createElement(EditorialStoryTeaser, { excerpt: null }),
    );
    expect(html).not.toContain("<p>");
    expect(html).toContain('href="/club"');
  });
});

describe("editorial home: classic regression", () => {
  it("classic tenants never mount any editorial home section", async () => {
    for (const file of [
      "components/Nav.tsx",
      "components/Footer.tsx",
      "components/Hero.tsx",
      "components/NextMatchCard.tsx",
      "components/PhotoSlideshow.tsx",
      "app/(public)/layout.tsx",
    ]) {
      expect(read(file)).not.toMatch(/editorial/i);
    }
  });

  it("only editorial-template tenants reach EditorialHome from the shared homepage route", () => {
    const page = read("app/(public)/page.tsx");
    expect(page).toContain('club.siteTemplate === "editorial"');
    expect(page).toContain(
      'const EditorialHome = nextDynamic(\n  () => import("@/components/editorial/EditorialHome"),\n);',
    );
  });
});
