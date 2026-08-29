export type AdminRole = "owner" | "admin";

export type AdminRouteAccessContext = Readonly<{
  role: AdminRole | null;
  presentationTemplateKey: string | null;
  isBillingAuthorized: boolean;
  canMutateContent: boolean;
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
  | "season-stats"
  | "standings"
  | "registrations"
  | "analytics"
  | "branding"
  | "team-access"
  | "payments";

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
  hiddenForTemplates?: readonly string[];
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

const EDITORIAL_TEMPLATE = "editorial@1";

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
    hiddenForTemplates: [EDITORIAL_TEMPLATE],
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
    label: "Match Stats",
    href: "/admin/stats",
    iconKey: "match-stats",
    groupId: "competition",
    hiddenForTemplates: [EDITORIAL_TEMPLATE],
  },
  {
    id: "season-stats",
    label: "Season Stats",
    href: "/admin/season-stats",
    iconKey: "season-stats",
    groupId: "competition",
    hiddenForTemplates: [EDITORIAL_TEMPLATE],
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
    hiddenForTemplates: [EDITORIAL_TEMPLATE],
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
      "season-stats",
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
  "match-stats": ["competition", "match stats", "game statistics"],
  "season-stats": ["competition", "season stats", "player statistics"],
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
  if (route.ownerOnly && context.role !== "owner") return false;
  if (
    route.billingRequired &&
    (context.role !== "owner" || !context.isBillingAuthorized)
  ) {
    return false;
  }
  if (
    context.presentationTemplateKey &&
    route.hiddenForTemplates?.includes(context.presentationTemplateKey)
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
