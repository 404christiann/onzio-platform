import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";

const fixture = vi.hoisted(() => ({ slug: "test-club", storeEnabled: true, pathname: "/_clubs/test/schedule", content: null as ReturnType<typeof defaultCinematicHomepageContent> | null }));
vi.mock("next/navigation", () => ({ usePathname: () => fixture.pathname }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ slug: fixture.slug, name: "Test club", storeEnabled: fixture.storeEnabled }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/test-crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: fixture.content }) }));
import CinematicNav from "@/components/cinematic/CinematicNav";

beforeEach(() => { fixture.slug = "test-club"; fixture.storeEnabled = true; fixture.pathname = "/_clubs/test/schedule"; fixture.content = defaultCinematicHomepageContent(); });
const render = (editing = false) => renderToStaticMarkup(createElement(CinematicNav, { editing }));

describe("cinematic navigation preserves club content", () => {
  it("retains destination identities when desktop labels are renamed, in public and editor renders", () => {
    fixture.content!.navigation.labels.about = "Our story";
    fixture.content!.navigation.labels["stadium-group"] = "The ground";
    for (const editing of [false, true]) {
      const html = render(editing);
      expect(html).toContain('href="/club/about">Our story</a>');
      expect(html).toContain('href="/stadium/media-credentials"');
      expect(html).toMatch(/<a\b(?=[^>]*href="\/schedule")(?=[^>]*aria-current="page")[^>]*>/);
      expect(html).toContain('The ground<span');
      expect(html).not.toContain('<summary');
    }
  });
  it("honors the store setting in both desktop and phone navigation", () => {
    expect((render().match(/href="\/shop"/g) ?? []).length).toBe(2);
    fixture.storeEnabled = false;
    expect(render()).not.toContain('href="/shop"');
  });
  it("uses tenant crest and configured partner in the closed phone dialog as well as the header", () => {
    fixture.content!.presentation.headerPartner = { assetId: null, url: "/test-partner.png", alt: "Test partner" };
    const html = render();
    expect((html.match(/src="\/test-crest.png"/g) ?? []).length).toBe(2);
    expect((html.match(/src="\/test-partner.png"/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-label="Test club navigation"');
    expect(html).toContain('aria-label="Close navigation"');
    expect(html).toContain('sprite.svg#close');
  });
  it("uses the Foothill Transit Going Good Places logo in the white header and phone menu only for Rose City", () => {
    fixture.slug = "rose-city";
    fixture.content!.presentation.headerPartner = { assetId: null, url: "/original-foothill.png", alt: "Foothill Transit" };
    const html = render();
    expect((html.match(/src="\/images\/cinematic\/foothill-going-good-places.png"/g) ?? []).length).toBe(2);
    expect(html).not.toContain("foothill-blue.png");
    expect(html).not.toContain('src="/original-foothill.png"');
    fixture.slug = "another-club";
    expect(render()).not.toContain('src="/images/cinematic/foothill-going-good-places.png"');
    expect((render().match(/src="\/original-foothill.png"/g) ?? []).length).toBe(2);
    fixture.slug = "rose-city";
    fixture.content!.presentation.headerPartner.alt = "Another sponsor";
    expect(render()).not.toContain('src="/images/cinematic/foothill-going-good-places.png"');
  });
  it("opens Season Ticket Membership and Know Before You Go from a Tickets drop-down, and Stadium's Know before you from the same page", () => {
    fixture.content!.navigation.labels["season-membership"] = "Season tickets";
    const html = render();
    // RC-SAM-FIXES: Season tickets first. RC-SAM-MOBILE-HEADINGS: the single-match page is "Single match tickets" again.
    expect(html).toMatch(/Tickets<span[\s\S]*href="\/tickets\/season-membership">Season tickets<\/a>[\s\S]*href="\/tickets">Single match tickets<\/a>[\s\S]*href="\/tickets\/know-before-you-go">Know before you go<\/a>/);
    expect(html).toContain('href="/tickets/know-before-you-go">Know before you</a>');
    expect(html).not.toContain('href="/stadium/know-before-you"');
  });
  it("normalizes the stock stadium dropdown title without replacing an editor's custom wording", () => {
    fixture.content!.navigation.labels.stadium = "ROBINSON STADIUM";
    expect(render()).toContain('href="/stadium">Robinson Stadium</a>');
    // RC-SAM-FIXES: the phone menu's group button shows the group label as typed, so it gets the same wording.
    fixture.content!.navigation.labels["stadium-group"] = "ROBINSON STADIUM";
    expect(render()).toContain('data-phone-group="stadium-group"');
    expect(render()).not.toContain("ROBINSON STADIUM");
    fixture.content!.navigation.labels.stadium = "Our home ground";
    expect(render()).toContain('href="/stadium">Our home ground</a>');
  });
});

describe("RC-NAV cinematic desktop tabs", () => {
  const groupButton = (html: string, id: string) => html.match(new RegExp(`<button[^>]*data-nav-id="${id}"[^>]*>`))?.[0] ?? "";
  const activeTabs = (html: string) => [...html.matchAll(/<(?:a|button)\b[^>]*class="nav-item active"[^>]*data-nav-id="([^"]+)"|<(?:a|button)\b[^>]*data-nav-id="([^"]+)"[^>]*class="nav-item active"/g)].map(match => match[1] ?? match[2]);
  it("renders one hidden indicator inside the desktop nav for the underline to slide on", () => {
    const html = render();
    expect((html.match(/class="nav-indicator"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<nav class="desktop-nav"[\s\S]*<span class="nav-indicator" aria-hidden="true"><\/span><\/nav>/);
  });
  it("marks the parent tab current on a drop-down page, so the underline rests there", () => {
    fixture.pathname = "/_clubs/test/tickets/season-membership";
    let html = render();
    expect(activeTabs(html)).toEqual(["tickets"]);
    expect(groupButton(html, "tickets")).not.toContain("aria-current");
    expect(html).toMatch(/<a\b(?=[^>]*href="\/tickets\/season-membership")(?=[^>]*aria-current="page")[^>]*>/);
    fixture.pathname = "/_clubs/test/roster";
    expect(activeTabs(render())).toEqual(["club"]);
    fixture.pathname = "/_clubs/test/stadium";
    expect(activeTabs(render())).toEqual(["stadium-group"]);
    fixture.pathname = "/_clubs/test/schedule";
    expect(activeTabs(render())).toEqual(["schedule"]);
    fixture.pathname = "/_clubs/test/policies";
    html = render();
    expect(activeTabs(html)).toEqual([]);
  });
  it("gives Know Before You Go, listed under Stadium and Tickets, to Tickets only", () => {
    fixture.pathname = "/_clubs/test/tickets/know-before-you-go";
    const html = render();
    expect(activeTabs(html)).toEqual(["tickets"]);
    expect((html.match(/<a\b(?=[^>]*href="\/tickets\/know-before-you-go")(?=[^>]*aria-current="page")[^>]*>/g) ?? []).length).toBe(1);
  });
  it("keeps the slide off for reduced motion and keyboard input, and sizes carets with the label", async () => {
    const { readFile } = await import("node:fs/promises");
    const css = await readFile(new URL("../../components/cinematic/cinematic.css", import.meta.url), "utf8");
    expect(css).toMatch(/@media\(prefers-reduced-motion:reduce\)\{[^@]*\.cinematic-site \.nav-indicator\{transition:opacity [^}]*\}/);
    expect(css).toContain(".cinematic-site .club-header[data-keyboard-input] .nav-indicator{transition:none}");
    expect(css).toMatch(/\.cinematic-site \.nav-caret\{flex:none;width:max\(4px,\.36em\);height:max\(4px,\.36em\)/);
  });
});
