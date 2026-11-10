import {
  ADMIN_MORE_ROWS,
  ADMIN_ROUTE_MANIFEST,
  getVisibleAdminMoreRows,
  getVisibleAdminRoutes,
  type AdminMoreRow,
  type AdminMoreRowId,
  type AdminRouteAccessContext,
  type AdminRouteGroupId,
  type AdminRouteId,
} from "@/lib/admin-route-manifest";

// ADMIN-RE-24: the five tabs of the reimagined admin (design:
// admin-plain-search-two-clubs.html). They replace the RE-05 top bar's
// "‹ Home" and the More list. The tabs follow the club: a club whose website
// has programs or tryouts gets a Programs tab (the roster lives there); a club
// with the Sponsor Insights add-on gets Insights. Every page in the route
// manifest sits under exactly one tab, found from its group unless a rule
// below says otherwise, so a page added to the manifest lands under a tab
// without touching this file. Visibility still comes from the manifest; this
// only places what the person may already open.

export type AdminTabId = "home" | "games" | "programs" | "website" | "insights" | "club";

export type AdminTab = Readonly<{
  id: AdminTabId;
  label: string;
  href: `/admin${string}`;
  /** The heading on the tab's own page. */
  title: string;
}>;

/** In the order they show, left to right and top to bottom. */
export const ADMIN_TABS = [
  { id: "home", label: "Home", href: "/admin", title: "Home" },
  { id: "games", label: "Games", href: "/admin/games", title: "Games and season" },
  { id: "programs", label: "Programs", href: "/admin/programs-and-sign-ups", title: "Programs and sign-ups" },
  { id: "website", label: "Website", href: "/admin/website", title: "Your website" },
  { id: "insights", label: "Insights", href: "/admin/insights", title: "Sponsor Insights" },
  { id: "club", label: "Club", href: "/admin/club", title: "Club and account" },
] as const satisfies readonly AdminTab[];

/** The admin_flags key that turns on the Insights tab (the Sponsor Insights add-on). */
export const SPONSOR_INSIGHTS_FLAG = "sponsor_insights";

const TAB_BY_ID = new Map<AdminTabId, AdminTab>(ADMIN_TABS.map((tab) => [tab.id, tab]));

export function getAdminTab(id: AdminTabId): AdminTab {
  return TAB_BY_ID.get(id) ?? ADMIN_TABS[0];
}

function hasProgramsTab(visible: ReadonlySet<AdminRouteId>): boolean {
  return visible.has("programs") || visible.has("tryouts");
}

/** The tabs this person sees. Empty outside the reimagined admin. */
export function getVisibleAdminTabs(context: AdminRouteAccessContext): readonly AdminTab[] {
  if (context.adminPortal !== "reimagined") return [];
  const visible = new Set(getVisibleAdminRoutes(context).map((route) => route.id));
  return ADMIN_TABS.filter((tab) => {
    if (tab.id === "programs") return hasProgramsTab(visible);
    if (tab.id === "insights") return context.adminFlags?.[SPONSOR_INSIGHTS_FLAG] === true;
    return true;
  });
}

const TAB_BY_GROUP: Record<AdminRouteGroupId, AdminTabId> = {
  website: "website",
  competition: "games",
  "club-settings": "club",
};

/**
 * Where a page lives. Pages without a group, and the few that move with the
 * club's tabs (roster and sign-ups under Programs where there is one), are
 * named here; everything else follows its group.
 */
export function tabForRoute(
  route: Readonly<{ id: AdminRouteId; groupId: AdminRouteGroupId | null }>,
  programsTab: boolean,
): AdminTabId {
  switch (route.id) {
    case "dashboard":
      return "home";
    case "analytics":
    case "add-game":
      return "games";
    case "roster":
      return programsTab ? "programs" : "games";
    case "programs":
    case "tryouts":
      return "programs";
    case "registrations":
    case "sign-ups":
      return programsTab ? "programs" : "club";
    default:
      return route.groupId ? TAB_BY_GROUP[route.groupId] : "club";
  }
}

/** A path and the tab it belongs to, for highlighting the current tab. */
export type AdminTabTarget = Readonly<{ href: `/admin${string}`; tab: AdminTabId }>;

/**
 * Every place this person can open, with its tab: the tab pages themselves and
 * each visible page in the manifest. Serializable, so the server works it out
 * once and the shell only matches the current path against it.
 */
export function getAdminTabTargets(context: AdminRouteAccessContext): readonly AdminTabTarget[] {
  const tabs = getVisibleAdminTabs(context);
  if (tabs.length === 0) return [];
  const routes = getVisibleAdminRoutes(context);
  const programsTab = tabs.some((tab) => tab.id === "programs");
  return [
    ...tabs.map((tab) => ({ href: tab.href, tab: tab.id })),
    ...routes
      .filter((route) => route.href !== "/admin")
      .map((route) => ({ href: route.href, tab: tabForRoute(route, programsTab) })),
  ];
}

function matches(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The tab for a path: the longest matching target wins; unknown paths sit under Home. */
export function tabForPathname(pathname: string, targets: readonly AdminTabTarget[]): AdminTabId {
  let best: AdminTabTarget | null = null;
  for (const target of targets) {
    if (!matches(pathname, target.href)) continue;
    if (!best || target.href.length > best.href.length) best = target;
  }
  return best?.tab ?? "home";
}

/** True on a tab's own page (or the home), where there is no "‹ <tab>" link. */
export function isAdminTabPage(pathname: string): boolean {
  return ADMIN_TABS.some((tab) => tab.href === pathname);
}

// Within a tab, pages read in this order; a page not named here (one added to
// the manifest later) follows, in the order of ADMIN_MORE_ROWS.
const PAGE_ORDER: readonly AdminMoreRowId[] = [
  "games",
  "this-season",
  "league-table",
  "player-numbers",
  "how-the-team-is-doing",
  "programs",
  "tryouts",
  "team-roster",
  "homepage",
  "about-page",
  "contact-page",
  "sponsors",
  "shop",
  "your-club",
  "who-can-sign-in",
  "payments-and-plan",
  "sign-up-forms",
];

const MORE_ROW_ROUTE = new Map<string, AdminRouteId>(
  ADMIN_MORE_ROWS.map((row) => [row.id, row.routeId]),
);
const ROUTE_GROUP = new Map<AdminRouteId, AdminRouteGroupId | null>(
  ADMIN_ROUTE_MANIFEST.map((route) => [route.id, route.groupId]),
);

function rank(id: AdminMoreRowId): number {
  const at = PAGE_ORDER.indexOf(id);
  return at === -1 ? PAGE_ORDER.length + ADMIN_MORE_ROWS.findIndex((row) => row.id === id) : at;
}

/** The pages listed on a tab's own page, in glossary words, for this person. */
export function getAdminTabPages(
  tab: AdminTabId,
  context: AdminRouteAccessContext,
): readonly AdminMoreRow[] {
  const tabs = getVisibleAdminTabs(context);
  if (!tabs.some((candidate) => candidate.id === tab)) return [];
  const programsTab = tabs.some((candidate) => candidate.id === "programs");
  return getVisibleAdminMoreRows(context)
    .filter((row) => {
      const routeId = MORE_ROW_ROUTE.get(row.id);
      if (!routeId) return false;
      return tabForRoute({ id: routeId, groupId: ROUTE_GROUP.get(routeId) ?? null }, programsTab) === tab;
    })
    .slice()
    .sort((a, b) => rank(a.id) - rank(b.id));
}

/** The counts that put a red dot on a tab. Unknown counts never show a dot. */
export type AdminTabNeeds = Readonly<{
  gamesNeedingScore: number | null;
  newSignUps: number | null;
}>;

/** Tabs that need you. Never Home: the home lists what needs you. */
export function getAdminTabDots(
  tabs: readonly AdminTab[],
  needs: AdminTabNeeds,
): readonly AdminTabId[] {
  const present = new Set(tabs.map((tab) => tab.id));
  const dots: AdminTabId[] = [];
  if (present.has("games") && (needs.gamesNeedingScore ?? 0) > 0) dots.push("games");
  if (present.has("programs") && (needs.newSignUps ?? 0) > 0) dots.push("programs");
  return dots;
}

const countFormat = new Intl.NumberFormat("en-US");
const plural = new Intl.PluralRules("en-US");

export type AdminTabStatus = Readonly<{ text: string; hue?: "amber" | "blue" | "green" | "coral" }>;

/** The Games tab's pill: "1 game needs a score", "All scores are in", or nothing when unknown. */
export function gamesTabStatus(gamesNeedingScore: number | null): AdminTabStatus | null {
  if (gamesNeedingScore === null) return null;
  if (gamesNeedingScore < 1) return { text: "All scores are in", hue: "green" };
  const words = plural.select(gamesNeedingScore) === "one" ? "game needs" : "games need";
  return { text: `${countFormat.format(gamesNeedingScore)} ${words} a score`, hue: "amber" };
}

/** The Programs tab's pill: "3 new sign-ups this week", or nothing when unknown. */
export function signUpsTabStatus(newSignUps: number | null): AdminTabStatus | null {
  if (newSignUps === null) return null;
  if (newSignUps < 1) return { text: "No new sign-ups this week" };
  const words = plural.select(newSignUps) === "one" ? "new sign-up" : "new sign-ups";
  return { text: `${countFormat.format(newSignUps)} ${words} this week`, hue: "green" };
}

/** The Website tab's pill, from whether the public site is held, paused or live. */
export function websiteTabStatus(state: "held" | "paused" | "live"): AdminTabStatus {
  if (state === "held") return { text: "Not live yet", hue: "coral" };
  if (state === "paused") return { text: "Your website is paused", hue: "coral" };
  return { text: "Your website is live", hue: "green" };
}
