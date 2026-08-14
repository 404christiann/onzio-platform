import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Fixture } from "@/lib/data";

/**
 * Real editorial@1 Lions homepage contracts (Hero, Store, Matchday gallery,
 * sponsor carousel, Next Match, Matchday gallery, standings, "Our story"
 * teaser), plus
 * dispatch/layout wiring and a classic/clubhouse/academy regression check.
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
 *   EditorialNextMatch's pure date-resolution helpers
 *   (findNextFixture/monogram/fixtureKickoff), which need
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
  it("composes Hero, Store, sponsor carousel, Next Match, Matchday gallery, standings, and Our story teaser in that order", () => {
    const source = stripComments(read("components/editorial/EditorialHome.tsx"));
    const heroIndex = source.indexOf("<EditorialHero");
    const nextMatchIndex = source.indexOf("<EditorialNextMatch");
    const sponsorIndex = source.indexOf("<EditorialSponsorCarousel");
    const standingsIndex = source.indexOf("<EditorialStandingsTable");
    const storeIndex = source.indexOf("<EditorialHomeStore");
    const slideshowIndex = source.indexOf("<EditorialMatchdaySlideshow");
    const storyIndex = source.indexOf("<EditorialStoryTeaser");
    expect(heroIndex).toBeGreaterThan(-1);
    expect(storeIndex).toBeGreaterThan(heroIndex);
    expect(sponsorIndex).toBeGreaterThan(storeIndex);
    expect(nextMatchIndex).toBeGreaterThan(sponsorIndex);
    expect(slideshowIndex).toBeGreaterThan(nextMatchIndex);
    expect(standingsIndex).toBeGreaterThan(slideshowIndex);
    expect(storyIndex).toBeGreaterThan(standingsIndex);
  });

  it("forwards initialHeroContent from the tenant homepage straight through to EditorialHero, never re-fetching it itself", () => {
    const source = stripComments(read("components/editorial/EditorialHome.tsx"));
    expect(source).toContain("initialHeroContent");
    expect(source).toContain(
      "<EditorialHero initialHeroContent={initialHeroContent} />",
    );
  });

  it("keeps the requested sponsor and store surfaces but never renders checkout, kit-home, or season-selector content", () => {
    const files = [
      "components/editorial/EditorialHome.tsx",
      "components/editorial/EditorialHero.tsx",
      "components/editorial/EditorialNextMatch.tsx",
      "components/editorial/EditorialHomeStore.tsx",
      "components/editorial/EditorialMatchdaySlideshow.tsx",
      "components/editorial/EditorialStoryTeaser.tsx",
    ];
    for (const file of files) {
      expect(stripComments(read(file))).not.toMatch(
        /TierGate|checkout|Select size|kit-home|season-selector/i,
      );
    }
    expect(stripComments(read("components/editorial/EditorialHome.tsx"))).toContain(
      "<EditorialSponsorCarousel />",
    );
    expect(stripComments(read("components/editorial/EditorialHome.tsx"))).toContain(
      "<EditorialHomeStore />",
    );
  });

  it("renders the editorial sponsor carousel directly below the Shop using the marquee structure and dummy image fallback", () => {
    const source = read("components/editorial/EditorialSponsorCarousel.tsx");
    const css = read("styles/editorial.css");
    expect(source).toContain("fetchSiteSponsorLogos(\"carousel\", club.id)");
    expect(source).toContain("FALLBACK_SPONSORS");
    expect(source).toContain('"/images/sponsors/sponsor-placeholder.png"');
    expect(source).toContain('sponsor.logo_url.trim() || "/images/sponsors/sponsor-placeholder.png"');
    expect(source).toContain('className="editorial-sponsor-track"');
    expect(source).toContain('className="editorial-sponsor-logo"');
    expect(css).toContain('[data-site-template="editorial"] .editorial-sponsor-carousel');
    expect(css).toContain("width: clamp(190px, 18vw, 280px);");
    expect(css).not.toContain(
      "border: 1px solid color-mix(in srgb, var(--on-dark) 10%, transparent);",
    );
    expect(css).not.toContain(
      "background: color-mix(in srgb, var(--on-dark) 5%, transparent);",
    );
    expect(css).toContain("animation: editorial-sponsor-scroll 42s linear infinite;");
  });

  it("renders a compact interactive homepage kit showcase that hands off to the full shop", () => {
    const source = stripComments(read("components/editorial/EditorialHomeStore.tsx"));
    const css = read("styles/editorial.css");
    expect(source).toContain('fetchShopKitVariants("shop", club.id)');
    expect(source).toContain('PRODUCT_ORDER: ShopKitVariant[] = ["home", "away", "third"]');
    expect(source).toContain('useState<ShopKitVariant>("home")');
    expect(source).toContain("Three colors.");
    expect(source).toContain("One badge.");
    expect(source).toContain("Team Shop");
    expect(source).toContain('home: "Home kit"');
    expect(source).toContain('away: "Away kit"');
    expect(source).toContain('third: "Third kit"');
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain(
      "aria-selected={selectedProduct.variant === product.variant}",
    );
    expect(source).toContain("setSelectedVariant(product.variant)");
    expect(source).toContain("selectedProduct.title");
    expect(source).toContain("selectedProduct.description");
    expect(source).toContain('href="/shop"');
    expect(source).toContain("club.storeEnabled");
    expect(source).not.toContain("2026");
    expect(source).not.toContain("PRODUCT_PRICE");
    expect(source).not.toContain("editorial-home-store-card");
    expect(css).toContain('[data-site-template="editorial"] .editorial-home-store');
    expect(css).toContain('[data-site-template="editorial"] .editorial-home-store-tabs');
    expect(css).toContain('[data-site-template="editorial"] .editorial-home-store-tab[aria-selected="true"]');
    expect(css).toContain('[data-site-template="editorial"] .editorial-home-store-feature');
    expect(css).toContain('[data-site-template="editorial"] .editorial-home-store-detail a');
    expect(css).toMatch(
      /\.editorial-home-store-feature \{[^}]*background: linear-gradient\(\s*90deg,[^}]*var\(--paper\)[^}]*var\(--primary\)/,
    );
    expect(css).toMatch(
      /\.editorial-home-store-visual \{[^}]*border-right: 0;[^}]*background: transparent;/,
    );
    expect(css).toMatch(
      /\.editorial-home-store-detail \{[^}]*background: transparent;/,
    );
    expect(css).toMatch(
      /@media \(max-width: 800px\)[\s\S]*?\.editorial-home-store-feature \{[^}]*background: linear-gradient\(\s*180deg,/,
    );
  });

  it("renders Christian's supplied Lions standings table in the Diverse City table structure with the Lions crest row", () => {
    const source = read("components/editorial/EditorialStandingsTable.tsx");
    const css = read("styles/editorial.css");
    for (const literal of [
      "Lions Football Club",
      "Leal United FC",
      "Columbus Astray",
      "Fut Ohio SC",
      "Indy Gladiators SC",
      "Manu Ledesma Academy",
      "Ohio International FC",
      "Lightning SC",
      "Mahoning Trumbull United SC",
    ]) {
      expect(source).toContain(literal);
    }
    expect(source).toContain("goalDifference: 21");
    expect(source).toContain("goalDifference: -30");
    expect(source).toContain("points: 24");
    expect(source).toContain("useEditorialIdentity");
    expect(source).toContain("row.isClub && crestUrl");
    expect(source).toContain('className="editorial-standings-row editorial-standings-row-head"');
    expect(css).toContain('[data-site-template="editorial"] .editorial-standings-row');
    expect(css).toContain("grid-template-columns: minmax(360px, 1fr) repeat(6, 78px);");
    expect(css).toContain("background: #f9fafd;");
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
    expect(css).toContain("transform: translateY(-38px);");
    expect(css).toContain("width: min(104%, 740px);");
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

  it("returns null when there are no fixtures or none upcoming", async () => {
    const { findNextFixture } = await import("@/lib/editorial-fixtures");
    expect(findNextFixture([])).toBeNull();
    const onlyPast: Fixture[] = [
      { date: "2026-01-01", time: "12:00", opponent: "Past FC", home: true, venue: "TBD" },
    ];
    expect(findNextFixture(onlyPast)).toBeNull();
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
    expect(source).not.toContain("findLatestResult");
    expect(source).not.toContain("Latest result");
    expect(source).not.toContain('className="match-meta"');
    expect(source).toContain("<h2>Next match</h2>");
    expect(source).toContain("dateTimeLabel");
    expect(source).toContain("{next.competition ? <p>{next.competition}</p> : null}");
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
    expect(source).toContain('className="story-pillar-list"');
    expect(source).toContain('className="story-pillar-item"');
    expect(source).toContain(">Our identity</span>");
    expect(source).not.toContain('className="value-grid"');
    expect(source).not.toContain('className="value-card"');
    expect(source).not.toContain('String(index + 1).padStart(2, "0")');
    expect(source).toContain("identity?.highlights");
    expect(source).toContain('<Link href="/club/about">Our story</Link>');
    expect(source).not.toContain("Our story →");
    const css = read("styles/editorial.css");
    expect(css).toContain('[data-site-template="editorial"] .story-pillar-list');
    expect(css).toContain('[data-site-template="editorial"] .story-pillar-item');
    expect(css).toMatch(
      /\.story-copy > a \{[\s\S]*?width: min\(220px, 100%\);[\s\S]*?min-height: 58px;[\s\S]*?display: inline-flex;[\s\S]*?border-radius: 0;[\s\S]*?background: var\(--accent\);[\s\S]*?color: var\(--on-dark\);/,
    );
    expect(css).toMatch(
      /\.club-story \{[^}]*border-top: 1px solid var\(--line\);/,
    );
    expect(css).not.toContain(
      '[data-site-template="editorial"] .story-pillars {\n  border-top:',
    );
    expect(source).not.toMatch(/Columbus|A club shaped by/);
  });
});

describe("editorial typography", () => {
  it("matches the inspected soccer-platform-mockups typography values for the primary homepage headings", () => {
    const layout = read("app/layout.tsx");
    const css = read("styles/editorial.css");

    expect(layout).toContain("Geist");
    expect(layout).toContain("Geist_Mono");
    expect(layout).not.toContain("Barlow_Condensed");
    expect(layout).not.toContain('variable: "--font-editorial-display"');
    expect(layout).toContain('variable: "--font-academy-body"');
    expect(css).toContain("--editorial-display-font: var(--font-geist-sans), Arial, sans-serif;");
    expect(css).toContain("--editorial-body-font: var(--font-geist-sans), Arial, sans-serif;");
    expect(css).toContain("--editorial-display-weight: 850;");
    expect(css).toContain("--editorial-display-style: normal;");
    expect(css).toContain("--editorial-display-letter: -0.065em;");
    expect(css).toContain("--editorial-display-line: 0.88;");
    expect(css).toContain("font-family: var(--editorial-body-font);");
    expect(css).toContain("font-family: var(--editorial-display-font);");
    expect(css).toMatch(
      /\.hero h1 \{\s*\n\s*margin: 0;\s*\n\s*max-width: none;\s*\n\s*font-size: clamp\(3\.45rem, 6vw, 6\.8rem\);\s*\n\s*line-height: 0\.9;\s*\n\s*letter-spacing: -0\.055em;\s*\n\s*font-weight: 840;\s*\n\s*color: var\(--on-dark\);/,
    );
    expect(css).toMatch(
      /\.matchday-copy h2 \{\s*\n\s*margin: 0;\s*\n\s*color: var\(--on-dark\);\s*\n\s*font-size: clamp\(3rem, 6vw, 6\.25rem\);\s*\n\s*font-weight: 830;\s*\n\s*line-height: 0\.88;\s*\n\s*letter-spacing: -0\.055em;\s*\n\s*text-wrap: balance;/,
    );
    expect(css).toMatch(
      /\.editorial-home-store-head h2 \{\s*\n\s*margin: 22px 0 0;\s*\n\s*color: var\(--display\);\s*\n\s*font-size: clamp\(3\.3rem, 6\.4vw, 6\.4rem\);\s*\n\s*font-weight: 840;\s*\n\s*line-height: 0\.86;\s*\n\s*letter-spacing: -0\.06em;/,
    );
    expect(css).not.toContain("font-style: var(--editorial-display-style);");
    expect(css).not.toContain("font-weight: var(--editorial-display-weight);");
    expect(css).not.toContain("letter-spacing: var(--editorial-display-letter);");
    expect(css).not.toContain("line-height: var(--editorial-display-line);");
    expect(css).toContain("font: 650 0.68rem var(--font-geist-mono);");
    expect(css).toContain("font: 750 1.15rem var(--font-geist-mono);");
    expect(css).not.toMatch(
      /\[data-site-template="editorial"\] h1,\s*\n\[data-site-template="editorial"\] h2 \{\s*\n\s*text-transform: uppercase;/,
    );
    expect(css).toMatch(
      /\.store-heading h1 \{[\s\S]*?font-size: clamp\(3\.7rem, 6\.4vw, 7rem\);[\s\S]*?font-weight: 850;[\s\S]*?letter-spacing: -0\.06em;[\s\S]*?line-height: 0\.94;/,
    );
    expect(css).toMatch(
      /\.store-product-details h2 \{[\s\S]*?font-size: clamp\(2\.15rem, 3\.3vw, 4\.15rem\);[\s\S]*?font-weight: 820;[\s\S]*?letter-spacing: -0\.045em;[\s\S]*?line-height: 1\.06;/,
    );
    expect(css).toMatch(
      /\.story-heading h2 \{[\s\S]*?font-size: clamp\(3rem, 6vw, 6\.25rem\);[\s\S]*?font-weight: 800;[\s\S]*?line-height: 0\.9;[\s\S]*?letter-spacing: -0\.055em;/,
    );
    expect(css).toContain("overflow-wrap: anywhere;");
    expect(css).toContain('[data-site-template="editorial"] .hero h1,');
    expect(css).toContain('[data-site-template="editorial"] .story-heading h2,');
    expect(css).toContain('[data-site-template="editorial"] .club-page .interior-hero h1,');
    expect(css).toContain('[data-site-template="editorial"] .desktop-nav a,');
    expect(css).toContain('[data-site-template="editorial"] .footer-brand strong,');
  });
});

describe("editorial header nav", () => {
  it("gates the Store nav item on club.storeEnabled", () => {
    const source = read("components/editorial/EditorialHeader.tsx");
    expect(source).toContain("storeEnabled");
    expect(source).toMatch(/if \(storeEnabled\)/);
  });

  it("renders mobile navigation labels without numeric index badges", () => {
    const source = read("components/editorial/EditorialHeader.tsx");
    const css = read("styles/editorial.css");
    expect(source).not.toContain("indexLabel");
    expect(source).not.toContain("<small>0{index + 1}</small>");
    expect(css).not.toContain('[data-site-template="editorial"] .mobile-menu small');
  });

  it("shows a white-header affiliation lockup beside the crest using the same local US Soccer, FIFA, and UPSL assets as the shared nav", () => {
    const source = read("components/editorial/EditorialHeader.tsx");
    const css = read("styles/editorial.css");
    expect(source).toContain('className="editorial-affiliation-lockup"');
    expect(source).toContain("/images/logo/affiliations/us-soccer-color.png");
    expect(source).toContain("/images/logo/affiliations/fifa-color.png");
    expect(source).toContain("/images/logo/affiliations/upsl-color.png");
    expect(css).toContain('[data-site-template="editorial"] .editorial-affiliation-lockup');
    expect(css).toContain("@media (min-width: 1051px)");
    expect(css).toContain("margin-right: auto;");
    expect(css).toContain("width: clamp(88px, 9.4vw, 118px);");
    expect(css).toContain("gap: clamp(6px, 0.7vw, 10px);");
    expect(css).toContain("gap: clamp(10px, 1.1vw, 14px);");
    expect(css).toContain("margin-left: 0;");
    expect(css).toContain("transform: translateY(2px);");
    expect(css).toContain('[data-site-template="editorial"] .site-header[data-brand-visible="false"] .editorial-affiliation-lockup');
  });

  it("renders Schedule as a dropdown-only parent with Fixtures and Tryouts children", () => {
    const source = read("components/editorial/EditorialHeader.tsx");
    const css = read("styles/editorial.css");
    expect(source).toMatch(/label:\s*"Schedule"/);
    expect(source).toMatch(/label:\s*"Fixtures",\s*href:\s*"\/schedule"/);
    expect(source).toMatch(/label:\s*"Tryouts",\s*href:\s*"\/tryouts"/);
    expect(css).toContain('[data-site-template="editorial"] .nav-dropdown a::after');
    expect(css).toContain("display: none;");
    expect(css).toContain("width: max-content;");
    expect(css).toContain("min-width: 112px;");
    expect(css).toContain("padding: 10px 18px;");
  });

  it("strips the /_clubs/<slug> prefix before comparing active links, same as Nav.tsx", () => {
    const source = read("components/editorial/EditorialHeader.tsx");
    expect(source).toContain('rewrittenPathname.replace(/^\\/_clubs\\/[^/]+/, "")');
  });
});

describe("editorial footer attribution", () => {
  it("reuses the same tenant-scoped Powered by Onzio badge as the shared Diverse City footer", () => {
    const editorialFooter = read("components/editorial/EditorialFooter.tsx");
    const sharedFooter = read("components/Footer.tsx");
    const attribution = read("components/PoweredByOnzio.tsx");

    expect(editorialFooter).toContain(
      'import PoweredByOnzio from "@/components/PoweredByOnzio"',
    );
    expect(editorialFooter).toContain("<PoweredByOnzio");
    expect(sharedFooter).toContain(
      'import PoweredByOnzio from "@/components/PoweredByOnzio"',
    );
    expect(attribution).toContain("Powered by");
    expect(attribution).toContain('href="/admin/login"');
    expect(attribution).toContain('alt="Onzio"');
    expect(attribution).toContain("onzio-wordmark-white.png");
    expect(attribution).not.toMatch(/target=|rel=/);

    const css = read("styles/editorial.css");
    expect(css).toContain("grid-template-columns: 1fr auto 1fr;");
    expect(css).toContain(
      '.footer-bottom > span:not(.footer-bottom-right)',
    );
    expect(css).toContain("grid-template-columns: auto 1fr;");
    expect(css).toContain(
      '.footer-bottom > .footer-bottom-right',
    );
    expect(editorialFooter).toContain('className="footer-brand-lockup"');
    expect(editorialFooter).toContain(
      "identity?.shortName?.trim() || clubName",
    );
    expect(editorialFooter).toContain("<strong>{footerClubName}</strong>");
    expect(editorialFooter).toContain(
      "{new Date().getFullYear()} {footerClubName}",
    );
    expect(editorialFooter).toContain('className="footer-link-grid"');
    expect(editorialFooter).toContain('className="footer-connect"');
    expect(editorialFooter).toContain("storeEnabled ? <Link href=\"/store\">Store</Link> : null");
    expect(editorialFooter).toContain('className="footer-bottom-right"');
    expect(css).toContain("grid-template-areas: \"brand links connect\";");
    expect(css).toContain("width: clamp(84px, 7vw, 112px);");
    expect(css).toContain("border-top: 1px solid color-mix(in srgb, var(--on-dark) 14%, transparent);");
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
