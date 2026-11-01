export type AcademyLoadingRoute = "home" | "program-detail" | "programs" | "navy" | "shop" | "about" | "roster" | "schedule" | "logo" | "registration" | "simple";

type HeroHeader = "scroll" | "always" | "scroll-desktop";

type RouteSpec = {
  /** Next.js adapter pattern. A bracketed segment is exactly one non-empty path segment. */
  pattern: string;
  loading: AcademyLoadingRoute;
  /** Present when the page opens on a full-bleed hero that the header floats over. */
  heroHeader?: HeroHeader;
};

/**
 * Every public page the tenant adapters under app/%5Fclubs/[slug] implement.
 * tests/architecture/academy-site-routes.test.ts keeps this table and those
 * adapters identical, so a destination can only be added here after its page exists.
 */
export const academyRoutes = {
  home: { pattern: "/", loading: "home", heroHeader: "scroll" },
  about: { pattern: "/club/about", loading: "about" },
  logo: { pattern: "/club/logo", loading: "logo", heroHeader: "always" },
  contact: { pattern: "/contact", loading: "navy" },
  programs: { pattern: "/programs", loading: "programs" },
  programDetail: { pattern: "/programs/[programSlug]", loading: "program-detail", heroHeader: "scroll" },
  register: { pattern: "/register/[formSlug]", loading: "registration" },
  registerConfirmation: { pattern: "/register/[formSlug]/confirmation", loading: "registration" },
  roster: { pattern: "/roster", loading: "roster" },
  rosterPlayer: { pattern: "/roster/[playerId]", loading: "simple" },
  schedule: { pattern: "/schedule", loading: "schedule" },
  scheduleFixture: { pattern: "/schedule/[fixtureId]", loading: "simple" },
  shop: { pattern: "/shop", loading: "shop", heroHeader: "scroll-desktop" },
  sponsors: { pattern: "/sponsors", loading: "navy" },
  staff: { pattern: "/staff", loading: "simple" },
  stats: { pattern: "/stats", loading: "simple" },
  tryouts: { pattern: "/tryouts", loading: "navy" },
} as const satisfies Record<string, RouteSpec>;

export type AcademyRouteId = keyof typeof academyRoutes;

type ParamNames<Pattern extends string> =
  Pattern extends `${string}[${infer Name}]${infer Rest}` ? Name | ParamNames<Rest> : never;
type RouteArgs<Id extends AcademyRouteId> =
  [ParamNames<(typeof academyRoutes)[Id]["pattern"]>] extends [never]
    ? []
    : [Record<ParamNames<(typeof academyRoutes)[Id]["pattern"]>, string>];

declare const implementedRoute: unique symbol;
/** A destination built from the route table. A hand-written path does not satisfy it. */
export type AcademyHref = string & { readonly [implementedRoute]: true };

export function academyHref<Id extends AcademyRouteId>(id: Id, ...args: RouteArgs<Id>): AcademyHref {
  const params: Record<string, string> = args[0] ?? {};
  return academyRoutes[id].pattern.replace(/\[([^\]]+)\]/g, (_, name: string) => params[name]) as AcademyHref;
}

const matchers = (Object.keys(academyRoutes) as AcademyRouteId[]).map((id) => ({
  id,
  expression: new RegExp(
    `^${academyRoutes[id].pattern
      .split("/")
      .map((segment) => (segment.startsWith("[") ? "[^/]+" : segment.replace(/[.*+?^${}()|\\]/g, "\\$&")))
      .join("/")}$`,
  ),
}));

/** The public path without its internal tenant prefix or trailing slashes. */
export function academyPathname(pathname: string): string {
  return pathname.replace(/^\/(?:_clubs|%5fclubs)\/[^/]+/i, "").replace(/\/+$/, "") || "/";
}

export function matchAcademyRoute(pathname: string): AcademyRouteId | null {
  const path = academyPathname(pathname);
  return matchers.find(({ expression }) => expression.test(path))?.id ?? null;
}

/** Pick a loading label from the public route without using club-specific data. */
export function academyLoadingRoute(pathname: string): AcademyLoadingRoute {
  const id = matchAcademyRoute(pathname);
  return id === null ? "simple" : academyRoutes[id].loading;
}

/** How the header behaves over this route's opening hero, or undefined for a solid header. */
export function academyHeroHeader(pathname: string): HeroHeader | undefined {
  const id = matchAcademyRoute(pathname);
  if (id === null) return undefined;
  const route: RouteSpec = academyRoutes[id];
  return route.heroHeader;
}
