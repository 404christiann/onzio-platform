import { describe, expect, it } from "vitest";
import {
  PUBLIC_PAGE_KEYS,
  PUBLIC_PAGE_PATHS,
  isHiddenPageHref,
  isPublicPageKey,
  pageVisible,
  parsePublicPageVisibility,
  withoutHiddenPageLinks,
} from "@/lib/public-page-visibility";

describe("pageVisible", () => {
  it.each(PUBLIC_PAGE_KEYS)("shows %s when the club, the map or the key is missing", (key) => {
    expect(pageVisible(undefined, key)).toBe(true);
    expect(pageVisible(null, key)).toBe(true);
    expect(pageVisible({}, key)).toBe(true);
    expect(pageVisible({ publicPageVisibility: undefined }, key)).toBe(true);
    expect(pageVisible({ publicPageVisibility: null }, key)).toBe(true);
    expect(pageVisible({ publicPageVisibility: {} }, key)).toBe(true);
  });

  it.each(PUBLIC_PAGE_KEYS)("shows %s when it is explicitly true", (key) => {
    expect(pageVisible({ publicPageVisibility: { [key]: true } }, key)).toBe(true);
  });

  it.each(PUBLIC_PAGE_KEYS)("hides %s only when it is explicitly false", (key) => {
    expect(pageVisible({ publicPageVisibility: { [key]: false } }, key)).toBe(false);
  });

  it("scopes a hidden page to its own key", () => {
    const club = { publicPageVisibility: { stadium: false } };
    expect(pageVisible(club, "stadium")).toBe(false);
    expect(pageVisible(club, "chick-fil-a")).toBe(true);
    expect(pageVisible(club, "foothill-transit")).toBe(true);
    expect(pageVisible(club, "tickets")).toBe(true);
    expect(pageVisible(club, "season-membership")).toBe(true);
  });

  it("scopes each Tickets-menu page to its own key", () => {
    const tickets = { publicPageVisibility: { tickets: false } };
    expect(pageVisible(tickets, "tickets")).toBe(false);
    expect(pageVisible(tickets, "season-membership")).toBe(true);
    const season = { publicPageVisibility: { "season-membership": false } };
    expect(pageVisible(season, "season-membership")).toBe(false);
    expect(pageVisible(season, "tickets")).toBe(true);
    for (const key of ["stadium", "chick-fil-a", "foothill-transit"] as const) {
      expect(pageVisible(tickets, key)).toBe(true);
      expect(pageVisible(season, key)).toBe(true);
    }
  });
});

describe("parsePublicPageVisibility", () => {
  it("keeps known keys with boolean values", () => {
    expect(parsePublicPageVisibility({ stadium: false, "chick-fil-a": true, "foothill-transit": false })).toEqual({
      stadium: false,
      "chick-fil-a": true,
      "foothill-transit": false,
    });
  });

  it("drops unknown keys and values that are not booleans", () => {
    expect(
      parsePublicPageVisibility({
        stadium: "false",
        "chick-fil-a": 0,
        "foothill-transit": null,
        shop: false,
        robinson: true,
        __proto__: { stadium: false },
      }),
    ).toEqual({});
    expect(parsePublicPageVisibility({ stadium: false, shop: false, "chick-fil-a": "no" })).toEqual({ stadium: false });
    expect(parsePublicPageVisibility({ tickets: "false", "season-membership": 0, "tickets/season-membership": false })).toEqual({});
  });

  it("keeps the Tickets-menu keys with boolean values", () => {
    expect(parsePublicPageVisibility({ tickets: false, "season-membership": true })).toEqual({ tickets: false, "season-membership": true });
  });

  it.each([null, undefined, [], [true], "stadium", 7, true])("reads %j as nothing hidden", (raw) => {
    expect(parsePublicPageVisibility(raw)).toEqual({});
  });
});

describe("page keys", () => {
  it("recognises exactly the five pages", () => {
    expect([...PUBLIC_PAGE_KEYS]).toEqual(["stadium", "chick-fil-a", "foothill-transit", "tickets", "season-membership"]);
    expect(PUBLIC_PAGE_KEYS.every(isPublicPageKey)).toBe(true);
    for (const other of ["shop", "robinson", "", "Stadium", "know-before-you-go", "tickets-page", null, undefined, 1]) expect(isPublicPageKey(other)).toBe(false);
  });

  it("has a public path for every key", () => {
    expect(Object.keys(PUBLIC_PAGE_PATHS).sort()).toEqual([...PUBLIC_PAGE_KEYS].sort());
  });

  it("points the Tickets-menu keys at their own addresses, and never at Know Before You Go", () => {
    expect(PUBLIC_PAGE_PATHS.tickets).toBe("/tickets");
    expect(PUBLIC_PAGE_PATHS["season-membership"]).toBe("/tickets/season-membership");
    expect(Object.values(PUBLIC_PAGE_PATHS)).not.toContain("/tickets/know-before-you-go");
  });
});

describe("isHiddenPageHref", () => {
  const hiding = (...keys: (typeof PUBLIC_PAGE_KEYS)[number][]) => ({ publicPageVisibility: Object.fromEntries(keys.map((key) => [key, false])) });

  it("is false while nothing is hidden, whatever the club or map looks like", () => {
    for (const club of [undefined, null, {}, { publicPageVisibility: undefined }, { publicPageVisibility: null }, { publicPageVisibility: {} }, { publicPageVisibility: { tickets: true, "season-membership": true } }]) {
      for (const href of ["/tickets", "/tickets/season-membership", "/stadium", "/", ""]) expect(isHiddenPageHref(href, club), href).toBe(false);
    }
  });

  it("is true for the address of each hidden page and false for the page that is still shown", () => {
    expect(isHiddenPageHref("/tickets", hiding("tickets"))).toBe(true);
    expect(isHiddenPageHref("/tickets/season-membership", hiding("tickets"))).toBe(false);
    expect(isHiddenPageHref("/tickets/season-membership", hiding("season-membership"))).toBe(true);
    expect(isHiddenPageHref("/tickets", hiding("season-membership"))).toBe(false);
    expect(isHiddenPageHref("/tickets", hiding("tickets", "season-membership"))).toBe(true);
    expect(isHiddenPageHref("/tickets/season-membership", hiding("tickets", "season-membership"))).toBe(true);
    expect(isHiddenPageHref("/stadium", hiding("stadium"))).toBe(true);
    expect(isHiddenPageHref("/stadium/chick-fil-a", hiding("chick-fil-a"))).toBe(true);
    expect(isHiddenPageHref("/stadium/foothill-transit", hiding("foothill-transit"))).toBe(true);
  });

  it("compares the path only: a query, an #anchor or trailing slashes do not dodge the switch", () => {
    const club = hiding("tickets", "stadium");
    for (const href of ["/tickets/", "/tickets//", "/tickets?ref=home", "/tickets#prices", "/tickets/?a=1#b", "/stadium#parking-lot-no-5"]) expect(isHiddenPageHref(href, club), href).toBe(true);
  });

  it("matches the path exactly, never as a prefix, so Know Before You Go stays reachable", () => {
    const club = hiding("tickets", "season-membership");
    for (const href of ["/tickets/know-before-you-go", "/tickets/know-before-you-go#faq", "/tickets/season-membership/extra", "/tickets-archive", "/ticketsx", "/", "/schedule", "/shop"]) expect(isHiddenPageHref(href, club), href).toBe(false);
  });

  it("never matches an external address, a protocol-relative one or an empty value", () => {
    const club = hiding("tickets", "season-membership", "stadium");
    for (const href of ["https://example.com/tickets", "http://example.com/stadium", "//example.com/tickets", "mailto:tickets@example.com", "tickets", "./tickets", "", "   "]) expect(isHiddenPageHref(href, club), href).toBe(false);
    for (const href of [null, undefined]) expect(isHiddenPageHref(href, club)).toBe(false);
  });

  it("answers the way withoutHiddenPageLinks does for the same address", () => {
    const club = hiding("tickets");
    const links = ["/tickets", "/tickets/season-membership", "/tickets/know-before-you-go", "/schedule"].map((href) => ({ href }));
    expect(withoutHiddenPageLinks(links, club).map((link) => link.href)).toEqual(links.filter((link) => !isHiddenPageHref(link.href, club)).map((link) => link.href));
  });
});
