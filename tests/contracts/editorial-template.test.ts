import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Editorial site-template shell contracts.
 *
 * The scroll-transition listener itself runs only in a real browser, so the
 * header interaction contract follows this repository's existing component
 * conventions: static source assertions for the browser-only behavior
 * (matching tests/contracts/navbar-affiliation-media.test.ts and
 * homepage-slideshow.test.ts) plus real server renders through
 * react-dom/server for everything observable at SSR time.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
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
    return createElement("a", {
      "data-mock-image": true,
      "data-src": src,
      "data-alt": alt,
    });
  },
}));

let mockPathname = "/";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LIONS_THEME = {
  primary: "#1B2958",
  secondary: "#AD3234",
  accent: "#F0F0F0",
};

const LIONS_IDENTITY = {
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
  heroIntro: "",
  slideshowHeadingTop: "",
  slideshowHeadingEm: "",
  identityHeadingTop: "",
  identityHeadingEm: "",
  storyHeadingTop: "",
  storyHeadingEm: "",
  mission: "",
  highlights: [],
};

const LIONS_SOCIAL_LINKS = [
  {
    id: "instagram" as const,
    label: "Instagram",
    href: "https://www.instagram.com/columbuslionsfc",
    icon: "/images/logo/instagramLogo.svg",
    sort_order: 0,
    updated_at: "",
  },
  {
    id: "youtube" as const,
    label: "YouTube",
    href: "https://www.youtube.com/@lionsfootballclub-q3p",
    icon: "/images/logo/youtubeLogo.svg",
    sort_order: 1,
    updated_at: "",
  },
];

async function renderShell(pathname: string) {
  mockPathname = pathname;
  const { default: EditorialShell } = await import(
    "@/components/editorial/EditorialShell"
  );
  return renderToStaticMarkup(
    createElement(EditorialShell, {
      clubName: "Lions Football Club",
      clubInitials: "LFC",
      theme: LIONS_THEME,
      crestUrl: "https://storage.example/onzio-media/lions/crest.webp",
      crestOnDarkUrl:
        "https://storage.example/onzio-media/lions/crest-dark.webp",
      identity: LIONS_IDENTITY,
      socialLinks: LIONS_SOCIAL_LINKS,
      fontClassName: "font-scope-sans font-scope-mono",
      children: createElement("p", null, "page body"),
    }),
  );
}

describe("template dispatch", () => {
  const layout = read("app/%5Fclubs/[slug]/layout.tsx");

  it("branches on the tenant's site template, not on slug", () => {
    expect(layout).toContain('club.siteTemplate === "editorial"');
    expect(layout).toContain("EditorialShell");
    expect(layout).not.toMatch(/slug\s*===\s*["']lions["']/);
  });

  it("keeps the classic branch on the untouched shared components", () => {
    expect(layout).toContain("<Nav />");
    expect(layout).toContain("<main>{children}</main>");
    expect(layout).toContain("<Footer />");
    // The classic JSX branch must not carry the editorial wrapper marker.
    expect(layout).not.toContain("data-site-template");
  });

  it("loads the Geist scope only through the editorial branch", () => {
    expect(layout).toContain("editorialFontClassName");
    expect(read("app/layout.tsx")).not.toContain("editorial");
    expect(read("styles/globals.css")).not.toMatch(/geist/i);
  });

  it("classic tenants never mount editorial components", () => {
    for (const path of [
      "components/Nav.tsx",
      "components/Footer.tsx",
      "app/(public)/layout.tsx",
    ]) {
      expect(read(path)).not.toMatch(/editorial/i);
    }
  });

  it("classic home renders without editorial markup and editorial home renders the real sections", async () => {
    mockPathname = "/";
    const { default: HomePage } = await import("@/app/(public)/page");
    const { ClubContextProvider } = await import(
      "@/components/ClubContextProvider"
    );
    const base = {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "alpha",
      name: "Alpha FC",
      primaryDomain: "alpha-onzio.vercel.app",
      lifecycle: "active" as const,
      publicAccess: "live" as const,
      tier: "pro" as const,
      role: null,
    };

    const classic = renderToStaticMarkup(
      createElement(ClubContextProvider, {
        club: { ...base, siteTemplate: "classic" as const },
        children: createElement(HomePage),
      }),
    );
    expect(classic).not.toMatch(
      /class="hero"|hero-crest|match-feature|matchday-slideshow|club-story/,
    );

    // The homepage reaches the real editorial sections through a code-split
    // dynamic import (so classic tenants never load the editorial chunk),
    // which only resolves inside a real Next.js server render. Assert the
    // branch in source and render the composed home component directly.
    const page = read("app/(public)/page.tsx");
    expect(page).toContain('club.siteTemplate === "editorial"');
    expect(page).toContain("EditorialHome");

    const { default: EditorialHome } = await import(
      "@/components/editorial/EditorialHome"
    );
    const editorial = renderToStaticMarkup(
      createElement(ClubContextProvider, {
        club: {
          ...base,
          slug: "lions",
          name: "Lions Football Club",
          tier: "starter" as const,
          siteTemplate: "editorial" as const,
        },
        children: createElement(EditorialHome),
      }),
    );
    // Rendered without EditorialShell's EditorialIdentityProvider, the hero
    // still renders safely, falling back to the club name for the headline.
    expect(editorial).toContain('class="hero"');
    expect(editorial).toContain("Lions");
  });
});

describe("editorial shell", () => {
  it("marks the wrapper and injects the club custom properties", async () => {
    const html = await renderShell("/");
    expect(html).toContain('data-site-template="editorial"');
    expect(html).toContain("--club-primary:#1B2958");
    expect(html).toContain("--club-secondary:#AD3234");
    expect(html).toContain("--club-accent:#F0F0F0");
  });

  it("applies the font scope on the wrapper, mounts header, main, and footer", async () => {
    const html = await renderShell("/");
    expect(html).toContain("font-scope-sans font-scope-mono");
    expect(html).toContain('class="site-header"');
    expect(html).toContain('class="public-main"');
    expect(html).toContain("page body");
    expect(html).toContain('class="site-footer"');
  });
});

describe("editorial header", () => {
  const source = read("components/editorial/EditorialHeader.tsx");

  it("starts transparent with a hidden crest on the homepage only", async () => {
    const home = await renderShell("/");
    expect(home).toContain('data-home="true"');
    expect(home).toContain('data-scrolled="false"');
    expect(home).toContain('data-brand-visible="false"');

    const interior = await renderShell("/roster");
    expect(interior).toContain('data-home="false"');
    expect(interior).toContain('data-brand-visible="true"');
  });

  it("transitions on any scroll on the homepage and after 24px on interior routes", () => {
    expect(source).toContain(
      'window.scrollY > (pathname === "/" ? 0 : 24)',
    );
    expect(source).toContain('window.addEventListener("scroll", updateHeader');
    expect(source).toContain(
      'window.removeEventListener("scroll", updateHeader)',
    );
  });

  it("locks background scroll while the mobile menu is open", () => {
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain(
      "document.body.style.overflow = previousOverflow",
    );
  });

  it("navigates Home, Roster, and Schedule with no Store link", async () => {
    const html = await renderShell("/roster");
    expect(html).toContain(">Home</a>");
    expect(html).toContain(">Roster</a>");
    expect(html).toContain(">Schedule</a>");
    expect(html).not.toMatch(/store/i);
    expect(html).not.toMatch(/admin/i);
    const code = stripComments(source);
    expect(code).not.toMatch(/store/i);
    expect(code).not.toMatch(/admin/i);
    expect(code).not.toMatch(/tier/i);
  });

  it("marks the active interior route", async () => {
    const html = await renderShell("/roster");
    expect(html).toMatch(
      /data-active="true"[^>]*href="\/roster"|href="\/roster"[^>]*data-active="true"/,
    );
  });

  it("uses the mockup header geometry and an anchored full-height mobile panel", () => {
    const css = read("styles/editorial.css");
    expect(css).toContain("height: 72px;");
    expect(css).toMatch(/width: 70px;\s*height: 69px;/);
    expect(css).toContain("height: 64px;");
    expect(css).toMatch(/width: 66px;\s*height: 65px;/);
    expect(css).toMatch(/position: absolute;\s*top: 72px;/);
    expect(css).toContain("height: calc(100dvh - 72px);");
    expect(css).toContain("height: calc(100dvh - 64px);");
  });
});

describe("editorial footer", () => {
  it("renders the seeded Lions social destinations", async () => {
    const html = await renderShell("/");
    expect(html).toContain('href="https://www.instagram.com/columbuslionsfc"');
    expect(html).toContain(
      'href="https://www.youtube.com/@lionsfootballclub-q3p"',
    );
    // The test fixture must match the actual seeded rows.
    const seed = read("supabase/seed.sql");
    expect(seed).toContain("https://www.instagram.com/columbuslionsfc");
    expect(seed).toContain("https://www.youtube.com/@lionsfootballclub-q3p");
  });

  it("renders Explore and Matchday content from club identity", async () => {
    const html = await renderShell("/");
    expect(html).toContain(">Explore</span>");
    expect(html).toContain('href="/roster"');
    expect(html).toContain('href="/schedule"');
    expect(html).toContain("Scioto Field");
    expect(html).toContain("1814 W Broad St, Columbus, OH 43223");
    expect(html).toContain('href="mailto:hello@lionsfc.example"');
  });

  it("never mounts sponsor content and has no Store link", async () => {
    const html = await renderShell("/");
    expect(html).not.toMatch(/sponsor|partner/i);
    expect(html).not.toMatch(/store/i);
    const code = stripComments(read("components/editorial/EditorialFooter.tsx"));
    expect(code).not.toMatch(/sponsor|partner/i);
  });

  it("falls back to the full-color crest when no dark variant exists", () => {
    const source = read("lib/club-identity.ts");
    expect(source).toContain("crestOnDarkUrl: crestOnDarkUrl || crestUrl");
  });
});

describe("editorial motion", () => {
  const source = read("components/editorial/EditorialMotion.tsx");

  it("exits before animating under prefers-reduced-motion", () => {
    expect(source).toContain('reduceMotion: "(prefers-reduced-motion: reduce)"');
    expect(source).toContain("if (reduceMotion) return;");
  });

  it("branches desktop and mobile through gsap.matchMedia", () => {
    expect(source).toContain("gsap.matchMedia()");
    expect(source).toContain('desktop: "(min-width: 801px)"');
    expect(source).toContain('mobile: "(max-width: 800px)"');
  });

  it("cleans up triggers on unmount and navigation", () => {
    expect(source).toContain("media.revert();");
    expect(source).toContain("context.revert();");
    expect(source).toContain("}, [pathname]);");
  });

  it("is a safe no-op while no animation targets exist", async () => {
    expect(source).toContain("if (!root) return;");
    expect(source).toContain("if (!cards.length) return;");
    mockPathname = "/";
    const { default: EditorialMotion } = await import(
      "@/components/editorial/EditorialMotion"
    );
    expect(renderToStaticMarkup(createElement(EditorialMotion))).toBe("");
  });
});

describe("editorial stylesheet scoping", () => {
  const css = read("styles/editorial.css");

  it("scopes every rule under the editorial wrapper", () => {
    // No selector may target bare html/body/:root or start unscoped.
    expect(css).not.toMatch(/^(html|body|:root)[\s,{[.:]/m);
    expect(css).not.toMatch(/^\.[a-z]/m);
    const selectors = css.match(/^[^\s@/}][^{\n]*\{/gm) ?? [];
    expect(selectors.length).toBeGreaterThan(20);
    for (const selector of selectors) {
      expect(selector.startsWith('[data-site-template="editorial"]')).toBe(
        true,
      );
    }
  });

  it("derives the editorial tokens from the injected club colors", () => {
    expect(css).toContain(
      "--primary-deep: color-mix(in srgb, var(--club-primary) 74%, #05070f);",
    );
    expect(css).toContain(
      "--accent-bright: color-mix(in srgb, var(--club-secondary) 70%, #fff);",
    );
    expect(css).toContain("--pad-x: clamp(20px, 5vw, 72px);");
    expect(css).toContain("--sec-y: clamp(56px, 8vw, 104px);");
    // No club hex values may be hard-coded into the stylesheet.
    expect(css).not.toMatch(/#1B2958|#AD3234/i);
  });

  it("leaves the classic stylesheet untouched by this package", () => {
    expect(read("styles/globals.css")).not.toMatch(/editorial|geist/i);
  });
});
