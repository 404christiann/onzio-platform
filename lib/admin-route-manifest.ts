import type { AdminFlags, AdminPortal } from "@/lib/admin-portal";
import { codeSiteAdminFor } from "@/lib/code-site-admin";

export type AdminRole = "owner" | "admin";

export type AdminRouteAccessContext = Readonly<{
  role: AdminRole | null;
  presentationTemplateKey: string | null;
  isBillingAuthorized: boolean;
  canMutateContent: boolean;
  /**
   * Operator-only clubs.store_enabled. The public Shop is hidden when off, but
   * the admin keeps Shop so owners can prepare kits under the Shop-off banner.
   */
  storeEnabled: boolean;
  /**
   * ADMIN-RE-05: which admin the club sees (onzio.clubs.admin_portal, read
   * fail-safe by lib/admin-portal.ts). Missing means classic: the home jobs and
   * More rows exist only in the reimagined admin.
   */
  adminPortal?: AdminPortal;
  /** Per-slice switches (onzio.clubs.admin_flags) for later ADMIN-RE slices. */
  adminFlags?: AdminFlags;
  /**
   * A non-archived sign-up form that is open or already has sign-ups. Decides
   * whether "See registrations" is a big job or a quiet "Sign-up forms" row.
   */
  hasLiveSignUps?: boolean;
}>;

export type AdminRouteGroupId =
  | "website"
  | "competition"
  | "club-settings";

export type AdminRouteFeature = "programs" | "contact" | "tryouts";

export type AdminRouteId =
  | "dashboard"
  | "homepage"
  | "programs"
  | "tryouts"
  | "shop"
  | "about"
  | "sponsors"
  | "contact"
  | "seasons"
  | "roster"
  | "schedule"
  | "match-stats"
  | "standings"
  | "registrations"
  | "analytics"
  | "branding"
  | "team-access"
  | "payments"
  | "add-game";

export type AdminRouteIconKey =
  | "dashboard"
  | "homepage"
  | "programs"
  | "tryouts"
  | "shop"
  | "about"
  | "sponsors"
  | "contact"
  | "seasons"
  | "roster"
  | "schedule"
  | "match-stats"
  | "season-stats"
  | "standings"
  | "registrations"
  | "analytics"
  | "branding"
  | "team-access"
  | "payments";

export type AdminGroupIconKey = "website" | "competition" | "club-settings";

export type AdminRouteDefinition = Readonly<{
  id: AdminRouteId;
  label: string;
  href: `/admin${string}`;
  iconKey: AdminRouteIconKey;
  groupId: AdminRouteGroupId | null;
  feature?: AdminRouteFeature;
  ownerOnly?: true;
  billingRequired?: true;
  /**
   * A page that exists only in the reimagined admin (ADMIN-RE-06 onward). It
   * never appears in the classic sidebar or search; the page itself sends a
   * classic club to the old one.
   */
  reimaginedOnly?: true;
}>;

export type AdminVisibleRoute = Readonly<{
  id: AdminRouteId;
  label: string;
  href: `/admin${string}`;
  iconKey: AdminRouteIconKey;
  groupId: AdminRouteGroupId | null;
  feature?: AdminRouteFeature;
  searchKeywords: readonly string[];
}>;

export type AdminNavigationDefinition =
  | Readonly<{ type: "link"; routeId: AdminRouteId }>
  | Readonly<{
      type: "group";
      id: AdminRouteGroupId;
      label: string;
      iconKey: AdminGroupIconKey;
      routeIds: readonly AdminRouteId[];
    }>;

export type AdminVisibleNavigationEntry =
  | Readonly<{ type: "link"; route: AdminVisibleRoute }>
  | Readonly<{
      type: "group";
      id: AdminRouteGroupId;
      label: string;
      iconKey: AdminGroupIconKey;
      routes: readonly AdminVisibleRoute[];
    }>;

export type AdminQuickActionId =
  | "registrations"
  | "manage-roster"
  | "manage-schedule"
  | "payments";

type AdminQuickActionDefinition = Readonly<{
  id: AdminQuickActionId;
  label: string;
  description: string;
  routeId: AdminRouteId;
  capability: "content-mutation" | "billing";
}>;

export type AdminQuickAction = Readonly<{
  id: AdminQuickActionId;
  label: string;
  description: string;
  routeId: AdminRouteId;
  href: `/admin${string}`;
}>;

// This manifest intentionally carries no search keywords. Search metadata is
// attached only after authorization and template filtering, so callers cannot
// accidentally build a search index from the unfiltered route definitions.
export const ADMIN_ROUTE_MANIFEST = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/admin",
    iconKey: "dashboard",
    groupId: null,
  },
  {
    id: "homepage",
    label: "Homepage",
    href: "/admin/homepage",
    iconKey: "homepage",
    groupId: "website",
  },
  {
    id: "programs",
    label: "Programs",
    href: "/admin/programs",
    iconKey: "programs",
    groupId: "website",
    feature: "programs",
  },
  {
    id: "tryouts",
    label: "Tryouts",
    href: "/admin/tryouts",
    iconKey: "tryouts",
    groupId: "website",
    feature: "tryouts",
  },
  {
    id: "shop",
    label: "Shop",
    href: "/admin/shop",
    iconKey: "shop",
    groupId: "website",
  },
  {
    id: "about",
    label: "About",
    href: "/admin/about",
    iconKey: "about",
    groupId: "website",
  },
  {
    id: "sponsors",
    label: "Sponsors",
    href: "/admin/sponsors",
    iconKey: "sponsors",
    groupId: "website",
  },
  {
    id: "contact",
    label: "Contact",
    href: "/admin/contact",
    iconKey: "contact",
    groupId: "website",
    feature: "contact",
  },
  {
    id: "seasons",
    label: "Seasons",
    href: "/admin/seasons",
    iconKey: "seasons",
    groupId: "competition",
  },
  {
    id: "roster",
    label: "Roster",
    href: "/admin/roster",
    iconKey: "roster",
    groupId: "competition",
  },
  {
    id: "schedule",
    label: "Schedule",
    href: "/admin/schedule",
    iconKey: "schedule",
    groupId: "competition",
  },
  {
    id: "match-stats",
    label: "Stats",
    href: "/admin/stats",
    iconKey: "match-stats",
    groupId: "competition",
  },
  {
    id: "standings",
    label: "Standings",
    href: "/admin/standings",
    iconKey: "standings",
    groupId: "competition",
  },
  {
    id: "registrations",
    label: "Registrations",
    href: "/admin/registrations",
    iconKey: "registrations",
    groupId: null,
  },
  {
    id: "analytics",
    label: "Analytics",
    href: "/admin/analytics",
    iconKey: "analytics",
    groupId: null,
  },
  {
    id: "branding",
    label: "Branding",
    href: "/admin/branding",
    iconKey: "branding",
    groupId: "club-settings",
  },
  {
    id: "team-access",
    label: "Team Access",
    href: "/admin/members",
    iconKey: "team-access",
    groupId: "club-settings",
    ownerOnly: true,
  },
  {
    id: "payments",
    label: "Payments",
    href: "/admin/payments",
    iconKey: "payments",
    groupId: null,
    ownerOnly: true,
    billingRequired: true,
  },
  {
    id: "add-game",
    label: "Add a game",
    href: "/admin/add-game",
    iconKey: "schedule",
    groupId: null,
    reimaginedOnly: true,
  },
] as const satisfies readonly AdminRouteDefinition[];

export const ADMIN_NAVIGATION_MANIFEST = [
  { type: "link", routeId: "dashboard" },
  {
    type: "group",
    id: "website",
    label: "Website",
    iconKey: "website",
    routeIds: [
      "homepage",
      "programs",
      "tryouts",
      "shop",
      "about",
      "sponsors",
      "contact",
    ],
  },
  {
    type: "group",
    id: "competition",
    label: "Competition",
    iconKey: "competition",
    routeIds: [
      "seasons",
      "roster",
      "schedule",
      "match-stats",
      "standings",
    ],
  },
  { type: "link", routeId: "registrations" },
  { type: "link", routeId: "analytics" },
  {
    type: "group",
    id: "club-settings",
    label: "Club Settings",
    iconKey: "club-settings",
    routeIds: ["branding", "team-access"],
  },
  { type: "link", routeId: "payments" },
] as const satisfies readonly AdminNavigationDefinition[];

export const ADMIN_QUICK_ACTION_MANIFEST = [
  {
    id: "registrations",
    label: "Registrations",
    description: "Manage registration forms and registrants.",
    routeId: "registrations",
    capability: "content-mutation",
  },
  {
    id: "manage-roster",
    label: "Manage Roster",
    description: "Manage players and staff.",
    routeId: "roster",
    capability: "content-mutation",
  },
  {
    id: "manage-schedule",
    label: "Manage Schedule",
    description: "Manage fixtures and results.",
    routeId: "schedule",
    capability: "content-mutation",
  },
  {
    id: "payments",
    label: "Payments",
    description: "Manage billing and invoices.",
    routeId: "payments",
    capability: "billing",
  },
] as const satisfies readonly AdminQuickActionDefinition[];

const ADMIN_ROUTE_SEARCH_KEYWORDS = {
  dashboard: ["overview", "home"],
  homepage: ["website", "hero", "slideshow", "story"],
  programs: ["website", "programs", "offerings", "registration"],
  tryouts: ["website", "tryouts", "events", "registration"],
  shop: ["website", "shop", "store", "kits", "merchandise"],
  about: ["website", "about", "club story"],
  sponsors: ["website", "sponsors", "partners"],
  contact: ["website", "contact", "email", "phone"],
  seasons: ["competition", "seasons", "active season"],
  roster: ["competition", "roster", "players", "staff"],
  schedule: ["competition", "schedule", "fixtures", "matches"],
  "match-stats": ["competition", "stats", "match stats", "season stats", "season totals", "game statistics", "player statistics"],
  standings: ["competition", "standings", "table"],
  registrations: ["registrations", "forms", "registrants"],
  analytics: ["analytics", "insights", "performance", "charts"],
  branding: ["club settings", "branding", "logo", "social links"],
  "team-access": [
    "club settings",
    "team access",
    "admins",
    "members",
    "permissions",
  ],
  payments: ["payments", "billing", "subscription", "invoices"],
  "add-game": ["schedule", "fixtures", "add a game", "new match"],
} as const satisfies Record<AdminRouteId, readonly string[]>;

const ROUTE_BY_ID = new Map<AdminRouteId, AdminRouteDefinition>(
  ADMIN_ROUTE_MANIFEST.map((route) => [route.id, route]),
);

function isProtectedAdminRole(
  role: AdminRouteAccessContext["role"],
): role is AdminRole {
  return role === "owner" || role === "admin";
}

export function isAdminRouteVisible(
  route: AdminRouteDefinition,
  context: AdminRouteAccessContext,
): boolean {
  if (!isProtectedAdminRole(context.role)) return false;
  if (route.reimaginedOnly && context.adminPortal !== "reimagined") return false;
  const siteAdmin = codeSiteAdminFor(context);
  if (route.id === "programs" && !siteAdmin?.programs.routeVisible) return false;
  if (route.id === "tryouts" && !siteAdmin?.tryouts.routeVisible) return false;
  // Only designs that publish a Contact page get the Contact editor; its
  // details are used nowhere else on other designs.
  if (route.id === "contact" && !siteAdmin?.contact.routeVisible) return false;
  if (route.ownerOnly && context.role !== "owner") return false;
  if (
    route.billingRequired &&
    (context.role !== "owner" || !context.isBillingAuthorized)
  ) {
    return false;
  }
  return true;
}

function toVisibleRoute(route: AdminRouteDefinition): AdminVisibleRoute {
  return {
    id: route.id,
    label: route.label,
    href: route.href,
    iconKey: route.iconKey,
    groupId: route.groupId,
    ...(route.feature ? { feature: route.feature } : {}),
    searchKeywords: ADMIN_ROUTE_SEARCH_KEYWORDS[route.id],
  };
}

export function getVisibleAdminRoutes(
  context: AdminRouteAccessContext,
): readonly AdminVisibleRoute[] {
  return ADMIN_ROUTE_MANIFEST.filter((route) =>
    isAdminRouteVisible(route, context),
  ).map(toVisibleRoute);
}

export function getVisibleAdminNavigation(
  context: AdminRouteAccessContext,
): readonly AdminVisibleNavigationEntry[] {
  const visibleRoutes = new Map(
    getVisibleAdminRoutes(context).map((route) => [route.id, route]),
  );
  const navigation: AdminVisibleNavigationEntry[] = [];

  for (const entry of ADMIN_NAVIGATION_MANIFEST) {
    if (entry.type === "link") {
      const route = visibleRoutes.get(entry.routeId);
      if (route) navigation.push({ type: "link", route });
      continue;
    }

    const routes = entry.routeIds.flatMap((routeId) => {
      const route = visibleRoutes.get(routeId);
      return route ? [route] : [];
    });
    if (routes.length === 0) continue;
    navigation.push({
      type: "group",
      id: entry.id,
      label: entry.label,
      iconKey: entry.iconKey,
      routes,
    });
  }

  return navigation;
}

export function getVisibleAdminQuickActions(
  context: AdminRouteAccessContext,
): readonly AdminQuickAction[] {
  const visibleRouteIds = new Set(
    getVisibleAdminRoutes(context).map((route) => route.id),
  );

  return ADMIN_QUICK_ACTION_MANIFEST.flatMap((action) => {
    if (!visibleRouteIds.has(action.routeId)) return [];
    if (
      action.capability === "content-mutation" &&
      !context.canMutateContent
    ) {
      return [];
    }
    if (action.capability === "billing" && !context.isBillingAuthorized) {
      return [];
    }

    const route = ROUTE_BY_ID.get(action.routeId);
    if (!route) return [];
    return [
      {
        id: action.id,
        label: action.label,
        description: action.description,
        routeId: action.routeId,
        href: route.href,
      },
    ];
  });
}

function pathnameMatchesRoute(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getAdminGroupForPathname(
  pathname: string,
  context: AdminRouteAccessContext,
): AdminRouteGroupId | null {
  const route = getVisibleAdminRoutes(context).find((candidate) =>
    pathnameMatchesRoute(pathname, candidate.href),
  );
  return route?.groupId ?? null;
}

// ADMIN-RE-05: the reimagined home. Its big jobs and its More list are built
// from this manifest (decision 0005), so a club sees only the sections its
// website has, and owner-only or billing rows follow the same route checks as
// the classic sidebar. Labels are the glossary's words. Until each job's own
// page ships, the tiles and rows open the existing pages.

export type AdminHomeJobId =
  | "enter-score"
  | "add-game"
  | "see-registrations"
  | "edit-website";

/** Which count the home puts under a tile ("12 games need a score", "3 new"). */
export type AdminHomeHintKey = "games-needing-score" | "new-sign-ups";

/** Each job keeps its own color, so owners find it by color and shape. */
export type AdminHomeJobHue = "amber" | "blue" | "green" | "coral";

type AdminHomeJobDefinition = Readonly<{
  id: AdminHomeJobId;
  label: string;
  routeId: AdminRouteId;
  hue: AdminHomeJobHue;
  hint?: AdminHomeHintKey;
  /** Hidden while content changes are paused, like the classic quick actions. */
  needsContentMutation?: true;
  /** A big job only while the club has a live sign-up form. */
  needsLiveSignUps?: true;
}>;

export type AdminHomeJob = Readonly<{
  id: AdminHomeJobId;
  label: string;
  href: `/admin${string}`;
  hue: AdminHomeJobHue;
  hint?: AdminHomeHintKey;
}>;

export const ADMIN_HOME_JOBS = [
  {
    id: "enter-score",
    label: "Enter a score",
    routeId: "schedule",
    hue: "amber",
    hint: "games-needing-score",
    needsContentMutation: true,
  },
  {
    id: "add-game",
    label: "Add a game",
    routeId: "add-game",
    hue: "blue",
    needsContentMutation: true,
  },
  {
    id: "see-registrations",
    label: "See registrations",
    routeId: "registrations",
    hue: "green",
    hint: "new-sign-ups",
    needsLiveSignUps: true,
  },
  {
    id: "edit-website",
    label: "Edit my website",
    routeId: "homepage",
    hue: "coral",
    needsContentMutation: true,
  },
] as const satisfies readonly AdminHomeJobDefinition[];

export type AdminMoreRowId =
  | "team-roster"
  | "this-season"
  | "games"
  | "player-numbers"
  | "league-table"
  | "programs"
  | "tryouts"
  | "homepage"
  | "about-page"
  | "contact-page"
  | "sponsors"
  | "shop"
  | "your-club"
  | "how-the-team-is-doing"
  | "payments-and-plan"
  | "who-can-sign-in"
  | "sign-up-forms";

type AdminMoreRowDefinition = Readonly<{
  id: AdminMoreRowId;
  label: string;
  routeId: AdminRouteId;
  /** The quiet stand-in for "See registrations" when that is not a big job. */
  onlyWithoutLiveSignUps?: true;
  /**
   * The way to a page whose big jobs hide while content changes are paused,
   * so the owner can still open it and look.
   */
  onlyWhileContentPaused?: true;
}>;

export type AdminMoreRow = Readonly<{
  id: AdminMoreRowId;
  label: string;
  href: `/admin${string}`;
  iconKey: AdminRouteIconKey;
}>;

// Programs and Tryouts stay two rows while they are two pages; a club whose
// website has only one of them sees only that row (decision 0005). Every old
// page stays reachable from the home: About, Contact and Player numbers until
// Edit my website and Enter a score cover them (RE-13, RE-06), and Games and
// Homepage while content changes are paused hide the jobs that open them.
export const ADMIN_MORE_ROWS = [
  { id: "team-roster", label: "Team roster", routeId: "roster" },
  { id: "this-season", label: "This season", routeId: "seasons" },
  { id: "games", label: "Games", routeId: "schedule", onlyWhileContentPaused: true },
  { id: "player-numbers", label: "Player numbers", routeId: "match-stats" },
  { id: "league-table", label: "League table", routeId: "standings" },
  { id: "programs", label: "Programs", routeId: "programs" },
  { id: "tryouts", label: "Tryouts", routeId: "tryouts" },
  { id: "homepage", label: "Homepage", routeId: "homepage", onlyWhileContentPaused: true },
  { id: "about-page", label: "About page", routeId: "about" },
  { id: "contact-page", label: "Contact page", routeId: "contact" },
  { id: "sponsors", label: "Sponsors", routeId: "sponsors" },
  { id: "shop", label: "Shop", routeId: "shop" },
  { id: "your-club", label: "Your club", routeId: "branding" },
  { id: "how-the-team-is-doing", label: "How the team is doing", routeId: "analytics" },
  { id: "payments-and-plan", label: "Payments and plan", routeId: "payments" },
  { id: "who-can-sign-in", label: "Who can sign in", routeId: "team-access" },
  {
    id: "sign-up-forms",
    label: "Sign-up forms",
    routeId: "registrations",
    onlyWithoutLiveSignUps: true,
  },
] as const satisfies readonly AdminMoreRowDefinition[];

function isReimagined(context: AdminRouteAccessContext): boolean {
  return context.adminPortal === "reimagined";
}

function visibleRouteMap(context: AdminRouteAccessContext) {
  return new Map(
    ADMIN_ROUTE_MANIFEST.filter((route) => isAdminRouteVisible(route, context)).map(
      (route) => [route.id, route as AdminRouteDefinition],
    ),
  );
}

export function getVisibleAdminHomeJobs(
  context: AdminRouteAccessContext,
): readonly AdminHomeJob[] {
  if (!isReimagined(context)) return [];
  const routes = visibleRouteMap(context);
  return ADMIN_HOME_JOBS.flatMap((job: AdminHomeJobDefinition) => {
    const route = routes.get(job.routeId);
    if (!route) return [];
    if (job.needsContentMutation && !context.canMutateContent) return [];
    if (job.needsLiveSignUps && !context.hasLiveSignUps) return [];
    return [
      {
        id: job.id,
        label: job.label,
        href: route.href,
        hue: job.hue,
        ...(job.hint ? { hint: job.hint } : {}),
      },
    ];
  });
}

export function getVisibleAdminMoreRows(
  context: AdminRouteAccessContext,
): readonly AdminMoreRow[] {
  if (!isReimagined(context)) return [];
  const routes = visibleRouteMap(context);
  return ADMIN_MORE_ROWS.flatMap((row: AdminMoreRowDefinition) => {
    const route = routes.get(row.routeId);
    if (!route) return [];
    if (row.onlyWithoutLiveSignUps && context.hasLiveSignUps) return [];
    if (row.onlyWhileContentPaused && context.canMutateContent) return [];
    return [{ id: row.id, label: row.label, href: route.href, iconKey: route.iconKey }];
  });
}

/**
 * The reimagined top bar's title for a page: the glossary name from More when
 * the page is one of its rows ("Team roster" for /admin/roster), otherwise the
 * page's own name, otherwise "Club admin". A title only names the page; each
 * page still checks who may open it, so this needs no access context.
 */
export function getReimaginedPageTitle(pathname: string): string {
  const route = ADMIN_ROUTE_MANIFEST.find(
    (candidate) => candidate.href !== "/admin" && pathnameMatchesRoute(pathname, candidate.href),
  );
  if (!route) return "Club admin";
  const row = ADMIN_MORE_ROWS.find((candidate) => candidate.routeId === route.id);
  return row?.label ?? route.label;
}
