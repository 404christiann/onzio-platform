import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Fixture } from "@/lib/data";

/**
 * Real editorial@1 Lions homepage contracts (Hero, Next Match, Matchday
 * gallery, "Our story" teaser), plus dispatch/layout wiring and a classic/
 * clubhouse/academy regression check.
 *
 * Adapted from the superseded claude/lions-fc-website-setup-ij0p7t reference
 * branch's tests/contracts/editorial-home.test.ts for this branch's real,
 * current schema and test infrastructure:
 * - club_identity no longer carries hero_headline_top/em/hero_intro or
 *   contact_email/contact_phone (Lions E1) -- the hero now reads
 *   homepage_hero_content (headline_line_one/two, intro) via an
 *   initialHeroContent prop, exactly like every other template's Hero.
 * - ClubIdentityContent now lives in lib/editorial-identity.ts, not
 *   lib/club-identity.ts.
 * - the real tenant layout is app/%5Fclubs/[slug]/layout.tsx and dispatch is
 *   components/HomePageClient.tsx, not app/(public)/layout.tsx or
 *   app/(public)/page.tsx (those files don't exist on this branch).
 * - the reference branch rendered components with react-dom/server via a
 *   dynamic `await import("@/components/editorial/...")`. That fails here:
 *   this repo's vitest.config.ts has no JSX-transform plugin (no other
 *   contract test in this repo renders a .tsx component either -- they are
 *   all source-scan contracts), so dynamically importing a "use client" .tsx
 *   component throws a vite import-analysis error on the JSX syntax. This
 *   file follows the established house convention instead: source-scan
 *   assertions for markup/behavior, plus real functional assertions against
 *   EditorialNextMatch's now-exported pure date-resolution helpers
 *   (findNextFixture/findLatestResult/monogram/fixtureKickoff), which need
 *   no JSX rendering at all.
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// Transcribed in the same shape as the real seeded first-team fixtures (see
// supabase/seed.sql), evaluated against the real system clock -- this suite
// runs in 2026, so the next fixture genuinely resolves to Capital City
// Athletic on 2026-08-15 and the latest played result to the 2026-07-11 win
// over Scioto Valley FC.
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

  it("forwards initialHeroContent from the tenant homepage straight through to EditorialHero, never re-fetching it itself", () => {
    const source = stripComments(read("components/editorial/EditorialHome.tsx"));
    expect(source).toContain("initialHeroContent");
    expect(source).toContain(
      "<EditorialHero initialHeroContent={initialHeroContent} />",
    );
  });

  it("never renders sponsor, store, kit, or season-selector content", () => {
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
  it("locks the headline to two lines via data-driven span/em, sourced from homepage_hero_content -- never hardcoded club copy or club_identity", () => {
    const source = read("components/editorial/EditorialHero.tsx");
    expect(source).toContain("<span>{headlineTop}</span>");
    expect(source).toContain("{headlineEm && <em>{headlineEm}</em>}");
    expect(source).toContain(
      "heroContent.headline_line_one.trim() || club.name",
    );
    expect(source).toContain("heroContent.headline_line_two.trim()");
    expect(source).toContain("heroContent.intro.trim()");
    expect(source).toContain('heroContent.primary_cta_href.trim() || "/schedule"');
    expect(source).toContain('heroContent.secondary_cta_href.trim() || "/roster"');

    // The reference branch's club_identity-driven hero copy no longer exists
    // on this schema (Lions E1) -- guard against it creeping back in, and
    // against any hardcoded club-specific copy.
    expect(source).not.toMatch(/identity\?\.\s*heroHeadline|identity\?\.\s*heroIntro/);
    expect(source).not.toMatch(/Capital City|Roar as One|Columbus|Lions Football Club/);
  });

  it("falls back to the club name when no server hero content is available yet, and client-fetches only in that case", () => {
    const source = read("components/editorial/EditorialHero.tsx");
    expect(source).toContain("initialHeroContent !== null");
    expect(source).toMatch(/if \(hasServerContent\) return;/);
    expect(source).toContain("fetchHomepageContent(club.id)");
    expect(source).toContain("EMPTY_HOMEPAGE_HERO_CONTENT");
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
  it("resolves the real next upcoming fixture", async () => {
    const { findNextFixture } = await import("@/lib/editorial-fixtures");
    const next = findNextFixture(LIONS_FIXTURES);
    expect(next?.opponent).toBe("Capital City Athletic");
    expect(next?.venue).toBe("Scioto Field");
    expect(next?.home).toBe(false);
    expect(next?.competition).toBe("Midwest Premier League");
  });

  it("resolves the real latest played result", async () => {
    const { findLatestResult } = await import("@/lib/editorial-fixtures");
    const latest = findLatestResult(LIONS_FIXTURES);
    // 2026-07-11 Lions 2-1 Scioto Valley FC (home win) is the most recent
    // fixture with both scores recorded and a kickoff in the past.
    expect(latest?.opponent).toBe("Scioto Valley FC");
    expect(latest?.roseCityScore).toBe(2);
    expect(latest?.opponentScore).toBe(1);
  });

  it("returns null for both when there are no fixtures, or none upcoming/played", async () => {
    const { findNextFixture, findLatestResult } = await import(
      "@/lib/editorial-fixtures"
    );
    expect(findNextFixture([])).toBeNull();
    expect(findLatestResult([])).toBeNull();
    const onlyFuture: Fixture[] = [
      { date: "2099-01-01", time: "12:00", opponent: "Future FC", home: true, venue: "TBD" },
    ];
    expect(findLatestResult(onlyFuture)).toBeNull();
  });

  it("falls back to a text monogram for opponents without a crest asset", async () => {
    const { monogram } = await import("@/lib/editorial-fixtures");
    expect(monogram("Scioto Valley FC")).toBe("SVF");
    expect(monogram("Lions Football Club")).toBe("LFC");

    const source = read("components/editorial/EditorialNextMatch.tsx");
    expect(source).toContain("next.opponentLogoUrl");
    expect(source).toContain("monogram(next.opponent)");
  });

  it("renders nothing while fixtures are still loading or when none are upcoming", () => {
    const source = read("components/editorial/EditorialNextMatch.tsx");
    expect(source).toMatch(/if \(!fixtures\) return null;/);
    expect(source).toMatch(/if \(!next\) return null;/);
  });
});

describe("editorial matchday slideshow", () => {
  it("renders photos in seeded order with no sorting/reversal applied", () => {
    const source = read("components/editorial/EditorialMatchdaySlideshow.tsx");
    expect(source).toContain("{photos.map((photo, index) => (");
    expect(source).not.toMatch(/photos\s*\.(sort|reverse)\(/);
    expect(source).toContain("photo.url");
  });

  it("hides the whole section gracefully when there are no photos", () => {
    const source = read("components/editorial/EditorialMatchdaySlideshow.tsx");
    expect(source).toContain("if (photos.length === 0) return null;");
  });

  it("drives the heading text from club_identity.slideshow_heading_top/em, never hardcoded per club", () => {
    const source = stripComments(read("components/editorial/EditorialMatchdaySlideshow.tsx"));
    expect(source).toContain("identity?.slideshowHeadingTop");
    expect(source).toContain("identity?.slideshowHeadingEm");
    expect(source).not.toMatch(/This is how|Columbus roars/);
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
  it("renders the identity heading and a short about-page excerpt, linking to /club/about", () => {
    const source = read("components/editorial/EditorialStoryTeaser.tsx");
    expect(source).toContain("identity?.identityHeadingTop");
    expect(source).toContain("identity?.identityHeadingEm");
    expect(source).toContain("{excerpt && <p>{excerpt}</p>}");
    expect(source).toContain("identity?.foundedYear");
    expect(source).toContain("identity?.venue");
    expect(source).toContain('className="story-meta"');
    expect(source).toContain('className="story-pillars"');
    expect(source).toContain("identity?.highlights");
    expect(source).toContain('<Link href="/club/about">Our story');
    expect(source).not.toMatch(/Columbus|A club shaped by/);
  });
});

describe("editorial header nav", () => {
  it("gates the Store nav item on club.storeEnabled", () => {
    const source = read("components/editorial/EditorialHeader.tsx");
    expect(source).toContain("storeEnabled");
    expect(source).toMatch(/if \(storeEnabled\)/);
  });

  it("renders Schedule as a dropdown-only parent with Fixtures and Tryouts children", () => {
    const source = read("components/editorial/EditorialHeader.tsx");
    expect(source).toMatch(/label:\s*"Schedule"/);
    expect(source).toMatch(/label:\s*"Fixtures",\s*href:\s*"\/schedule"/);
    expect(source).toMatch(/label:\s*"Tryouts",\s*href:\s*"\/tryouts"/);
  });

  it("strips the /_clubs/<slug> prefix before comparing active links, same as Nav.tsx", () => {
    const source = read("components/editorial/EditorialHeader.tsx");
    expect(source).toContain('rewrittenPathname.replace(/^\\/_clubs\\/[^/]+/, "")');
  });
});

describe("editorial home: classic regression", () => {
  it("classic/clubhouse/academy chrome and shared homepage sections never mount any editorial content", () => {
    for (const file of [
      "components/Nav.tsx",
      "components/Footer.tsx",
      "components/Hero.tsx",
      "components/NextMatchCard.tsx",
      "components/PhotoSlideshow.tsx",
      "components/TemplateFontScope.tsx",
    ]) {
      expect(read(file)).not.toMatch(/editorial/i);
    }
  });

  it("only editorial@1 tenants reach EditorialHome from the shared homepage dispatch", () => {
    const dispatch = read("components/HomePageClient.tsx");
    expect(dispatch).toContain('club.presentationTemplateKey === "editorial@1"');
    expect(dispatch).toContain(
      'nextDynamic(() => import("@/components/editorial/EditorialHome")',
    );
  });

  it("only editorial@1 tenants get the custom EditorialShell in the tenant layout; every other template keeps Nav/Footer/TemplateFontScope byte-identical", () => {
    const layout = read("app/%5Fclubs/[slug]/layout.tsx");
    expect(layout).toContain('club.presentationTemplateKey === "editorial@1"');
    expect(layout).toContain("<EditorialShell>{children}</EditorialShell>");
    // The non-editorial branch must still render exactly what every other
    // template relies on.
    const classicBranch = layout.slice(layout.lastIndexOf('if (club.presentationTemplateKey === "editorial@1")'));
    expect(classicBranch).toContain("<Nav />");
    expect(classicBranch).toContain("<main>{children}</main>");
    expect(classicBranch).toContain("<Footer />");
    expect(classicBranch).toContain("<TemplateFontScope");
  });
});
