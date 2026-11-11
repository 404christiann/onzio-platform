import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_MORE_ROWS,
  ADMIN_ROUTE_MANIFEST,
  getVisibleAdminMoreRows,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";
import {
  ADMIN_TABS,
  SPONSOR_INSIGHTS_FLAG,
  gamesTabStatus,
  getAdminTabDots,
  getAdminTabPages,
  getAdminTabTargets,
  getVisibleAdminTabs,
  isAdminTabPage,
  signUpsTabStatus,
  tabForPathname,
  tabForRoute,
  websiteTabStatus,
  type AdminTabId,
} from "@/lib/admin-tabs";

// ADMIN-RE-24: the five tabs that replace RE-05's top bar and More list
// (design: admin-plain-search-two-clubs.html).

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// Alpha stands in for Diverse City (academy@1: programs and tryouts on its
// website); clubhouse@1 stands in for a Rose City-style site.
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
const CLUBHOUSE: AdminRouteAccessContext = {
  ...ACADEMY,
  presentationTemplateKey: "clubhouse@1",
  hasLiveSignUps: false,
  adminFlags: { [SPONSOR_INSIGHTS_FLAG]: true },
};

const ids = (context: AdminRouteAccessContext) => getVisibleAdminTabs(context).map((tab) => tab.id);
const rowIds = (tab: AdminTabId, context: AdminRouteAccessContext) =>
  getAdminTabPages(tab, context).map((row) => row.id);

describe("tabs follow the club", () => {
  it("gives a programs club Home · Games · Programs · Website · Club", () => {
    expect(ids(ACADEMY)).toEqual(["home", "games", "programs", "website", "club"]);
  });

  it("gives a club without programs Home · Games · Website · Insights · Club when it has Sponsor Insights", () => {
    expect(ids(CLUBHOUSE)).toEqual(["home", "games", "website", "insights", "club"]);
    expect(ids({ ...CLUBHOUSE, adminFlags: {} })).toEqual(["home", "games", "website", "club"]);
  });

  it("shows Insights only for the add-on's flag set to true", () => {
    expect(ids({ ...ACADEMY, adminFlags: { [SPONSOR_INSIGHTS_FLAG]: true } })).toContain("insights");
    expect(ids({ ...ACADEMY, adminFlags: { sponsorInsights: true } })).not.toContain("insights");
  });

  it("has no tabs outside the reimagined admin", () => {
    expect(getVisibleAdminTabs({ ...ACADEMY, adminPortal: "classic" })).toEqual([]);
    expect(getVisibleAdminTabs({ ...ACADEMY, adminPortal: undefined })).toEqual([]);
    expect(getAdminTabTargets({ ...ACADEMY, adminPortal: "classic" })).toEqual([]);
  });

  it("links each tab to its own address, Home first", () => {
    expect(ADMIN_TABS.map((tab) => [tab.id, tab.href])).toEqual([
      ["home", "/admin"],
      ["games", "/admin/games"],
      ["programs", "/admin/programs-and-sign-ups"],
      ["website", "/admin/website"],
      ["insights", "/admin/insights"],
      ["club", "/admin/club"],
    ]);
    for (const tab of ADMIN_TABS) {
      if (tab.id === "home") continue;
      const segment = tab.href.slice("/admin/".length);
      expect(existsSync(resolve(process.cwd(), `app/admin/(protected)/${segment}/page.tsx`)), tab.href).toBe(true);
      // A tab address never takes over an existing page's address.
      expect(ADMIN_ROUTE_MANIFEST.some((route) => (route.href as string) === tab.href), tab.href).toBe(false);
    }
  });
});

describe("every page sits under exactly one tab", () => {
  it.each([
    ["a programs club", ACADEMY],
    ["a club without programs", CLUBHOUSE],
    ["a helper", { ...ACADEMY, role: "admin", isBillingAuthorized: false } as AdminRouteAccessContext],
    ["content changes paused", { ...ACADEMY, canMutateContent: false } as AdminRouteAccessContext],
  ])("lists each page the person can open once, for %s", (_name, context) => {
    const listed = getVisibleAdminTabs(context).flatMap((tab) => rowIds(tab.id, context));
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(getVisibleAdminMoreRows(context).map((row) => row.id).sort());
  });

  it("puts the roster with Programs where there is a Programs tab, otherwise with Games", () => {
    // ADMIN-RE-12c (deliberate): one "Programs and tryouts" row replaces the two.
    expect(rowIds("programs", ACADEMY)).toEqual(["programs-and-tryouts", "team-roster", "sign-up-forms"]);
    expect(rowIds("games", ACADEMY)).toEqual([
      "games",
      "this-season",
      "league-table",
      "player-numbers",
      "how-the-team-is-doing",
    ]);
    expect(rowIds("games", CLUBHOUSE)).toEqual([
      "games",
      "this-season",
      "league-table",
      "player-numbers",
      "how-the-team-is-doing",
      "team-roster",
    ]);
    // Without a Programs tab, the sign-up forms sit under Club.
    expect(rowIds("club", CLUBHOUSE)).toEqual(["your-club", "who-can-sign-in", "payments-and-plan", "sign-up-forms"]);
  });

  it("keeps the website's pages under Website and the club's under Club", () => {
    expect(rowIds("website", ACADEMY)).toEqual(["about-page", "contact-page", "sponsors", "shop"]);
    expect(rowIds("website", { ...ACADEMY, canMutateContent: false })[0]).toBe("homepage");
    expect(rowIds("club", ACADEMY)).toEqual(["your-club", "who-can-sign-in", "payments-and-plan"]);
    // Owner-only pages follow the manifest's rules.
    expect(rowIds("club", { ...ACADEMY, role: "admin", isBillingAuthorized: false })).toEqual(["your-club"]);
  });

  it("files a page added to the manifest later under the tab of its group", () => {
    // The Rose City 2027 pages are website-group routes: they need no rule here.
    expect(tabForRoute({ id: "about", groupId: "website" }, false)).toBe("website");
    expect(tabForRoute({ id: "standings", groupId: "competition" }, false)).toBe("games");
    expect(tabForRoute({ id: "branding", groupId: "club-settings" }, true)).toBe("club");
    for (const row of ADMIN_MORE_ROWS) {
      expect(ADMIN_ROUTE_MANIFEST.some((route) => route.id === row.routeId), row.id).toBe(true);
    }
  });

  it("lists nothing for a tab the club does not have", () => {
    expect(getAdminTabPages("programs", CLUBHOUSE)).toEqual([]);
    expect(getAdminTabPages("insights", ACADEMY)).toEqual([]);
  });
});

describe("the current tab", () => {
  const targets = getAdminTabTargets(ACADEMY);
  it.each([
    ["/admin", "home"],
    ["/admin/games", "games"],
    ["/admin/schedule", "games"],
    ["/admin/score", "games"],
    ["/admin/analytics", "games"],
    ["/admin/roster", "programs"],
    ["/admin/sign-ups", "programs"],
    ["/admin/programs", "programs"],
    ["/admin/programs-and-sign-ups", "programs"],
    ["/admin/homepage", "website"],
    ["/admin/shop", "website"],
    ["/admin/members", "club"],
    ["/admin/your-club", "club"],
    ["/admin/payments", "club"],
    ["/admin/somewhere-new", "home"],
    ["/admin/games/players/0e0e0e0e-0000-4000-8000-000000000000", "games"],
  ])("puts %s under %s", (pathname, tab) => {
    expect(tabForPathname(pathname, targets)).toBe(tab);
  });

  it("puts the roster under Games for a club without programs", () => {
    expect(tabForPathname("/admin/roster", getAdminTabTargets(CLUBHOUSE))).toBe("games");
  });

  it("knows a tab's own page, where there is no back link", () => {
    expect(isAdminTabPage("/admin")).toBe(true);
    expect(isAdminTabPage("/admin/games")).toBe(true);
    expect(isAdminTabPage("/admin/schedule")).toBe(false);
  });
});

describe("red dots and status pills", () => {
  const tabs = getVisibleAdminTabs(ACADEMY);

  it("marks Games for a missing score and Programs for new sign-ups, never Home", () => {
    expect(getAdminTabDots(tabs, { gamesNeedingScore: 2, newSignUps: 3 })).toEqual(["games", "programs"]);
    expect(getAdminTabDots(tabs, { gamesNeedingScore: 0, newSignUps: 0 })).toEqual([]);
    expect(getAdminTabDots(tabs, { gamesNeedingScore: null, newSignUps: null })).toEqual([]);
    expect(getAdminTabDots(getVisibleAdminTabs(CLUBHOUSE), { gamesNeedingScore: 0, newSignUps: 4 })).toEqual([]);
  });

  it("words the pills with plural rules and thousands separators, and stays quiet when unknown", () => {
    expect(gamesTabStatus(1)).toEqual({ text: "1 game needs a score", hue: "amber" });
    expect(gamesTabStatus(1284)).toEqual({ text: "1,284 games need a score", hue: "amber" });
    expect(gamesTabStatus(0)).toEqual({ text: "All scores are in", hue: "green" });
    expect(gamesTabStatus(null)).toBeNull();
    expect(signUpsTabStatus(1)).toEqual({ text: "1 new sign-up this week", hue: "green" });
    expect(signUpsTabStatus(3)).toEqual({ text: "3 new sign-ups this week", hue: "green" });
    expect(signUpsTabStatus(0)).toEqual({ text: "No new sign-ups this week" });
    expect(signUpsTabStatus(null)).toBeNull();
    expect(websiteTabStatus("held").text).toBe("Not live yet");
    expect(websiteTabStatus("paused").text).toBe("Your website is paused");
    expect(websiteTabStatus("live").text).toBe("Your website is live");
  });
});

describe("tab pages", () => {
  const pages = ["games", "programs-and-sign-ups", "website", "club", "insights"].map((segment) => [
    segment,
    read(`app/admin/(protected)/${segment}/page.tsx`),
  ]);

  it.each(pages)("%s loads on the server through the shared checks", (_segment, page) => {
    expect(page).not.toContain('"use client"');
    expect(page).toContain("await loadAdminTabPage(");
    expect(page).toContain('export const dynamic = "force-dynamic";');
  });

  it("sends a classic club, or a club without the tab, to /admin", () => {
    const loader = read("lib/admin-tab-page.ts");
    expect(loader).toContain("requireFreshClubSession(supabase)");
    expect(loader).toContain('if (portal.portal !== "reimagined") redirect("/admin");');
    expect(loader).toContain('if (!getVisibleAdminTabs(access).some((candidate) => candidate.id === tab)) redirect("/admin");');
    expect(loader).not.toMatch(/service-role|SERVICE_ROLE/);
  });

  it("never shows zeros for website visits: Insights says why there are no numbers", () => {
    const insights = read("components/admin/reimagined/InsightsWaiting.tsx");
    expect(insights).toContain("Your website isn’t live yet");
    expect(insights).toContain("No visit numbers yet");
    expect(insights).not.toMatch(/\b0 visits\b/);
  });
});

// ADMIN-RE-24d: a player's page under the Games tab, built from RE-19's pieces.
describe("player page", () => {
  const route = read("app/admin/(protected)/games/players/[playerId]/page.tsx");
  const view = read("components/admin/reimagined/PlayerPage.tsx");
  const analytics = read("components/admin/reimagined/TeamAnalytics.tsx");

  it("loads through the Games tab's checks and only finds players in the shown season", () => {
    expect(route).not.toContain('"use client"');
    expect(route).toContain('await loadAdminTabPage("games")');
    expect(route).toContain("loadTeamAnalytics(supabase, club.id)");
    expect(route).toContain("if (!group || !player) notFound();");
  });

  it("reuses RE-19's player view and match-log read instead of rebuilding them", () => {
    expect(view).toContain('import { AnalyticsScope, PlayerDetail, usePlayerLog } from "./TeamAnalytics";');
    expect(view).not.toContain("fetchPlayerMatchLog(");
    expect(analytics.match(/fetchPlayerMatchLog\(/g)).toHaveLength(1);
    expect(analytics).toContain("const { log, retry } = usePlayerLog(playerId, keeper, seasonId);");
  });

  it("is a page under Games with ‹ Games and the player's name in the page bar", () => {
    expect(isAdminTabPage("/admin/games/players/x")).toBe(false);
    expect(view).toContain("<TopBarTitle title={player.name} />");
  });
});

describe("tab icons", () => {
  const approved = JSON.parse(read("components/admin/icons/approved-selection.json"));

  it("uses approved icons.download glyphs, outline and solid for the selected tab", () => {
    expect(approved.weight).toBe("medium");
    expect(approved.selectedTabFill).toBe("solid");
    expect(Object.keys(approved.selectedTabs).sort()).toEqual(ADMIN_TABS.map((tab) => tab.id).sort());
    for (const asset of Object.values(approved.selectedTabs) as string[]) {
      const svg = read(`components/admin/icons/assets/solid/${asset}.svg`);
      expect(svg).toContain('fill="currentColor"');
      expect(svg).not.toContain('fill="black"');
    }
    expect(approved.selections.globe).toBe("navigation/globe");
    expect(approved.selections.settings).toBe("interface/settings");
  });
});
