import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const EXPECTED_NAV_LINKS = [
  ["Home", "/"],
  ["Academy", "/academy"],
  ["Youth Club", "/youth-club"],
  ["Senior Club", "/senior-club"],
  ["UPSL", "/upsl"],
  ["Merch", "/merch"],
  ["About", "/about"],
  ["Contact", "/contact"],
] as const;

describe("pathway Presidential White navigation", () => {
  it("preserves the pathway routes, active states, and booking destination", () => {
    const component = read("components/pathway/PathwayNav.tsx");

    for (const [label, href] of EXPECTED_NAV_LINKS) {
      expect(component).toContain(`{ label: "${label}", href: "${href}" }`);
    }

    const linksBlock = component.slice(
      component.indexOf("const pathwayNavLinks"),
      component.indexOf("];", component.indexOf("const pathwayNavLinks")),
    );
    let cursor = -1;
    for (const [label, href] of EXPECTED_NAV_LINKS) {
      const next = linksBlock.indexOf(
        `{ label: "${label}", href: "${href}" }`,
        cursor + 1,
      );
      expect(next, `${label} should retain its nav order`).toBeGreaterThan(cursor);
      cursor = next;
    }

    expect(component).toContain(
      'const primaryCta: NavLink = { label: "Book Training", href: "/book-training" };',
    );
    expect(component).toContain("<PathwayTrainingTrigger");
    expect(component).toContain('href="/"');
    expect(component).toContain('data-active={active}');
    expect(component).toContain('aria-current={active ? "page" : undefined}');
    expect(component).toContain(
      'data-active={isLinkActive(pathname, primaryCta.href)}',
    );
    expect(component).toMatch(
      /aria-current=\{\s*isLinkActive\(pathname, primaryCta\.href\)\s*\?\s*"page"\s*:\s*undefined\s*\}/,
    );
    expect(component).toContain(
      'return pathname === href || pathname.startsWith(`${href}/`);',
    );
    expect(component).toContain(
      'const upslRosterLink: NavLink = { label: "Roster", href: "/roster" };',
    );
    expect(component).toContain(
      'const upslSectionActive = isLinkActive(pathname, "/upsl") || isLinkActive(pathname, upslRosterLink.href) || isLinkActive(pathname, upslFixturesLink.href);',
    );
  });

  it("adds an accessible UPSL roster disclosure without creating an eighth top-level tab", () => {
    const component = read("components/pathway/PathwayNav.tsx");

    expect(component).toContain('className="pathway-nav-item pathway-nav-item-upsl"');
    expect(component).toContain('className="pathway-nav-parent-link"');
    expect(component).toContain('className="pathway-nav-disclosure"');
    expect(component).toContain('aria-expanded={desktopUpslOpen}');
    expect(component).toContain('aria-controls="pathway-upsl-desktop-menu"');
    expect(component).toContain('aria-label="Toggle UPSL navigation"');
    expect(component).toContain('id="pathway-upsl-desktop-menu"');
    expect(component).toContain('className="pathway-nav-dropdown"');
    expect(component).toContain('href={upslRosterLink.href}');
    expect(component).toContain('{upslRosterLink.label}');
    expect(component).toContain('aria-current={pathname === "/upsl" ? "page" : undefined}');
    expect(component).toContain(
      'aria-current={pathname === upslRosterLink.href ? "page" : undefined}',
    );
    expect(component).toContain("desktopUpslButtonRef.current?.focus()");
    expect(component).toContain('event.key !== "Escape"');
    expect(component).toContain("desktopUpslRef.current?.contains");

    expect(component).toContain('className="pathway-mobile-nav-group"');
    expect(component).toContain('className="pathway-mobile-nav-row"');
    expect(component).toContain('className="pathway-mobile-nav-disclosure"');
    expect(component).toContain('aria-expanded={mobileUpslOpen}');
    expect(component).toContain('aria-controls="pathway-upsl-mobile-menu"');
    expect(component).toContain('id="pathway-upsl-mobile-menu"');
    expect(component).toContain('className="pathway-mobile-nav-children"');
    expect(component).not.toContain('{ label: "Roster", href: "/roster" },');
  });

  it("keeps tenant branding and accessible responsive-menu behavior", () => {
    const component = read("components/pathway/PathwayNav.tsx");

    expect(component).toContain("useClubContext()");
    expect(component).toContain("useClubBranding()");
    expect(component).toContain("clubLogoUrl");
    expect(component).toContain("<Image");
    expect(component).toContain('imageDeliveryProps("club-logo")');
    expect(component).toContain("{club.name}");
    expect(component).toContain("{clubInitials}");
    expect(component).toContain('aria-label={`${club.name} home`}');
    expect(component).not.toContain(
      'aria-current={pathname === "/" ? "page" : undefined}',
    );
    expect(component).not.toContain("Manu Ledesma Academy");
    expect(component).not.toContain("manu-ledesma-academy");
    expect(component).not.toMatch(/#(?:002b80|fc6601|077df2)/i);

    expect(component).toContain('type="button"');
    expect(component).toContain("aria-expanded={open}");
    expect(component).toContain('aria-controls="pathway-mobile-navigation"');
    expect(component).toContain(
      'aria-label={open ? "Close navigation" : "Open navigation"}',
    );
    expect(component).toContain('aria-label="Mobile navigation"');
    expect(component).toContain('id="pathway-mobile-navigation"');
    expect(component).toContain('onClick={() => setOpen(false)}');
    expect(component).toContain("document.body.style.overflow = \"hidden\"");
    expect(component).toContain("setOpen(false);");
  });

  it("places the shared US Soccer, FIFA, and UPSL lockup beside the crest", () => {
    const nav = read("components/pathway/PathwayNav.tsx");
    const affiliations = read(
      "components/pathway/PathwayAffiliationBar.tsx",
    );
    const shell = read("components/pathway/PathwayShell.tsx");
    const css = read("styles/pathway.css");
    const chromeBlock = css.slice(
      css.indexOf("/* ============ TOP RAIL + AFFILIATION LOCKUP"),
      css.indexOf("/* ============ MAIN ============", css.indexOf("TOP RAIL")),
    );

    expect(nav).toContain(
      'import PathwayAffiliationBar from "@/components/pathway/PathwayAffiliationBar"',
    );
    expect(nav).toMatch(
      /<div className="pathway-identity-lockup">[\s\S]*<\/Link>\s*<PathwayAffiliationBar \/>\s*<\/div>\s*<nav className="pathway-nav-row"/,
    );
    expect(shell).toContain(
      '<div className="pathway-top-rail" aria-hidden="true" />',
    );
    expect(shell).not.toContain("<PathwayAffiliationBar />");

    expect(affiliations).toContain('aria-label="Club affiliations"');
    expect(affiliations).toContain(
      "/images/logo/affiliations/us-soccer-color.png",
    );
    expect(affiliations).toContain(
      "/images/logo/affiliations/fifa-color.png",
    );
    expect(affiliations).toContain(
      "/images/logo/affiliations/upsl-color.png",
    );
    expect(affiliations).toContain("<ResilientImage");
    expect(affiliations).toContain('imageDeliveryProps("small-graphic")');
    expect(affiliations).not.toContain("pathway-affiliation-placeholder");
    expect(affiliations).not.toContain('aria-hidden="true">\n      <span');

    expect(chromeBlock).toContain(".pathway-top-rail");
    expect(chromeBlock).toContain("height: var(--bar-h);");
    expect(chromeBlock).toContain(".pathway-affiliation-lockup");
    expect(chromeBlock).toContain(".pathway-affiliation-divider");
    expect(chromeBlock).toContain(".pathway-affiliation-us-soccer");
    expect(chromeBlock).toContain(".pathway-affiliation-fifa");
    expect(chromeBlock).toContain(".pathway-affiliation-upsl");
    expect(chromeBlock).toContain("display: none;");
    expect(chromeBlock).not.toContain("pathway-affiliation-placeholder");
    expect(chromeBlock).not.toMatch(/#(?:002b80|fc6601|077df2)/i);

    const selectorLines = chromeBlock
      .split("\n")
      .filter((line) => line.includes(".pathway-"));
    expect(selectorLines.length).toBeGreaterThan(0);
    expect(
      selectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
  });

  it("uses the selected Sora voice for route links without changing the CTA", () => {
    const layout = read("app/layout.tsx");
    const css = read("styles/pathway.css");
    const desktopRouteRule = css.match(
      /\.pathway-nav-link,\s*\[data-site-template="pathway"\] \.pathway-nav-parent-link\s*\{[^}]+\}/,
    )?.[0];
    const mobileRouteRule = css.match(
      /\.pathway-mobile-nav-link\s*\{[^}]+\}/,
    )?.[0];
    const ctaRule = css.match(/\.pathway-nav-cta\s*\{[^}]+\}/)?.[0];

    expect(layout).toContain("Sora,");
    expect(layout).toContain("const pathwayNav = Sora({");
    expect(layout).toContain('variable: "--font-pathway-nav"');
    expect(layout).toContain('weight: "500"');
    expect(layout).toContain("${pathwayNav.variable}");
    expect(css).toContain(
      "--pathway-nav-font: var(--font-pathway-nav), var(--pathway-body-font);",
    );
    expect(desktopRouteRule).toContain(
      "font-family: var(--pathway-nav-font);",
    );
    expect(desktopRouteRule).toContain("font-weight: 500;");
    expect(desktopRouteRule).toContain("letter-spacing: 0;");
    expect(mobileRouteRule).toContain(
      "font-family: var(--pathway-nav-font);",
    );
    expect(mobileRouteRule).toContain("font-weight: 500;");
    expect(mobileRouteRule).toContain("letter-spacing: 0;");
    expect(ctaRule).not.toContain("font-family: var(--pathway-nav-font);");
    expect(css).not.toContain("fonts.googleapis.com");
  });

  it("implements the crisp single-tier white composition without CSS bleed", () => {
    const nav = read("components/pathway/PathwayNav.tsx");
    const css = read("styles/pathway.css");
    const block = css.slice(
      css.indexOf("/* ============ NAV — PRESIDENTIAL WHITE"),
      css.indexOf("/* ============ MAIN ============", css.indexOf("PRESIDENTIAL WHITE")),
    );
    const headerRule = block.match(/\.pathway-header\s*\{[^}]+\}/)?.[0];
    const rowRule = block.match(/\.pathway-brand-row\s*\{[^}]+\}/)?.[0];
    const identityRule = block.match(
      /\.pathway-identity-lockup\s*\{[^}]+\}/,
    )?.[0];
    const brandRule = block.match(/\.pathway-brand-lockup\s*\{[^}]+\}/)?.[0];
    const brandImageRule = block.match(
      /\.pathway-brand-lockup img\s*\{[^}]+\}/,
    )?.[0];
    const navRule = block.match(/\.pathway-nav-row\s*\{[^}]+\}/)?.[0];
    const desktopCtaRule = block.match(
      /\.pathway-nav-cta-desktop\s*\{[^}]+\}/,
    )?.[0];
    const compactBlock = block.slice(
      block.indexOf("@media (max-width: 1100px)"),
      block.indexOf("@media (max-width: 940px)"),
    );
    const compactRowRule = compactBlock.match(
      /\.pathway-brand-row\s*\{[^}]+\}/,
    )?.[0];
    const compactNavRule = compactBlock.match(
      /\.pathway-nav-row\s*\{[^}]+\}/,
    )?.[0];
    const compactAffiliationRule = compactBlock.match(
      /\.pathway-affiliation-lockup\s*\{[^}]+\}/,
    )?.[0];
    const compactAffiliationMarksRule = compactBlock.match(
      /\.pathway-affiliation-lockup > div\s*\{[^}]+\}/,
    )?.[0];
    const mobileBlock = block.slice(
      block.indexOf("@media (max-width: 940px)"),
      block.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    const mobileRowRule = mobileBlock.match(
      /\.pathway-brand-row\s*\{[^}]+\}/,
    )?.[0];
    const mobileBrandRule = mobileBlock.match(
      /\.pathway-brand-lockup\s*\{[^}]+\}/,
    )?.[0];
    const mobileIdentityRule = mobileBlock.match(
      /\.pathway-identity-lockup\s*\{[^}]+\}/,
    )?.[0];
    const mobileBrandImageRule = mobileBlock.match(
      /\.pathway-brand-lockup img,\s*\[data-site-template="pathway"\] \.pathway-brand-initials\s*\{[^}]+\}/,
    )?.[0];
    const mobileHiddenRule = mobileBlock.match(
      /\.pathway-nav-row,\s*\[data-site-template="pathway"\] \.pathway-nav-cta-desktop,\s*\[data-site-template="pathway"\] \.pathway-affiliation-lockup\s*\{[^}]+\}/,
    )?.[0];
    const mobileMenuRule = mobileBlock.match(
      /\.pathway-menu-button\s*\{[^}]+\}/,
    )?.[0];
    const activeRule = block.match(
      /\.pathway-nav-link\[data-active="true"\],\s*\[data-site-template="pathway"\] \.pathway-nav-parent-link\[data-active="true"\]\s*\{[^}]+\}/,
    )?.[0];

    expect(headerRule).toContain("background: var(--panel);");
    expect(headerRule).toContain("border-bottom: 1px solid var(--line);");
    expect(headerRule).not.toMatch(/backdrop-filter|box-shadow/);
    expect(rowRule).toContain("display: grid;");
    expect(rowRule).toContain(
      "grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);",
    );
    expect(rowRule).toContain("min-height: 86px;");
    expect(rowRule).toContain("padding: 4px clamp(20px, 3.2vw, 48px);");
    expect(identityRule).toContain("display: flex;");
    expect(identityRule).toContain("min-width: 0;");
    expect(identityRule).toContain("justify-self: start;");
    expect(identityRule).toContain("gap: 12px;");
    expect(brandRule).toContain("display: grid;");
    expect(brandRule).toContain("place-items: center;");
    expect(brandRule).toContain("width: 84px;");
    expect(brandRule).toContain("height: 84px;");
    expect(brandImageRule).toContain("width: 84px;");
    expect(brandImageRule).toContain("height: 84px;");
    expect(navRule).toContain("justify-self: center;");
    expect(navRule).toContain("min-width: 0;");
    expect(desktopCtaRule).toContain("justify-self: end;");
    expect(rowRule).not.toMatch(/transform|translate|margin-/);
    expect(identityRule).not.toMatch(/transform|translate|margin-/);
    expect(
      block.match(
        /grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);/g,
      ),
    ).toHaveLength(2);
    expect(nav).toContain("width={84}");
    expect(nav).toContain("height={84}");
    expect(compactRowRule).toContain(
      "grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);",
    );
    expect(compactRowRule).toContain("gap: clamp(8px, 1.2vw, 14px);");
    expect(compactRowRule).toContain(
      "padding-inline: clamp(18px, 2.5vw, 30px);",
    );
    expect(compactNavRule).toContain("gap: clamp(6px, 0.7vw, 8px);");
    expect(compactAffiliationRule).toContain("gap: 10px;");
    expect(compactAffiliationMarksRule).toContain("gap: 9px;");
    expect(mobileRowRule).toContain("min-height: 78px;");
    expect(mobileRowRule).toContain(
      "grid-template-columns: minmax(0, 1fr) auto;",
    );
    expect(mobileRowRule).toContain("gap: 14px;");
    expect(mobileRowRule).toContain(
      "padding: 10px clamp(16px, 5vw, 32px);",
    );
    expect(mobileBrandRule).toContain("width: auto;");
    expect(mobileBrandRule).toContain("height: auto;");
    expect(mobileIdentityRule).toContain("min-width: 0;");
    expect(mobileBrandImageRule).toContain("width: 48px;");
    expect(mobileBrandImageRule).toContain("height: 48px;");
    expect(mobileHiddenRule).toContain(".pathway-nav-row,");
    expect(mobileHiddenRule).toContain(".pathway-nav-cta-desktop,");
    expect(mobileHiddenRule).toContain(".pathway-affiliation-lockup");
    expect(mobileHiddenRule).toContain("display: none;");
    expect(mobileMenuRule).toContain("display: block;");
    expect(activeRule).toContain("color: var(--primary);");
    expect(block).toContain("background: var(--accent);");
    expect(block).toContain("@media (max-width: 1100px)");
    expect(block).toContain("@media (max-width: 940px)");
    expect(block).toContain("grid-template-columns: minmax(0, 1fr) auto;");
    expect(block).toContain("height: calc(100dvh - 78px);");
    expect(block).toContain(".pathway-nav-dropdown");
    expect(block).toContain(".pathway-mobile-nav-row");
    expect(block).toContain("grid-template-columns: minmax(0, 1fr) 44px;");
    expect(block).toContain(".pathway-mobile-nav-children");
    expect(block).toContain("@media (prefers-reduced-motion: reduce)");
    expect(block).not.toContain("100vw");
    expect(block).not.toMatch(/#(?:002b80|fc6601|077df2)/i);

    const selectorLines = block
      .split("\n")
      .filter((line) => line.includes(".pathway-"));
    expect(selectorLines.length).toBeGreaterThan(0);
    expect(
      selectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
  });

  it("adds tenant branding and the shared Powered by Onzio attribution to the footer", () => {
    const footer = read("components/pathway/PathwayFooter.tsx");
    const attribution = read("components/PoweredByOnzio.tsx");
    const css = read("styles/pathway.css");
    const footerBlock = css.slice(
      css.indexOf("/* ============ FOOTER"),
      css.indexOf("/* ======================================================================\n   SECTION COMPONENTS"),
    );

    expect(footer).toContain(
      'import PoweredByOnzio from "@/components/PoweredByOnzio"',
    );
    expect(footer).toContain(
      'import { useClubBranding } from "@/components/ClubBrandingProvider"',
    );
    expect(footer).toContain("const { clubLogoUrl, inverseLogoUrl } = useClubBranding();");
    expect(footer).toContain("inverseLogoUrl || clubLogoUrl");
    expect(footer).toContain('className="pathway-footer-brand-lockup"');
    expect(footer).toContain('imageDeliveryProps("club-logo")');
    expect(footer).toContain("<PoweredByOnzio");
    expect(footer).toContain('className="pathway-footer-powered-by"');
    expect(footer).toContain('textClassName="pathway-footer-powered-by-text"');
    expect(attribution).toContain('href="/admin/login"');
    expect(attribution).toContain('alt="Onzio"');
    expect(footerBlock).toContain(".pathway-footer-brand-lockup");
    expect(footerBlock).toContain("grid-template-columns: 1fr auto 1fr;");
    expect(footerBlock).toContain(".pathway-footer-powered-by");
    expect(footerBlock).toContain("@media (max-width: 540px)");

    const selectorLines = footerBlock
      .split("\n")
      .filter((line) => line.includes(".pathway-footer"));
    expect(selectorLines.length).toBeGreaterThan(0);
    expect(
      selectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
  });
});
