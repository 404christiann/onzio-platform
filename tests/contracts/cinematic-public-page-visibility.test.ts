import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import type { ClubContext } from "@/lib/club-context";
import { CINEMATIC_NAV_ITEMS, defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { hydrateRobinsonContent, type RobinsonContent } from "@/lib/cinematic-robinson-content";
import { robinsonReferenceContent } from "@/lib/robinson-reference-content";
import { emptyTicketsContent, hydrateTicketsContent } from "@/lib/tickets-content";
import { PUBLIC_PAGE_KEYS, pageVisible, withoutHiddenPageLinks, type PublicPageKey, type PublicPageVisibility } from "@/lib/public-page-visibility";

// RC-PAGE-VISIBILITY: a club owner can hide the Robinson Stadium, Chick-fil-A and Foothill Transit pages. Absent or true = shown;
// only an explicit false hides a page, its menu and footer links and the blocks that repeat it on other pages.
const fixture = vi.hoisted(() => ({ pathname: "/_clubs/rose-city/schedule", content: null as ReturnType<typeof defaultCinematicHomepageContent> | null }));
const mocks = vi.hoisted(() => ({ club: vi.fn(), schema: vi.fn(), robinson: vi.fn(), chick: vi.fn(), transit: vi.fn(), tickets: vi.fn(), trusted: {} }));
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
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/cinematic-robinson-query", () => ({ fetchRobinsonContent: mocks.robinson }));
vi.mock("@/lib/chick-fil-a-query", () => ({ fetchChickFilAContent: mocks.chick }));
vi.mock("@/lib/stadium-query", () => ({ fetchStadiumContent: mocks.transit }));
vi.mock("@/lib/tickets-query", () => ({ fetchTicketsContent: mocks.tickets }));
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

const baseClub = (patch: Partial<ClubContext> = {}): ClubContext => ({
  id: "11111111-1111-4111-8111-111111111111", slug: "rose-city", name: "Rose City FC", primaryDomain: "rose-city.localhost", lifecycle: "active", publicAccess: "live", kind: "test",
  stripePriceId: null, tier: "pro", role: null, primaryColor: "#ff0018", secondaryColor: "#141414", presentationTemplateKey: "cinematic@2", storeEnabled: true, publicPageVisibility: {}, ...patch,
});
/** A context from before the map existed (or a test double): the field is simply not there. */
const withoutMap = (patch: Partial<ClubContext> = {}) => { const { publicPageVisibility: _map, ...rest } = baseClub(patch); return rest as unknown as ClubContext; };
/** Another design's key; the routes only serve cinematic@2. */
const notCinematic = "cinematic@1" as ClubContext["presentationTemplateKey"];
const hiding = (...keys: PublicPageKey[]): PublicPageVisibility => Object.fromEntries(keys.map(key => [key, false]));
const inClub = (club: ClubContext, child: ReactElement) => renderToStaticMarkup(createElement(ClubContextProvider, { club, children: child }));
const nav = (club: ClubContext) => inClub(club, createElement(CinematicNav, { editing: false }));
const footer = (club: ClubContext) => inClub(club, createElement(CinematicFooter));
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map(match => match[1]);
const count = (html: string, needle: string) => html.split(needle).length - 1;

const ROBINSON_HREF = 'href="/stadium"';
const PARKING_HREF = 'href="/stadium#parking-lot-no-5"';
const CHICK_HREF = 'href="/stadium/chick-fil-a"';
const FOOTHILL_HREF = 'href="/stadium/foothill-transit"';
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

  it("keeps Know Before You Go, Guidelines, Fan Code and Media Credentials while all three pages are hidden, and every other group", () => {
    const items = withoutHiddenPageLinks(CINEMATIC_NAV_ITEMS, { publicPageVisibility: hiding(...PUBLIC_PAGE_KEYS) });
    expect(items.find(item => item.id === "stadium-group")?.children?.map(child => child.id)).toEqual(["stadium-guidelines", "know-before-you", "fan-code", "media-credentials"]);
    expect(items.map(item => item.id)).toEqual(CINEMATIC_NAV_ITEMS.map(item => item.id));
    expect(items.find(item => item.id === "tickets")).toBe(CINEMATIC_NAV_ITEMS.find(item => item.id === "tickets"));
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

  it("removes every address of all three hidden pages from the desktop and phone menus", () => {
    const html = nav(baseClub({ publicPageVisibility: hiding(...PUBLIC_PAGE_KEYS) }));
    for (const href of [ROBINSON_HREF, PARKING_HREF, CHICK_HREF, FOOTHILL_HREF]) expect(html, href).not.toContain(href);
    for (const href of STADIUM_LINKS_KEPT) expect(html, href).toContain(href);
    // Everything outside the Stadium group is as before.
    expect(hrefs(html).filter(href => !href.startsWith("/stadium")).sort()).toEqual(hrefs(nav(withoutMap())).filter(href => !href.startsWith("/stadium")).sort());
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
        mocks.club.mockResolvedValue(map === undefined ? withoutMap() : baseClub({ publicPageVisibility: map }));
        expect(renderToStaticMarkup(await call("rose-city"))).not.toBe("");
      }
      expect(fetched()).toHaveBeenCalledTimes(4);
    });
    it("is a 404 once hidden, before any page content is read", async () => {
      mocks.club.mockResolvedValue(baseClub({ publicPageVisibility: hiding(key) }));
      await expect(call("rose-city")).rejects.toThrow("not found");
      expect(mocks.schema).not.toHaveBeenCalled();
      expect(fetched()).not.toHaveBeenCalled();
      expect(mocks.tickets).not.toHaveBeenCalled();
    });
    it.each(["academy@1", "clubhouse@1", "editorial@1", "cinematic@1"] as const)("is still a 404 for %s, hidden or not", async template => {
      for (const map of [{}, hiding(key)]) {
        mocks.club.mockResolvedValue(baseClub({ presentationTemplateKey: template as ClubContext["presentationTemplateKey"], publicPageVisibility: map }));
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
    mocks.club.mockResolvedValue(baseClub({ publicPageVisibility: hiding("stadium", "chick-fil-a") }));
    const html = renderToStaticMarkup(await FoothillTransitPage({ params: Promise.resolve({ slug: "rose-city" }) }));
    expect(html).toContain("Road to the Match page");
    expect(mocks.transit).toHaveBeenCalledWith(baseClub().id, mocks.trusted);
  });

  it("forwards /stadium/parking to the Robinson page, and is a 404 while that page is hidden or the design is not cinematic@2", async () => {
    const parking = () => StadiumParkingPage({ params: Promise.resolve({ slug: "rose-city" }) });
    for (const map of [undefined, {}, { stadium: true }, hiding("chick-fil-a", "foothill-transit")]) {
      mocks.club.mockResolvedValue(map === undefined ? withoutMap() : baseClub({ publicPageVisibility: map }));
      await expect(parking()).rejects.toThrow("redirect:/stadium#parking-lot-no-5");
    }
    mocks.club.mockResolvedValue(baseClub({ publicPageVisibility: hiding("stadium") }));
    await expect(parking()).rejects.toThrow("not found");
    mocks.club.mockResolvedValue(baseClub({ presentationTemplateKey: notCinematic }));
    await expect(parking()).rejects.toThrow("not found");
  });

  it("serves no hidden page from the catch-all route either, because every hidden address has its own page", () => {
    // [...revamp] only answers addresses without a dedicated page; the three pages and the parking alias all have one.
    for (const file of ["stadium/page.tsx", "stadium/chick-fil-a/page.tsx", "stadium/foothill-transit/page.tsx", "stadium/parking/page.tsx"]) {
      expect(() => readFileSync(`app/%5Fclubs/[slug]/${file}`, "utf8"), file).not.toThrow();
    }
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
      const render = async (club: ClubContext) => { mocks.club.mockResolvedValue(club); return renderToStaticMarkup(await StadiumPage({ params: Promise.resolve({ slug: club.slug }) })); };
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
      const render = async (club: ClubContext) => { mocks.club.mockResolvedValue(club); return inClub(club, await TicketsPage({ params: Promise.resolve({ slug: club.slug }) })); };
      const shown = await render(baseClub());
      expect(shown).toContain(TRANSIT);
      expect(shown).toBe(await render(withoutMap()));
      expect(await render(baseClub({ publicPageVisibility: hiding("foothill-transit") }))).not.toContain(TRANSIT);
      expect(await render(baseClub({ publicPageVisibility: hiding("stadium", "chick-fil-a") }))).toContain(TRANSIT);
      expect(await render(baseClub({ slug: "other-club" }))).toContain(TRANSIT);
      mocks.club.mockResolvedValue(baseClub({ presentationTemplateKey: notCinematic, publicPageVisibility: {} }));
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
