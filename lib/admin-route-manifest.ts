import type { AdminFlags } from "@/lib/admin-portal";
import { codeSiteAdminFor } from "@/lib/code-site-admin";

export type AdminRole = "owner" | "admin";

export type AdminRouteAccessContext = Readonly<{
  role: AdminRole | null;
  presentationTemplateKey: string | null;
  /**
   * The club's slug, for the per-club hides in ADMIN_ROUTES_HIDDEN_BY_CLUB. Left
   * out (or null) means no club-specific hide applies.
   */
  clubSlug?: string | null;
  isBillingAuthorized: boolean;
  canMutateContent: boolean;
  /**
   * Operator-only clubs.store_enabled. The public Shop is hidden when off, but
   * the admin keeps Shop so owners can prepare kits under the Shop-off banner.
   */
  storeEnabled: boolean;
  /** Per-club switches (onzio.clubs.admin_flags), read fail-safe by lib/admin-portal.ts. */
  adminFlags?: AdminFlags;
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
  | "news"
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
  | "stadium"
  | "foothill-transit"
  | "chick-fil-a"
  | "tickets"
  | "season-membership"
  | "know-before-you-go"
  | "policies"
  | "partners"
  | "injury-report"
  | "website-pages"
  | "insights";

export type AdminRouteIconKey =
  | "dashboard"
  | "homepage"
  | "programs"
  | "tryouts"
  | "shop"
  | "about"
  | "sponsors"
  | "contact"
  | "news"
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
  | "payments"
  | "stadium"
  | "foothill-transit"
  | "chick-fil-a"
  | "tickets"
  | "season-membership"
  | "know-before-you-go"
  | "policies"
  | "partners"
  | "injury-report"
  | "website-pages"
  | "insights";

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
   * A page whose editor exists only on the Rose City site design (News and the
   * nine other site editors). Every other design never sees the row.
   */
  cinematicOnly?: true;
  /**
   * The page's own heading when it differs from the sidebar and search label.
   * Only the top-bar breadcrumb reads it, so the last crumb matches the page's h1.
   */
  pageTitle?: string;
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

export type AdminNavigationHeadingId = "pages" | "tickets-and-stadium" | "partners";

/**
 * A heading on the Website hub page ("All website pages"). The hub groups every
 * Website row a club can see under these headings. They never render in the sidebar.
 */
export type AdminNavigationHeadingDefinition = Readonly<{
  id: AdminNavigationHeadingId;
  label: string;
  routeIds: readonly AdminRouteId[];
}>;

export type AdminNavigationDefinition =
  | Readonly<{ type: "link"; routeId: AdminRouteId }>
  | Readonly<{
      type: "group";
      id: AdminRouteGroupId;
      label: string;
      iconKey: AdminGroupIconKey;
      routeIds: readonly AdminRouteId[];
      /**
       * The Hub. For a club that sees at least one `cinematicOnly` row in this
       * group, the sidebar lists only these rows and the rest sit behind the hub
       * page. Every other club sees `routeIds` unchanged. No template check: the
       * existing cinematicOnly flag decides.
       */
      hub?: Readonly<{
        sidebarRouteIds: readonly AdminRouteId[];
        hubRouteId: AdminRouteId;
        headings: readonly AdminNavigationHeadingDefinition[];
      }>;
    }>;

export type AdminVisibleNavigationSection = Readonly<{
  id: AdminNavigationHeadingId;
  label: string;
  routes: readonly AdminVisibleRoute[];
}>;

export type AdminVisibleNavigationEntry =
  | Readonly<{ type: "link"; route: AdminVisibleRoute }>
  | Readonly<{
      type: "group";
      id: AdminRouteGroupId;
      label: string;
      iconKey: AdminGroupIconKey;
      routes: readonly AdminVisibleRoute[];
      /** Present only for the Hub: Website rows the club can see that the sidebar leaves to the hub page. */
      overflowRoutes?: readonly AdminVisibleRoute[];
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
    id: "news",
    label: "News",
    href: "/admin/news",
    iconKey: "news",
    groupId: "website",
    cinematicOnly: true,
  },
  {
    id: "stadium",
    label: "Stadium",
    href: "/admin/stadium",
    iconKey: "stadium",
    groupId: "website",
    cinematicOnly: true,
    pageTitle: "Robinson Stadium",
  },
  {
    id: "foothill-transit",
    label: "Foothill Transit",
    href: "/admin/foothill-transit",
    iconKey: "foothill-transit",
    groupId: "website",
    cinematicOnly: true,
  },
  {
    id: "chick-fil-a",
    label: "Chick-fil-A",
    href: "/admin/chick-fil-a",
    iconKey: "chick-fil-a",
    groupId: "website",
    cinematicOnly: true,
  },
  {
    id: "tickets",
    label: "Tickets",
    href: "/admin/tickets",
    iconKey: "tickets",
    groupId: "website",
    cinematicOnly: true,
  },
  {
    id: "season-membership",
    label: "Season Membership",
    href: "/admin/season-membership",
    iconKey: "season-membership",
    groupId: "website",
    cinematicOnly: true,
    pageTitle: "Season Ticket Membership",
  },
  {
    id: "know-before-you-go",
    label: "Know Before You Go",
    href: "/admin/know-before-you-go",
    iconKey: "know-before-you-go",
    groupId: "website",
    cinematicOnly: true,
  },
  {
    id: "policies",
    label: "Policies",
    href: "/admin/policies",
    iconKey: "policies",
    groupId: "website",
    cinematicOnly: true,
    pageTitle: "Stadium Guidelines & Fan Code",
  },
  {
    id: "partners",
    label: "Partners",
    href: "/admin/partners",
    iconKey: "partners",
    groupId: "website",
    cinematicOnly: true,
  },
  {
    id: "injury-report",
    label: "Injury Report",
    href: "/admin/injury-report",
    iconKey: "injury-report",
    groupId: "website",
    cinematicOnly: true,
  },
  {
    // The Hub: the sidebar shows only the four everyday pages and this row; the page lists every Website editor.
    id: "website-pages",
    label: "All website pages",
    href: "/admin/website-pages",
    iconKey: "website-pages",
    groupId: "website",
    cinematicOnly: true,
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
  // TELEMETRY-06: the Sponsor Insights add-on in the sidebar.
  {
    id: "insights",
    label: "Insights",
    href: "/admin/insights",
    iconKey: "insights",
    groupId: null,
    pageTitle: "Sponsor Insights",
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
      "news",
      "stadium",
      "foothill-transit",
      "chick-fil-a",
      "tickets",
      "season-membership",
      "know-before-you-go",
      "policies",
      "partners",
      "injury-report",
      "website-pages",
    ],
    hub: {
      sidebarRouteIds: ["homepage", "shop", "about", "news", "website-pages"],
      hubRouteId: "website-pages",
      headings: [
        {
          id: "pages",
          label: "Pages",
          routeIds: ["homepage", "programs", "tryouts", "shop", "about", "contact", "news"],
        },
        {
          id: "tickets-and-stadium",
          label: "Tickets and stadium",
          routeIds: [
            "tickets",
            "season-membership",
            "know-before-you-go",
            "stadium",
            "foothill-transit",
            "chick-fil-a",
            "policies",
          ],
        },
        {
          id: "partners",
          label: "Partners",
          routeIds: ["sponsors", "partners", "injury-report"],
        },
      ],
    },
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
  { type: "link", routeId: "insights" },
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
  news: ["website", "news", "articles", "announcements"],
  "stadium": ["website", "stadium", "venue", "robinson stadium", "directions", "parking"],
  "foothill-transit": ["website", "foothill transit", "transit", "bus", "getting there"],
  "chick-fil-a": ["website", "chick-fil-a", "food", "partner offer"],
  "tickets": ["website", "tickets", "prices", "gameday"],
  "season-membership": ["website", "season membership", "season tickets", "membership"],
  "know-before-you-go": ["website", "know before you go", "visiting", "gameday guide", "bag policy"],
  "policies": ["website", "policies", "rules", "code of conduct", "terms"],
  "partners": ["website", "partners", "sponsors", "logos"],
  "injury-report": ["website", "injury report", "injuries", "availability"],
  "website-pages": ["website", "all pages", "hub", "every page", "website pages"],
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
  insights: ["sponsor insights", "sponsors", "visits", "visitors", "page views", "traffic", "monthly report"],
} as const satisfies Record<AdminRouteId, readonly string[]>;

/**
 * Rows a specific club never sees, keyed on the club's slug (not on its site
 * design, so a future cinematic@2 club is unaffected). Rose City outsources
 * tryouts, so its admin has no Registrations, and its public site never shows
 * standings, so it has no Standings either: no sidebar row, hub row, search
 * result or quick action, and /admin/registrations and
 * /admin/standings answer 404. The code, data, API routes and public pages stay
 * for the clubs that use them (Diverse City).
 */
export const ADMIN_ROUTES_HIDDEN_BY_CLUB: Readonly<Record<string, readonly AdminRouteId[]>> = {
  "rose-city": ["registrations", "standings"],
};

/** Whether this club's admin hides a row (see ADMIN_ROUTES_HIDDEN_BY_CLUB). */
export function isAdminRouteHiddenForClub(clubSlug: string | null | undefined, routeId: AdminRouteId): boolean {
  if (!clubSlug) return false;
  return Object.hasOwn(ADMIN_ROUTES_HIDDEN_BY_CLUB, clubSlug) && ADMIN_ROUTES_HIDDEN_BY_CLUB[clubSlug].includes(routeId);
}

const ROUTE_BY_ID = new Map<AdminRouteId, AdminRouteDefinition>(
  ADMIN_ROUTE_MANIFEST.map((route) => [route.id, route]),
);

function isProtectedAdminRole(
  role: AdminRouteAccessContext["role"],
): role is AdminRole {
  return role === "owner" || role === "admin";
}

/** The admin_flags key that turns on the Sponsor Insights add-on. */
export const SPONSOR_INSIGHTS_FLAG = "sponsor_insights";

/**
 * TELEMETRY-06: the one gate for Sponsor Insights (/admin/insights and its
 * monthly report), an owner or admin of a club whose
 * admin_flags.sponsor_insights is true. The sidebar and the page loader
 * ask this.
 */
export function canSeeSponsorInsights(
  context: Pick<AdminRouteAccessContext, "role" | "adminFlags">,
): boolean {
  return isProtectedAdminRole(context.role) && context.adminFlags?.[SPONSOR_INSIGHTS_FLAG] === true;
}

export function isAdminRouteVisible(
  route: AdminRouteDefinition,
  context: AdminRouteAccessContext,
): boolean {
  if (!isProtectedAdminRole(context.role)) return false;
  if (route.id === "insights" && !canSeeSponsorInsights(context)) return false;
  if (isAdminRouteHiddenForClub(context.clubSlug, route.id)) return false;
  const siteAdmin = codeSiteAdminFor(context);
  if (route.id === "programs" && !siteAdmin?.programs.routeVisible) return false;
  if (route.id === "tryouts" && !siteAdmin?.tryouts.routeVisible) return false;
  // Only designs that publish a Contact page get the Contact editor (cinematic@2
  // has its own Contact editor); its details are used nowhere else on other designs.
  if (route.id === "contact" && !siteAdmin?.contact.routeVisible && context.presentationTemplateKey !== "cinematic@2") return false;
  // News (RC2027-NEWS) and the other Rose City editors exist on cinematic@2 only.
  if (route.cinematicOnly && context.presentationTemplateKey !== "cinematic@2") return false;
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

function websiteHub() {
  for (const entry of ADMIN_NAVIGATION_MANIFEST) {
    if (entry.type === "group" && "hub" in entry && entry.hub) return entry.hub;
  }
  return null;
}

function clubSeesHub(routes: readonly AdminVisibleRoute[]): boolean {
  // The existing cinematicOnly flag decides: no new template check.
  return routes.some((route) => ROUTE_BY_ID.get(route.id)?.cinematicOnly);
}

/**
 * The Website hub page's groups: every Website row the club can see under Pages,
 * Tickets and stadium and Partners. A row no heading names goes under Pages. Empty
 * for a club without the Hub.
 */
export function getWebsiteHubSections(
  context: AdminRouteAccessContext,
): readonly AdminVisibleNavigationSection[] {
  const hub = websiteHub();
  if (!hub) return [];
  const routes = getVisibleAdminRoutes(context).filter((route) => route.groupId === "website");
  if (!clubSeesHub(routes)) return [];

  const placed = new Set<AdminRouteId>([hub.hubRouteId]);
  const sections = hub.headings.map((heading) => ({
    id: heading.id,
    label: heading.label,
    routes: heading.routeIds.flatMap((routeId) => {
      const route = routes.find((candidate) => candidate.id === routeId);
      if (!route) return [];
      placed.add(routeId);
      return [route];
    }),
  }));
  const orphans = routes.filter((route) => !placed.has(route.id));
  if (orphans.length) sections[0] = { ...sections[0], routes: [...sections[0].routes, ...orphans] };
  return sections.filter((section) => section.routes.length > 0);
}

/**
 * The top-bar breadcrumb for a Website page on the Hub: Website, its group, the page.
 * Null where the shell keeps showing just the page name (every other club and page).
 */
export function getAdminBreadcrumb(
  pathname: string,
  context: AdminRouteAccessContext,
): readonly string[] | null {
  const hub = websiteHub();
  if (!hub) return null;
  const route = getVisibleAdminRoutes(context).find(
    (candidate) => candidate.groupId === "website" && pathnameMatchesRoute(pathname, candidate.href),
  );
  if (!route) return null;
  const sections = getWebsiteHubSections(context);
  if (sections.length === 0) return null;
  if (route.id === hub.hubRouteId) return ["Website", route.label];
  const section = sections.find((candidate) => candidate.routes.some((row) => row.id === route.id));
  if (!section) return null;
  const page = ROUTE_BY_ID.get(route.id)?.pageTitle ?? route.label;
  // A page that shares its group heading's name (Partners under Partners) is one crumb, not two.
  return page === section.label ? ["Website", section.label] : ["Website", section.label, page];
}

/** Whether this club can open the Website hub page. Same visibility check as every other route. */
export function isWebsiteHubVisible(context: AdminRouteAccessContext): boolean {
  const hub = websiteHub();
  return Boolean(hub && getVisibleAdminRoutes(context).some((route) => route.id === hub.hubRouteId));
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
    const hub = "hub" in entry ? entry.hub : undefined;
    if (hub && clubSeesHub(routes)) {
      const sidebar = new Set<AdminRouteId>(hub.sidebarRouteIds);
      navigation.push({
        type: "group",
        id: entry.id,
        label: entry.label,
        iconKey: entry.iconKey,
        routes: hub.sidebarRouteIds.flatMap((routeId) => {
          const route = routes.find((candidate) => candidate.id === routeId);
          return route ? [route] : [];
        }),
        overflowRoutes: routes.filter((route) => !sidebar.has(route.id)),
      });
      continue;
    }
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
