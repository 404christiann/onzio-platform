import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { PublicPageVisibilityProvider } from "@/components/PublicPageVisibilityProvider";
import type { ClubContext } from "@/lib/club-context";
import { CINEMATIC_NAV_ITEMS, defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { hydrateRobinsonContent, type RobinsonContent } from "@/lib/cinematic-robinson-content";
import { robinsonReferenceContent } from "@/lib/robinson-reference-content";
import { emptyTicketsContent, hydrateTicketsContent } from "@/lib/tickets-content";
import { hydrateTicketPage } from "@/lib/cinematic-ticket-pages-content";
import { PUBLIC_PAGE_KEYS, PUBLIC_PAGE_PATHS, pageVisible, withoutHiddenPageLinks, type PublicPageKey, type PublicPageVisibility } from "@/lib/public-page-visibility";

// RC-PAGE-VISIBILITY: a club owner can hide the Robinson Stadium, Chick-fil-A, Foothill Transit, Single match tickets and Season ticket
// membership pages. Absent or true = shown; only an explicit false hides a page, its menu and footer links and the blocks that repeat it
// on other pages. Know Before You Go has no switch and always stays.
// The map is NOT part of ClubContext (tenant resolution must never select the column: the 2026-08-14 outage). Server pages read it with
// fetchPublicPageVisibility (mocked here); the nav and footer read it from PublicPageVisibilityProvider.
const fixture = vi.hoisted(() => ({ pathname: "/_clubs/rose-city/schedule", content: null as ReturnType<typeof defaultCinematicHomepageContent> | null }));
const mocks = vi.hoisted(() => ({ club: vi.fn(), visibility: vi.fn(), schema: vi.fn(), robinson: vi.fn(), chick: vi.fn(), transit: vi.fn(), tickets: vi.fn(), ticketPage: vi.fn(), trusted: {} }));
vi.mock("next/navigation", () => ({
  usePathname: () => fixture.pathname,
  notFound: () => { throw new Error("not found"); },
  redirect: (to: string) => { throw new Error(`redirect:${to}`); },
}));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png", footerTagline: "Pasadena, California" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: fixture.content }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: vi.fn(), fetchSiteSocialLinks: () => Promise.resolve([]) }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn() }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/public-page-visibility-query", () => ({ fetchPublicPageVisibility: mocks.visibility }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/cinematic-robinson-query", () => ({ fetchRobinsonContent: mocks.robinson }));
vi.mock("@/lib/chick-fil-a-query", () => ({ fetchChickFilAContent: mocks.chick }));
vi.mock("@/lib/stadium-query", () => ({ fetchStadiumContent: mocks.transit }));
vi.mock("@/lib/tickets-query", () => ({ fetchTicketsContent: mocks.tickets }));
vi.mock("@/lib/cinematic-ticket-pages-query", () => ({ fetchTicketPage: mocks.ticketPage }));
// The match card inside Robinson and the two partner pages have their own suites; here they only mark that they rendered.
vi.mock("@/components/cinematic/CinematicStadium", () => ({ default: ({ content }: { content: { title?: string } }) => createElement("div", { "data-stub": "stadium" }, content.title) }));
vi.mock("@/components/cinematic/CinematicChickFilA", () => ({ default: ({ content }: { content: { title?: string } }) => createElement("div", { "data-stub": "chick-fil-a" }, content.title) }));

import CinematicNav from "@/components/cinematic/CinematicNav";
import CinematicFooter from "@/components/cinematic/CinematicFooter";
import CinematicRobinson from "@/components/cinematic/CinematicRobinson";
import CinematicTickets from "@/components/cinematic/CinematicTickets";
import StadiumPage from "@/app/%5Fclubs/[slug]/stadium/page";
import ChickFilAPage from "@/app/%5Fclubs/[slug]/stadium/chick-fil-a/page";
import FoothillTransitPage from "@/app/%5Fclubs/[slug]/stadium/foothill-transit/page";
import StadiumParkingPage from "@/app/%5Fclubs/[slug]/stadium/parking/page";
import TicketsPage from "@/app/%5Fclubs/[slug]/tickets/page";
import SeasonMembershipPage from "@/app/%5Fclubs/[slug]/tickets/season-membership/page";

/**
 * A test scenario: a club plus the map the server would read for it. The map rides on the scenario object for convenience only;
 * `ClubContext` has no such field, and `serve`/`inClub` hand it to the pages and the provider the way the layouts do.
 * A scenario without the property means "no map" (no provider, or a failed read, which the query turns into {}).
 */
type Scenario = ClubContext & { publicPageVisibility?: PublicPageVisibility };
const baseClub = (patch: Partial<Scenario> = {}): Scenario => ({
  id: "11111111-1111-4111-8111-111111111111", slug: "rose-city", name: "Rose City FC", primaryDomain: "rose-city.localhost", lifecycle: "active", publicAccess: "live", kind: "test",
  stripePriceId: null, tier: "pro", role: null, primaryColor: "#ff0018", secondaryColor: "#141414", presentationTemplateKey: "cinematic@2", storeEnabled: true, publicPageVisibility: {}, ...patch,
});
/** A scenario with no map at all (an editor preview, or a surface that has no provider). */
const withoutMap = (patch: Partial<Scenario> = {}): Scenario => { const { publicPageVisibility: _map, ...rest } = baseClub(patch); return rest; };
const splitScenario = (scenario: Scenario) => { const { publicPageVisibility: map, ...club } = scenario; return { club: club as ClubContext, map }; };
/** Another design's key; the routes only serve cinematic@2. */
const notCinematic = "cinematic@1" as ClubContext["presentationTemplateKey"];
const hiding = (...keys: PublicPageKey[]): PublicPageVisibility => Object.fromEntries(keys.map(key => [key, false]));
/** The three Stadium pages, and the two Tickets-menu pages: each group's switches never touch the other's links. */
const STADIUM_PAGE_KEYS: PublicPageKey[] = ["stadium", "chick-fil-a", "foothill-transit"];
const TICKETS_PAGE_KEYS: PublicPageKey[] = ["tickets", "season-membership"];
/** Renders under the club and, when the scenario has a map, the provider the public layout mounts around it. */
const inClub = (scenario: Scenario, child: ReactElement) => {
  const { club, map } = splitScenario(scenario);
  return renderToStaticMarkup(createElement(ClubContextProvider, { club, children: map === undefined ? child : createElement(PublicPageVisibilityProvider, { visibility: map, children: child }) }));
};
/** Makes the public pages see this club and, through fetchPublicPageVisibility, its map ({} when it has none, like a failed read). */
const serve = (scenario: Scenario) => {
  const { club, map } = splitScenario(scenario);
  mocks.club.mockResolvedValue(club);
  mocks.visibility.mockResolvedValue(map ?? {});
};
const nav = (club: Scenario) => inClub(club, createElement(CinematicNav, { editing: false }));
const footer = (club: Scenario) => inClub(club, createElement(CinematicFooter));
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map(match => match[1]);
const count = (html: string, needle: string) => html.split(needle).length - 1;

const ROBINSON_HREF = 'href="/stadium"';
const PARKING_HREF = 'href="/stadium#parking-lot-no-5"';
const CHICK_HREF = 'href="/stadium/chick-fil-a"';
const FOOTHILL_HREF = 'href="/stadium/foothill-transit"';
const TICKETS_HREF = 'href="/tickets"';
const SEASON_HREF = 'href="/tickets/season-membership"';
const KNOW_BEFORE_YOU_GO_HREF = 'href="/tickets/know-before-you-go"';
const STADIUM_LINKS_KEPT = ['href="/stadium/guidelines"', 'href="/stadium/fan-code"', 'href="/stadium/media-credentials"', 'href="/tickets/know-before-you-go"'];

beforeEach(() => {
  fixture.pathname = "/_clubs/rose-city/schedule";
  fixture.content = defaultCinematicHomepageContent();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("pageVisible and withoutHiddenPageLinks", () => {
  it("reads an absent map, an absent key and true as shown, and only an explicit false as hidden", () => {
    for (const club of [undefined, null, {}, { publicPageVisibility: undefined }, { publicPageVisibility: null }, { publicPageVisibility: {} }, withoutMap()]) {
      for (const key of PUBLIC_PAGE_KEYS) expect(pageVisible(club, key)).toBe(true);
    }
    expect(pageVisible({ publicPageVisibility: { stadium: true } }, "stadium")).toBe(true);
    expect(pageVisible({ publicPageVisibility: { stadium: false } }, "stadium")).toBe(false);
    expect(pageVisible({ publicPageVisibility: { stadium: false } }, "chick-fil-a")).toBe(true);
  });

  it("returns every menu item untouched while nothing is hidden", () => {
    for (const club of [undefined, {}, { publicPageVisibility: {} }, { publicPageVisibility: { stadium: true, "chick-fil-a": true, "foothill-transit": true } }]) {
      expect(withoutHiddenPageLinks(CINEMATIC_NAV_ITEMS, club)).toEqual(CINEMATIC_NAV_ITEMS);
    }
  });

  it("drops each hidden page's link and leaves the rest of the Stadium group", () => {
    const stadiumChildren = (key: PublicPageKey) => (withoutHiddenPageLinks(CINEMATIC_NAV_ITEMS, { publicPageVisibility: hiding(key) }).find(item => item.id === "stadium-group")?.children ?? []).map(child => child.id);
    const all = (CINEMATIC_NAV_ITEMS.find(item => item.id === "stadium-group")?.children ?? []).map(child => child.id);
    expect(stadiumChildren("chick-fil-a")).toEqual(all.filter(id => id !== "chick-fil-a"));
    expect(stadiumChildren("foothill-transit")).toEqual(all.filter(id => id !== "foothill-transit"));
    // Parking is an anchor on the Robinson page, so it leaves with it.
    expect(stadiumChildren("stadium")).toEqual(all.filter(id => id !== "stadium" && id !== "stadium-parking"));
  });

  it("keeps Know Before You Go, Guidelines, Fan Code and Media Credentials while all three Stadium pages are hidden, and every other group", () => {
    const items = withoutHiddenPageLinks(CINEMATIC_NAV_ITEMS, { publicPageVisibility: hiding(...STADIUM_PAGE_KEYS) });
    expect(items.find(item => item.id === "stadium-group")?.children?.map(child => child.id)).toEqual(["stadium-guidelines", "know-before-you", "fan-code", "media-credentials"]);
    expect(items.map(item => item.id)).toEqual(CINEMATIC_NAV_ITEMS.map(item => item.id));
    expect(items.find(item => item.id === "tickets")).toBe(CINEMATIC_NAV_ITEMS.find(item => item.id === "tickets"));
  });

  it("drops Single match tickets and Season ticket membership one at a time, and always keeps Know Before You Go", () => {
    const ticketsChildren = (...keys: PublicPageKey[]) => (withoutHiddenPageLinks(CINEMATIC_NAV_ITEMS, { publicPageVisibility: hiding(...keys) }).find(item => item.id === "tickets")?.children ?? []).map(child => child.id);
    expect(ticketsChildren()).toEqual(["season-membership", "tickets-page", "know-before-you"]);
    expect(ticketsChildren("tickets")).toEqual(["season-membership", "know-before-you"]);
    expect(ticketsChildren("season-membership")).toEqual(["tickets-page", "know-before-you"]);
    // The Tickets group stays for the page that is left.
    expect(ticketsChildren(...TICKETS_PAGE_KEYS)).toEqual(["know-before-you"]);
    expect(ticketsChildren(...PUBLIC_PAGE_KEYS)).toEqual(["know-before-you"]);
  });

  it("leaves every group and the Stadium group's own Know before you alone while the Tickets pages are hidden", () => {
    const items = withoutHiddenPageLinks(CINEMATIC_NAV_ITEMS, { publicPageVisibility: hiding(...TICKETS_PAGE_KEYS) });
    expect(items.map(item => item.id)).toEqual(CINEMATIC_NAV_ITEMS.map(item => item.id));
    for (const id of CINEMATIC_NAV_ITEMS.map(item => item.id).filter(id => id !== "tickets")) expect(items.find(item => item.id === id), id).toBe(CINEMATIC_NAV_ITEMS.find(item => item.id === id));
    expect(items.find(item => item.id === "stadium-group")?.children?.map(child => child.id)).toContain("know-before-you");
    // And the Stadium switches never touch the Tickets group.
    const stadiumHidden = withoutHiddenPageLinks(CINEMATIC_NAV_ITEMS, { publicPageVisibility: hiding(...STADIUM_PAGE_KEYS) });
    expect(stadiumHidden.find(item => item.id === "tickets")).toBe(CINEMATIC_NAV_ITEMS.find(item => item.id === "tickets"));
  });

  it("takes a Tickets group out of the menu only when no link is left in it", () => {
    const group = { id: "tickets", label: "Tickets", children: [{ id: "a", label: "A", href: "/tickets" }, { id: "b", label: "B", href: "/tickets/season-membership" }] };
    expect(withoutHiddenPageLinks([group], { publicPageVisibility: hiding("tickets") })[0].children).toEqual([group.children[1]]);
    expect(withoutHiddenPageLinks([group], { publicPageVisibility: hiding(...TICKETS_PAGE_KEYS) })).toEqual([]);
    expect(withoutHiddenPageLinks([{ ...group, children: [...group.children, { id: "c", label: "C", href: "/tickets/know-before-you-go" }] }], { publicPageVisibility: hiding(...TICKETS_PAGE_KEYS) })[0].children).toEqual([{ id: "c", label: "C", href: "/tickets/know-before-you-go" }]);
  });

  it("drops a group whose links are all hidden, keeps a group that still has one, and drops a hidden plain link", () => {
    const items = [
      { id: "home", label: "Home", href: "/" },
      { id: "ground", label: "Ground", href: "/stadium" },
      { id: "only", label: "Only", children: [{ id: "a", label: "A", href: "/stadium" }, { id: "b", label: "B", href: "/stadium#parking-lot-no-5" }] },
      { id: "some", label: "Some", href: "/stadium/chick-fil-a", children: [{ id: "c", label: "C", href: "/stadium/chick-fil-a" }, { id: "d", label: "D", href: "/roster" }] },
      { id: "empty", label: "Empty", href: "/schedule", children: [] },
    ];
    const kept = withoutHiddenPageLinks(items, { publicPageVisibility: hiding("stadium", "chick-fil-a") });
    expect(kept.map(item => item.id)).toEqual(["home", "some", "empty"]);
    // A group is never a link in the menu, so its own address does not decide whether it stays.
    expect(kept[1].children).toEqual([{ id: "d", label: "D", href: "/roster" }]);
    expect(items[3].children).toHaveLength(2);
    // Trailing slashes and queries do not dodge the switch.
    expect(withoutHiddenPageLinks([{ id: "x", label: "X", href: "/stadium/" }, { id: "y", label: "Y", href: "/stadium?x=1" }], { publicPageVisibility: hiding("stadium") })).toEqual([]);
  });
});

describe("navigation", () => {
  it("is identical with the map absent, empty or all true", () => {
    const base = nav(withoutMap());
    expect(nav(baseClub())).toBe(base);
    expect(nav(baseClub({ publicPageVisibility: { stadium: true, "chick-fil-a": true, "foothill-transit": true } }))).toBe(base);
    for (const href of [ROBINSON_HREF, PARKING_HREF, CHICK_HREF, FOOTHILL_HREF, ...STADIUM_LINKS_KEPT]) expect(base, href).toContain(href);
  });

  it("reads the map from the provider only, never from the club context", () => {
    const stray = { ...baseClub(), publicPageVisibility: hiding(...PUBLIC_PAGE_KEYS) };
    const html = renderToStaticMarkup(createElement(ClubContextProvider, { club: stray as ClubContext, children: createElement(CinematicNav, { editing: false }) }));
    expect(html).toBe(nav(withoutMap()));
    for (const href of [ROBINSON_HREF, PARKING_HREF, CHICK_HREF, FOOTHILL_HREF]) expect(html, href).toContain(href);
    const footerHtml = renderToStaticMarkup(createElement(ClubContextProvider, { club: stray as ClubContext, children: createElement(CinematicFooter) }));
    expect(footerHtml).toContain(ROBINSON_HREF);
  });

  it("omits only the hidden page's link", () => {
    const chick = nav(baseClub({ publicPageVisibility: hiding("chick-fil-a") }));
    expect(chick).not.toContain(CHICK_HREF);
    for (const href of [ROBINSON_HREF, PARKING_HREF, FOOTHILL_HREF, ...STADIUM_LINKS_KEPT]) expect(chick, href).toContain(href);
    const foothill = nav(baseClub({ publicPageVisibility: hiding("foothill-transit") }));
    expect(foothill).not.toContain(FOOTHILL_HREF);
    for (const href of [ROBINSON_HREF, PARKING_HREF, CHICK_HREF, ...STADIUM_LINKS_KEPT]) expect(foothill, href).toContain(href);
  });

  it("omits Robinson Stadium and Stadium parking together, and keeps the Stadium tab for the pages that remain", () => {
    const html = nav(baseClub({ publicPageVisibility: hiding("stadium") }));
    expect(html).not.toContain(ROBINSON_HREF);
    expect(html).not.toContain(PARKING_HREF);
    for (const href of [CHICK_HREF, FOOTHILL_HREF, ...STADIUM_LINKS_KEPT]) expect(html, href).toContain(href);
    expect(html).toContain('data-nav-id="stadium-group"');
    expect(html).toContain('data-phone-group="stadium-group"');
  });

  it("removes every address of all three hidden Stadium pages from the desktop and phone menus", () => {
    const html = nav(baseClub({ publicPageVisibility: hiding(...STADIUM_PAGE_KEYS) }));
    for (const href of [ROBINSON_HREF, PARKING_HREF, CHICK_HREF, FOOTHILL_HREF]) expect(html, href).not.toContain(href);
    for (const href of STADIUM_LINKS_KEPT) expect(html, href).toContain(href);
    // Everything outside the Stadium group is as before.
    expect(hrefs(html).filter(href => !href.startsWith("/stadium")).sort()).toEqual(hrefs(nav(withoutMap())).filter(href => !href.startsWith("/stadium")).sort());
  });

  describe("Tickets menu", () => {
    const base = () => nav(baseClub());
    it("links Single match tickets from the drop-down and the phone shortcut, and Season ticket membership once, while shown", () => {
      const html = base();
      expect(count(html, TICKETS_HREF)).toBe(2);
      expect(count(html, SEASON_HREF)).toBe(1);
      expect(html).toContain(">Single match tickets</a>");
      expect(html).toContain(">Season ticket membership</a>");
      expect(html).toContain(">Buy Tickets</a>");
      // Know Before You Go sits under both Stadium and Tickets.
      expect(count(html, KNOW_BEFORE_YOU_GO_HREF)).toBe(2);
      expect(html).toBe(nav(withoutMap()));
    });
    it("drops Single match tickets from the desktop drop-down and the phone menu, and keeps Season and Know Before You Go", () => {
      const html = nav(baseClub({ publicPageVisibility: hiding("tickets") }));
      expect(html).not.toContain(TICKETS_HREF);
      expect(html).not.toContain("Single match tickets");
      // The phone menu's own Buy Tickets shortcut points at the same page, so it goes too, and Schedule stays.
      expect(html).not.toContain("Buy Tickets");
      expect(html).toContain('<div class="quick-links"><a href="/schedule">');
      expect(html).toContain(SEASON_HREF);
      expect(count(html, KNOW_BEFORE_YOU_GO_HREF)).toBe(2);
      expect(html).toContain('data-nav-id="tickets"');
      expect(html).toContain('data-phone-group="tickets"');
    });
    it("drops Season ticket membership and keeps Single match tickets, the phone shortcut and Know Before You Go", () => {
      const html = nav(baseClub({ publicPageVisibility: hiding("season-membership") }));
      expect(html).not.toContain(SEASON_HREF);
      expect(html).not.toContain("Season ticket membership");
      expect(count(html, TICKETS_HREF)).toBe(2);
      expect(html).toContain(">Buy Tickets</a>");
      expect(count(html, KNOW_BEFORE_YOU_GO_HREF)).toBe(2);
      expect(html).toContain('data-nav-id="tickets"');
    });
    it("keeps the Tickets group with Know Before You Go only when both pages are hidden", () => {
      const html = nav(baseClub({ publicPageVisibility: hiding(...TICKETS_PAGE_KEYS) }));
      for (const gone of [TICKETS_HREF, SEASON_HREF, "Single match tickets", "Season ticket membership", "Buy Tickets"]) expect(html, gone).not.toContain(gone);
      expect(html).toContain('data-nav-id="tickets"');
      expect(html).toContain('data-phone-group="tickets"');
      expect(count(html, KNOW_BEFORE_YOU_GO_HREF)).toBe(2);
      expect(hrefs(html).filter(href => href.startsWith("/tickets"))).toEqual(["/tickets/know-before-you-go", "/tickets/know-before-you-go"]);
    });
    it("changes nothing outside the Tickets links, and leaves the Stadium pages alone", () => {
      const without = (html: string) => hrefs(html).filter(href => !href.startsWith("/tickets"));
      for (const keys of [["tickets"], ["season-membership"], TICKETS_PAGE_KEYS] as PublicPageKey[][]) {
        expect(without(nav(baseClub({ publicPageVisibility: hiding(...keys) }))).sort(), keys.join()).toEqual(without(base()).sort());
      }
      const stadium = nav(baseClub({ publicPageVisibility: hiding(...STADIUM_PAGE_KEYS) }));
      for (const href of [TICKETS_HREF, SEASON_HREF]) expect(stadium, href).toContain(href);
      expect(stadium).toContain(">Buy Tickets</a>");
    });
    it("lets an owner's own wording ride along for the links that remain", () => {
      fixture.content!.navigation.labels["season-membership"] = "Season passes";
      fixture.content!.navigation.labels["tickets-page"] = "Match tickets";
      expect(nav(baseClub({ publicPageVisibility: hiding("tickets") }))).toContain(">Season passes</a>");
      expect(nav(baseClub({ publicPageVisibility: hiding("tickets") }))).not.toContain("Match tickets");
      expect(nav(baseClub({ publicPageVisibility: hiding("season-membership") }))).not.toContain("Season passes");
    });
    it("reads the phone shortcut from the provider only, and shows it in an editor preview that has none", () => {
      const stray = { ...baseClub(), publicPageVisibility: hiding(...TICKETS_PAGE_KEYS) };
      const html = renderToStaticMarkup(createElement(ClubContextProvider, { club: stray as ClubContext, children: createElement(CinematicNav, { editing: true }) }));
      expect(html).toContain(">Buy Tickets</a>");
      expect(html).toContain(">Single match tickets</a>");
    });
    it("hides another club's Tickets pages the same way, and leaves a club with no map alone", () => {
      expect(nav(withoutMap({ slug: "other-club" }))).toContain(TICKETS_HREF);
      expect(nav(baseClub({ slug: "other-club", publicPageVisibility: hiding("tickets") }))).not.toContain(TICKETS_HREF);
    });
  });

  it("leaves the Shop switch exactly as it was, whatever the map says", () => {
    expect(count(nav(baseClub()), 'href="/shop"')).toBe(2);
    expect(count(nav(baseClub({ publicPageVisibility: hiding(...PUBLIC_PAGE_KEYS) })), 'href="/shop"')).toBe(2);
    expect(nav(baseClub({ storeEnabled: false }))).not.toContain('href="/shop"');
    const both = nav(baseClub({ storeEnabled: false, publicPageVisibility: hiding("stadium") }));
    expect(both).not.toContain('href="/shop"');
    expect(both).not.toContain(ROBINSON_HREF);
  });

  it("hides another club's pages the same way, and leaves a club with no map alone", () => {
    const other = baseClub({ slug: "other-club", name: "Other FC" });
    expect(nav(withoutMap({ slug: "other-club", name: "Other FC" }))).toContain(ROBINSON_HREF);
    expect(nav(other)).toContain(CHICK_HREF);
    expect(nav({ ...other, publicPageVisibility: hiding("chick-fil-a") })).not.toContain(CHICK_HREF);
  });
});

describe("Foothill Transit header mark", () => {
  const foothillMark = () => { fixture.content!.presentation.headerPartner = { assetId: null, url: "/original-foothill.png", alt: "Foothill Transit" }; };
  const MARK = "/images/cinematic/foothill-going-good-places.png";

  it("shows in the header and the phone menu for Rose City while the page is shown", () => {
    foothillMark();
    for (const club of [withoutMap(), baseClub(), baseClub({ publicPageVisibility: { "foothill-transit": true } }), baseClub({ publicPageVisibility: hiding("stadium", "chick-fil-a") })]) {
      const html = nav(club);
      expect(count(html, `src="${MARK}"`)).toBe(2);
      expect(html).toContain('class="header-partner"');
      expect(html).toContain('class="phone-partner"');
    }
  });

  it("is gone from both the header and the phone menu once the owner hides the page; the crest stays", () => {
    foothillMark();
    const html = nav(baseClub({ publicPageVisibility: hiding("foothill-transit") }));
    expect(html).not.toContain(MARK);
    expect(html).not.toContain("original-foothill");
    expect(html).not.toContain("header-partner");
    expect(html).not.toContain("phone-partner");
    expect(count(html, 'src="/crest.png"')).toBe(2);
  });

  it("leaves a different partner, and a different club's partner, alone", () => {
    foothillMark();
    fixture.content!.presentation.headerPartner.alt = "Another sponsor";
    expect(count(nav(baseClub({ publicPageVisibility: hiding("foothill-transit") })), 'src="/original-foothill.png"')).toBe(2);
    foothillMark();
    const other = nav(baseClub({ slug: "another-club", publicPageVisibility: hiding("foothill-transit") }));
    expect(count(other, 'src="/original-foothill.png"')).toBe(2);
    expect(other).not.toContain(MARK);
  });

  it("renders no partner wrapper, link or logo at all while the owner has no header logo, for any club", () => {
    for (const url of [null, ""]) {
      for (const alt of ["", "Another sponsor", "Foothill Transit"]) {
        fixture.content!.presentation.headerPartner = { assetId: null, url, alt };
        for (const club of [baseClub(), baseClub({ slug: "another-club" }), baseClub({ publicPageVisibility: hiding("foothill-transit") })]) {
          const html = nav(club);
          for (const gone of ["header-partner", "phone-partner", "data-transparent-mark", MARK]) expect(html, `${url}/${alt}/${gone}`).not.toContain(gone);
          expect(count(html, "<img")).toBe(2);
        }
      }
    }
  });

  it("keeps the phone Menu button at the right edge when no partner sits before it", () => {
    const css = readFileSync("components/cinematic/cinematic.css", "utf8");
    const phone = css.slice(css.indexOf("@media(max-width:1024px){\n  .cinematic-site .club-header{height:calc(88px"));
    expect(phone.slice(0, phone.indexOf("@media(max-width:360px)"))).toContain(".cinematic-site .desktop-nav+.menu-toggle{margin-left:auto}");
  });
});

describe("footer", () => {
  const stadiumLink = 'href="/stadium"';
  it("is identical with the map absent, empty or all true", () => {
    const base = footer(withoutMap());
    expect(footer(baseClub())).toBe(base);
    expect(footer(baseClub({ publicPageVisibility: { stadium: true, "chick-fil-a": true, "foothill-transit": true } }))).toBe(base);
    expect(base).toContain(stadiumLink);
    expect(base).toContain(">STADIUM</a>");
  });
  it("drops STADIUM only when the Robinson Stadium page is hidden", () => {
    const html = footer(baseClub({ publicPageVisibility: hiding("stadium") }));
    expect(html).not.toContain(stadiumLink);
    expect(html).not.toContain("STADIUM");
    expect(hrefs(html)).toEqual(hrefs(footer(withoutMap())).filter(href => href !== "/stadium"));
    for (const key of ["chick-fil-a", "foothill-transit"] as const) expect(footer(baseClub({ publicPageVisibility: hiding(key) }))).toContain(stadiumLink);
  });
  it("drops the TICKETS link only when Single match tickets is hidden", () => {
    const base = footer(withoutMap());
    expect(base).toContain(TICKETS_HREF);
    expect(base).toContain(">TICKETS</a>");
    const html = footer(baseClub({ publicPageVisibility: hiding("tickets") }));
    expect(html).not.toContain(TICKETS_HREF);
    expect(html).not.toContain("TICKETS");
    expect(hrefs(html)).toEqual(hrefs(base).filter(href => href !== "/tickets"));
    // The footer never linked Season ticket membership or Know Before You Go, so their switches change nothing here.
    expect(footer(baseClub({ publicPageVisibility: hiding("season-membership") }))).toBe(base);
    expect(footer(baseClub({ publicPageVisibility: hiding(...TICKETS_PAGE_KEYS) }))).toBe(footer(baseClub({ publicPageVisibility: hiding("tickets") })));
    expect(footer(baseClub({ publicPageVisibility: hiding(...STADIUM_PAGE_KEYS) }))).toContain(TICKETS_HREF);
  });
  it("drops an owner's own wording for Tickets along with the link", () => {
    fixture.content!.navigation.labels.tickets = "Match tickets";
    expect(footer(baseClub())).toContain(">Match tickets</a>");
    expect(footer(baseClub({ publicPageVisibility: hiding("tickets") }))).not.toContain("Match tickets");
  });
  it("leaves the Shop switch exactly as it was", () => {
    expect(footer(baseClub())).toContain('href="/shop"');
    expect(footer(baseClub({ publicPageVisibility: hiding("stadium") }))).toContain('href="/shop"');
    expect(footer(baseClub({ storeEnabled: false }))).not.toContain('href="/shop"');
    const both = footer(baseClub({ storeEnabled: false, publicPageVisibility: hiding("stadium") }));
    expect(both).not.toContain('href="/shop"');
    expect(both).not.toContain(stadiumLink);
  });
  it("keeps an owner's footer wording for the links that remain", () => {
    fixture.content!.navigation.labels.tickets = "Match tickets";
    expect(footer(baseClub({ publicPageVisibility: hiding("stadium") }))).toContain(">Match tickets</a>");
  });
});

describe("public routes", () => {
  const routes = [
    { name: "Robinson Stadium", key: "stadium" as const, call: (slug: string) => StadiumPage({ params: Promise.resolve({ slug }) }), fetched: () => mocks.robinson },
    { name: "Chick-fil-A", key: "chick-fil-a" as const, call: (slug: string) => ChickFilAPage({ params: Promise.resolve({ slug }) }), fetched: () => mocks.chick },
    { name: "Foothill Transit", key: "foothill-transit" as const, call: (slug: string) => FoothillTransitPage({ params: Promise.resolve({ slug }) }), fetched: () => mocks.transit },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.schema.mockReturnValue(mocks.trusted);
    mocks.robinson.mockResolvedValue(hydrateRobinsonContent(structuredClone(robinsonReferenceContent) as RobinsonContent, []));
    mocks.chick.mockResolvedValue({ title: "Chick-fil-A page" });
    mocks.transit.mockResolvedValue({ title: "Road to the Match page" });
    mocks.tickets.mockResolvedValue({ purchaseUrl: "", missingPurchaseLabel: "Ticket link coming soon" });
  });

  describe.each(routes)("$name", ({ key, call, fetched }) => {
    const others = PUBLIC_PAGE_KEYS.filter(other => other !== key);
    it("renders with the map absent, empty, true or only another page hidden", async () => {
      for (const map of [undefined, {}, { [key]: true }, hiding(...others)]) {
        serve(map === undefined ? withoutMap() : baseClub({ publicPageVisibility: map }));
        expect(renderToStaticMarkup(await call("rose-city"))).not.toBe("");
      }
      expect(fetched()).toHaveBeenCalledTimes(4);
    });
    it("is a 404 once hidden, before any page content is read", async () => {
      serve(baseClub({ publicPageVisibility: hiding(key) }));
      await expect(call("rose-city")).rejects.toThrow("not found");
      expect(mocks.visibility).toHaveBeenCalledWith(baseClub().id);
      expect(mocks.schema).not.toHaveBeenCalled();
      expect(fetched()).not.toHaveBeenCalled();
      expect(mocks.tickets).not.toHaveBeenCalled();
    });
    it("renders when the visibility read failed open (it resolves {}), never 404s on a read error", async () => {
      mocks.club.mockResolvedValue(withoutMap());
      mocks.visibility.mockResolvedValue({});
      expect(renderToStaticMarkup(await call("rose-city"))).not.toBe("");
      expect(fetched()).toHaveBeenCalledTimes(1);
    });
    it.each(["academy@1", "clubhouse@1", "editorial@1", "cinematic@1"] as const)("is still a 404 for %s, hidden or not", async template => {
      for (const map of [{}, hiding(key)]) {
        serve(baseClub({ presentationTemplateKey: template as ClubContext["presentationTemplateKey"], publicPageVisibility: map }));
        await expect(call("other")).rejects.toThrow("not found");
      }
      expect(fetched()).not.toHaveBeenCalled();
    });
    it("is never cached across requests", () => {
      const file = { stadium: "stadium/page.tsx", "chick-fil-a": "stadium/chick-fil-a/page.tsx", "foothill-transit": "stadium/foothill-transit/page.tsx" }[key];
      const source = readFileSync(`app/%5Fclubs/[slug]/${file}`, "utf8");
      expect(source).not.toMatch(/revalidate|unstable_cache|force-static|generateStaticParams|generateMetadata|redirect\(/);
    });
  });

  it("renders the tenant's Foothill page from the trusted server schema while shown", async () => {
    serve(baseClub({ publicPageVisibility: hiding("stadium", "chick-fil-a") }));
    const html = renderToStaticMarkup(await FoothillTransitPage({ params: Promise.resolve({ slug: "rose-city" }) }));
    expect(html).toContain("Road to the Match page");
    expect(mocks.transit).toHaveBeenCalledWith(baseClub().id, mocks.trusted);
  });

  it("forwards /stadium/parking to the Robinson page, and is a 404 while that page is hidden or the design is not cinematic@2", async () => {
    const parking = () => StadiumParkingPage({ params: Promise.resolve({ slug: "rose-city" }) });
    for (const map of [undefined, {}, { stadium: true }, hiding("chick-fil-a", "foothill-transit")]) {
      serve(map === undefined ? withoutMap() : baseClub({ publicPageVisibility: map }));
      await expect(parking()).rejects.toThrow("redirect:/stadium#parking-lot-no-5");
    }
    serve(baseClub({ publicPageVisibility: hiding("stadium") }));
    await expect(parking()).rejects.toThrow("not found");
    serve(baseClub({ presentationTemplateKey: notCinematic }));
    await expect(parking()).rejects.toThrow("not found");
  });

  it("serves no hidden page from the catch-all route either, because every hidden address has its own page", () => {
    // [...revamp] only answers addresses without a dedicated page; the five pages and the parking alias all have one.
    for (const file of ["stadium/page.tsx", "stadium/chick-fil-a/page.tsx", "stadium/foothill-transit/page.tsx", "stadium/parking/page.tsx", "tickets/page.tsx", "tickets/season-membership/page.tsx"]) {
      expect(() => readFileSync(`app/%5Fclubs/[slug]/${file}`, "utf8"), file).not.toThrow();
    }
  });
});

describe("Tickets-menu public routes", () => {
  const roseTickets = () => hydrateTicketsContent(JSON.parse(readFileSync("assets/rose-city-tickets-2027/copy.json", "utf8")), [], false);
  const routes = [
    { name: "Single match tickets", key: "tickets" as const, file: "tickets/page.tsx", call: (slug: string) => TicketsPage({ params: Promise.resolve({ slug }) }), fetched: () => mocks.tickets },
    { name: "Season ticket membership", key: "season-membership" as const, file: "tickets/season-membership/page.tsx", call: (slug: string) => SeasonMembershipPage({ params: Promise.resolve({ slug }) }), fetched: () => mocks.ticketPage },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.schema.mockReturnValue(mocks.trusted);
    mocks.tickets.mockResolvedValue(roseTickets());
    mocks.ticketPage.mockResolvedValue(hydrateTicketPage("season-membership", null, []));
  });

  describe.each(routes)("$name", ({ key, file, call, fetched }) => {
    const others = PUBLIC_PAGE_KEYS.filter(other => other !== key);
    const render = async (scenario: Scenario) => { serve(scenario); return inClub(scenario, await call(scenario.slug)); };
    it("renders with the map absent, empty, true or only other pages hidden", async () => {
      for (const map of [undefined, {}, { [key]: true }, hiding(...others)]) {
        expect(await render(map === undefined ? withoutMap() : baseClub({ publicPageVisibility: map })), JSON.stringify(map)).not.toBe("");
      }
      expect(fetched()).toHaveBeenCalledTimes(4);
    });
    it("is a 404 once hidden, before any page content is read", async () => {
      serve(baseClub({ publicPageVisibility: hiding(key) }));
      await expect(call("rose-city")).rejects.toThrow("not found");
      expect(mocks.visibility).toHaveBeenCalledWith(baseClub().id);
      expect(mocks.schema).not.toHaveBeenCalled();
      expect(fetched()).not.toHaveBeenCalled();
    });
    it("is a 404 when hidden together with the sibling page too", async () => {
      serve(baseClub({ publicPageVisibility: hiding(...TICKETS_PAGE_KEYS) }));
      await expect(call("rose-city")).rejects.toThrow("not found");
      expect(fetched()).not.toHaveBeenCalled();
    });
    it("renders when the visibility read failed open (it resolves {}), never 404s on a read error", async () => {
      // Before the migration reaches a database, the read answers {} and every page shows.
      mocks.club.mockResolvedValue(withoutMap());
      mocks.visibility.mockResolvedValue({});
      expect(inClub(withoutMap(), await call("rose-city"))).not.toBe("");
      expect(fetched()).toHaveBeenCalledTimes(1);
    });
    it.each(["academy@1", "clubhouse@1", "editorial@1", "cinematic@1"] as const)("is still a 404 for %s, hidden or not", async template => {
      for (const map of [{}, hiding(key)]) {
        serve(baseClub({ presentationTemplateKey: template as ClubContext["presentationTemplateKey"], publicPageVisibility: map }));
        await expect(call("other")).rejects.toThrow("not found");
      }
      expect(fetched()).not.toHaveBeenCalled();
    });
    it("is never cached across requests, and answers a hidden page with a 404, never a redirect", () => {
      const source = readFileSync(`app/%5Fclubs/[slug]/${file}`, "utf8");
      expect(source).not.toMatch(/revalidate|unstable_cache|force-static|generateStaticParams|generateMetadata|redirect\(/);
      expect(source).toContain(`pageVisible({ publicPageVisibility: visibility }, "${key}")`);
    });
  });

  it("hides one page without touching the other", async () => {
    const [single, season] = routes;
    serve(baseClub({ publicPageVisibility: hiding("tickets") }));
    await expect(single.call("rose-city")).rejects.toThrow("not found");
    expect(inClub(baseClub(), await season.call("rose-city"))).toContain("Season Ticket Membership");
    serve(baseClub({ publicPageVisibility: hiding("season-membership") }));
    await expect(season.call("rose-city")).rejects.toThrow("not found");
    expect(inClub(baseClub(), await single.call("rose-city"))).toContain("tickets-page");
  });

  it("hides one club's page without touching another club's", async () => {
    const [single] = routes;
    serve(baseClub({ slug: "other-club", publicPageVisibility: {} }));
    expect(inClub(baseClub(), await single.call("other-club"))).toContain("tickets-page");
    serve(baseClub({ publicPageVisibility: hiding("tickets") }));
    await expect(single.call("rose-city")).rejects.toThrow("not found");
  });

  it("keeps Know Before You Go reachable: it has no switch, its address is not a hidden path, and its route never reads the map", () => {
    expect(Object.values(PUBLIC_PAGE_PATHS)).not.toContain("/tickets/know-before-you-go");
    expect(withoutHiddenPageLinks([{ href: "/tickets/know-before-you-go" }], { publicPageVisibility: hiding(...PUBLIC_PAGE_KEYS) })).toEqual([{ href: "/tickets/know-before-you-go" }]);
    const source = readFileSync("app/%5Fclubs/[slug]/tickets/know-before-you-go/page.tsx", "utf8");
    expect(source).not.toMatch(/pageVisible|public-page-visibility|publicPageVisibility/);
  });
});

describe("embedded blocks", () => {
  const robinsonContent = (change: (content: RobinsonContent) => void = () => {}) => {
    const content = structuredClone(robinsonReferenceContent) as RobinsonContent;
    change(content);
    return hydrateRobinsonContent(content, []);
  };
  const ticketing = { purchaseUrl: "", missingPurchaseLabel: "Ticket link coming soon" };
  const robinson = (visibility?: PublicPageVisibility | null, change?: (content: RobinsonContent) => void) =>
    renderToStaticMarkup(createElement(CinematicRobinson, { content: robinsonContent(change), ticketing, pageVisibility: visibility }));
  const FOOD = 'id="r-food-title"';
  const ROUTE = 'id="r-route-title"';
  const DIRECTIONS = 'class="r-directions"';

  describe("Robinson Stadium", () => {
    it("shows the food and Road to the Match blocks with the map absent, empty or all true, and in an editor preview that passes none", () => {
      const base = robinson();
      for (const html of [base, robinson(null), robinson({}), robinson({ stadium: true, "chick-fil-a": true, "foothill-transit": true })]) {
        expect(html).toBe(base);
      }
      for (const marker of [FOOD, ROUTE, DIRECTIONS]) expect(base, marker).toContain(marker);
    });
    it("drops the food block when Chick-fil-A is hidden, and nothing else", () => {
      const html = robinson(hiding("chick-fil-a"));
      expect(html).not.toContain(FOOD);
      expect(html).not.toContain("r-food");
      for (const marker of [ROUTE, DIRECTIONS, 'id="r-title"', 'class="r-cards"', 'id="lockers"']) expect(html, marker).toContain(marker);
    });
    it("drops the Road to the Match block when Foothill Transit is hidden but keeps the Directions text", () => {
      const html = robinson(hiding("foothill-transit"));
      expect(html).not.toContain(ROUTE);
      expect(html).not.toContain("r-route-heading");
      expect(html).not.toContain("r-route-map");
      for (const marker of [FOOD, DIRECTIONS, 'aria-label="Directions"', 'id="parking-lot-no-5"']) expect(html, marker).toContain(marker);
    });
    it("drops a route section that has nothing left once Directions is off too", () => {
      const html = robinson(hiding("foothill-transit"), content => { content.directions.visible = false; });
      expect(html).not.toContain("r-route");
      expect(html).not.toContain("Directions");
    });
    it("also respects the section's own visible switch", () => {
      expect(robinson({}, content => { content.food.visible = false; })).not.toContain(FOOD);
      expect(robinson({}, content => { content.route.visible = false; })).not.toContain(ROUTE);
      expect(robinson({ "chick-fil-a": true }, content => { content.food.visible = false; })).not.toContain(FOOD);
    });
    it("is not changed by the Robinson page's own switch, which hides the whole page at the route", () => {
      expect(robinson(hiding("stadium"))).toBe(robinson());
    });
    it("renders from the public page with the club's own map", async () => {
      mocks.robinson.mockResolvedValue(robinsonContent());
      mocks.tickets.mockResolvedValue(ticketing);
      mocks.schema.mockReturnValue(mocks.trusted);
      const render = async (club: Scenario) => { serve(club); return renderToStaticMarkup(await StadiumPage({ params: Promise.resolve({ slug: club.slug }) })); };
      const shown = await render(baseClub());
      expect(shown).toContain(FOOD);
      expect(shown).toContain(ROUTE);
      expect(shown).toBe(await render(withoutMap()));
      const noFood = await render(baseClub({ publicPageVisibility: hiding("chick-fil-a") }));
      expect(noFood).not.toContain(FOOD);
      expect(noFood).toContain(ROUTE);
      const noRoute = await render(baseClub({ publicPageVisibility: hiding("foothill-transit") }));
      expect(noRoute).toContain(FOOD);
      expect(noRoute).not.toContain(ROUTE);
      const other = await render(baseClub({ slug: "other-club", publicPageVisibility: hiding("chick-fil-a") }));
      expect(other).not.toContain(FOOD);
    });
  });

  describe("Tickets", () => {
    const rose = () => JSON.parse(readFileSync("assets/rose-city-tickets-2027/copy.json", "utf8")) as ReturnType<typeof emptyTicketsContent>;
    const tickets = (visibility?: PublicPageVisibility | null, flags: Partial<ReturnType<typeof emptyTicketsContent>> = {}) =>
      inClub(baseClub(), createElement(CinematicTickets, { content: hydrateTicketsContent({ ...rose(), ...flags }, [], false), pageVisibility: visibility }));
    const TRANSIT = 'id="transit-title"';

    it("shows the transit section with the map absent, empty or all true, and in an editor preview that passes none", () => {
      const base = tickets();
      for (const html of [base, tickets(null), tickets({}), tickets({ stadium: true, "chick-fil-a": true, "foothill-transit": true })]) expect(html).toBe(base);
      expect(base).toContain(TRANSIT);
    });
    it("hides the transit section when Foothill Transit is hidden and keeps every other section", () => {
      const html = tickets(hiding("foothill-transit"));
      expect(html).not.toContain(TRANSIT);
      expect(html).not.toContain("tickets-transit");
      for (const marker of ["perks-title", "tickets-includes", "tickets-directions", "tickets-buy"]) expect(html, marker).toContain(marker);
    });
    it("hides the transit section when either its own flag or the Foothill page says so", () => {
      expect(tickets({}, { transitVisible: false })).not.toContain(TRANSIT);
      expect(tickets({ "foothill-transit": true }, { transitVisible: false })).not.toContain(TRANSIT);
      expect(tickets(hiding("foothill-transit"), { transitVisible: false })).not.toContain(TRANSIT);
      expect(tickets(hiding("foothill-transit"), { transitVisible: true })).not.toContain(TRANSIT);
      expect(tickets({ "foothill-transit": true }, { transitVisible: true })).toContain(TRANSIT);
    });
    it("ignores the other two pages' switches", () => {
      expect(tickets(hiding("stadium", "chick-fil-a"))).toBe(tickets());
    });
    it("gets the club's own map from the public page, and nothing from a club without one", async () => {
      mocks.schema.mockReturnValue(mocks.trusted);
      mocks.tickets.mockResolvedValue(hydrateTicketsContent(rose(), [], false));
      const render = async (club: Scenario) => { serve(club); return inClub(club, await TicketsPage({ params: Promise.resolve({ slug: club.slug }) })); };
      const shown = await render(baseClub());
      expect(shown).toContain(TRANSIT);
      expect(shown).toBe(await render(withoutMap()));
      expect(await render(baseClub({ publicPageVisibility: hiding("foothill-transit") }))).not.toContain(TRANSIT);
      expect(await render(baseClub({ publicPageVisibility: hiding("stadium", "chick-fil-a") }))).toContain(TRANSIT);
      expect(await render(baseClub({ slug: "other-club" }))).toContain(TRANSIT);
      serve(baseClub({ presentationTemplateKey: notCinematic, publicPageVisibility: {} }));
      await expect(TicketsPage({ params: Promise.resolve({ slug: "rose-city" }) })).rejects.toThrow("not found");
    });
  });

  it("never auto-hides the partner artwork on the match cards", () => {
    const tickets = readFileSync("components/cinematic/CinematicTickets.tsx", "utf8");
    const stadium = readFileSync("components/cinematic/CinematicStadium.tsx", "utf8");
    expect(tickets).toContain('art(partner, "tickets-chick")');
    expect(stadium).toContain('art(partner, "robinson-chick")');
    expect(tickets.match(/pageVisible\(/g)).toHaveLength(1);
    expect(stadium).not.toContain("pageVisible");
  });
});
