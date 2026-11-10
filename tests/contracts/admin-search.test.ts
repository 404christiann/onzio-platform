import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AdminRouteAccessContext } from "@/lib/admin-route-manifest";
import {
  gameSearchItems,
  getAdminSearchItems,
  plainFilter,
  playerSearchItems,
  searchWords,
  type AdminSearchItem,
} from "@/lib/admin-search";
import { SPONSOR_INSIGHTS_FLAG } from "@/lib/admin-tabs";

// ADMIN-RE-24c: search on the new admin (design: admin-plain-search-two-clubs.html).

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const ACADEMY: AdminRouteAccessContext = {
  role: "owner",
  presentationTemplateKey: "academy@1",
  isBillingAuthorized: true,
  canMutateContent: true,
  storeEnabled: true,
  adminPortal: "reimagined",
  adminFlags: {},
  hasLiveSignUps: true,
};

/** What cmdk would show for a query: matching items, best score first, list order on ties. */
function rank(items: readonly AdminSearchItem[], query: string): string[] {
  return items
    .map((item, index) => ({ item, index, score: plainFilter(item.id, query, searchWords(item)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item.label);
}

describe("plainFilter: word starts first, never fuzzy", () => {
  const items = [
    ...getAdminSearchItems(ACADEMY),
    ...playerSearchItems([
      { id: "p1", name: "Sam Okafor", number: 9, position: "Forward" },
      { id: "p2", name: "Maya Chen", number: 11, position: "Forward" },
    ]),
  ];

  it("finds Sam Okafor for “sam”, not Sign-up forms (cmdk's fuzzy match ranked that first)", () => {
    expect(rank(items, "sam")).toEqual(["Sam Okafor"]);
  });

  it("matches the start of the name, then any word start, then anywhere", () => {
    expect(plainFilter("x", "team", ["Team roster"])).toBe(1);
    expect(plainFilter("x", "roster", ["Team roster"])).toBe(0.9);
    expect(plainFilter("x", "oste", ["Team roster"])).toBe(0.5);
    expect(plainFilter("x", "up", ["Sign-up forms"])).toBe(0.9);
    expect(plainFilter("x", "games", ["League table", "Games"])).toBe(0.3);
    expect(plainFilter("x", "rgm", ["Programs"])).toBe(0);
    expect(plainFilter("x", "   ", ["Anything"])).toBe(1);
  });

  it("puts the page named “roster” above pages that only sit near it", () => {
    expect(rank(items, "roster")[0]).toBe("Team roster");
    expect(rank(items, "score")[0]).toBe("Enter a score");
  });
});

describe("the list follows the manifest", () => {
  it("lists the person's jobs, then each tab and its pages with the tab as a hint", () => {
    const items = getAdminSearchItems(ACADEMY);
    expect(items.filter((item) => item.group === "Jobs").map((item) => item.label)).toEqual([
      "Enter a score",
      "Add a game",
      "See registrations",
      "Edit my website",
    ]);
    const roster = items.find((item) => item.label === "Team roster");
    expect(roster).toMatchObject({ group: "Pages", hint: "Programs", href: "/admin/roster" });
    expect(items.find((item) => item.id === "tab:games")).toMatchObject({ label: "Games and season", href: "/admin/games" });
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it("never lists a page the person cannot open", () => {
    const helper = getAdminSearchItems({ ...ACADEMY, role: "admin", isBillingAuthorized: false });
    const labels = helper.map((item) => item.label);
    expect(labels).not.toContain("Payments and plan");
    expect(labels).not.toContain("Who can sign in");
    const clubhouse = getAdminSearchItems({ ...ACADEMY, presentationTemplateKey: "clubhouse@1", adminFlags: { [SPONSOR_INSIGHTS_FLAG]: true } });
    expect(clubhouse.map((item) => item.label)).not.toContain("Tryouts");
    expect(clubhouse.find((item) => item.id === "tab:insights")?.href).toBe("/admin/insights");
    expect(getAdminSearchItems({ ...ACADEMY, adminPortal: "classic" })).toEqual([]);
  });

  it("opens a player's page under Games, and an upcoming game on the Games page", () => {
    expect(playerSearchItems([{ id: "p1", name: "Sam Okafor", number: 9, position: "Forward" }])[0]).toMatchObject({
      label: "Sam Okafor",
      hint: "#9 · Forward",
      href: "/admin/games/players/p1",
    });
    expect(gameSearchItems([{ id: "g1", opponent: "Westside Strikers", home: false, when: "Sat, Nov 14" }], "/admin/schedule")[0]).toMatchObject({
      label: "at Westside Strikers",
      hint: "Sat, Nov 14",
      href: "/admin/schedule",
    });
  });
});

describe("search component", () => {
  const view = read("components/admin/reimagined/AdminSearch.tsx");
  const layout = read("app/admin/(protected)/layout.tsx");
  const extras = read("lib/admin-tab-page.ts");

  it("is cmdk inside a Base UI Dialog that traps focus, with the plain filter", () => {
    expect(view).toContain('import { Command } from "cmdk";');
    expect(view).toContain('<Dialog.Root open={open} onOpenChange={change} modal="trap-focus">');
    expect(view).toContain("filter={plainFilter}");
    // The query resets on close.
    expect(view).toContain('if (!next) setQuery("");');
    expect(read("package.json")).toContain('"cmdk": "1.1.1"');
  });

  it("opens from ⌘K and from both triggers, with no animation", () => {
    expect(view).toMatch(/event\.metaKey \|\| event\.ctrlKey/);
    const css = read("components/admin/reimagined/search.module.css");
    expect(css).not.toMatch(/\.palette[^{]*\{[^}]*transition/);
    expect(read("components/admin/reimagined/ReimaginedShell.tsx")).toContain("<SearchBox onOpen={openSearch} />");
    expect(read("components/admin/reimagined/ReimaginedShell.tsx")).toContain("<SearchButton onOpen={openSearch} />");
  });

  it("gets its list from the server, built after the manifest's visibility rules", () => {
    expect(layout).toContain("...getAdminSearchItems(access),");
    expect(extras).toContain("export const readSearchExtras = cache(");
    expect(extras).toMatch(/from\("players"\)\.select\("id,name,number,position,active"\)\.eq\("club_id", clubId\)/);
    expect(extras).not.toMatch(/service-role|SERVICE_ROLE/);
  });
});
