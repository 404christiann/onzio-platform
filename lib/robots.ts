import { isPublicSiteIndexable } from "@/lib/club-access";
import { isPublicTenantPath } from "@/lib/public-tenant-paths";

/**
 * The single decider of search-engine indexing. Nothing else in `middleware.ts`,
 * `app/**` or `lib/**` may set `X-Robots-Tag`, a `robots` metadata field or a
 * `<meta name="robots">` (tests/contracts/robots-single-decider.test.ts).
 *
 * A response is indexable only when ALL of these hold:
 *   - `VERCEL_ENV` is exactly "production" (unset, preview and development block);
 *   - the club's access is `live` (`grace` stays blocked: DCFC-D117 open decision);
 *   - the request is on the club's canonical hostname (its primary, verified,
 *     active domain), never `*.vercel.app`, localhost or a secondary domain;
 *   - the path is a public page (not admin, api, internal, auth or transactional).
 * Everything else, including every 404 and unknown tenant, is `noindex, nofollow`.
 */
export const ROBOTS_NOINDEX = "noindex, nofollow";
export const ROBOTS_INDEX = "index, follow";

/** Request header middleware sets ("1" | "0") for app/robots.ts and app/sitemap.ts. */
export const SITE_INDEXABLE_HEADER = "x-onzio-site-indexable";

export type RobotsInput = {
  /** `process.env.VERCEL_ENV`. */
  vercelEnv: string | undefined;
  /** Request hostname, any case, port tolerated. */
  host: string | null | undefined;
  path: string;
  /** The club's runtime access; anything not a known state is blocked. */
  publicAccess: unknown;
  /** Whether `host` is the club's primary verified domain. */
  isPrimaryDomain: boolean;
};

export type RobotsHostKind = "canonical" | "secondary" | "vercel" | "local" | "unknown";

const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\]|[^.]+\.localhost)$/;

export function robotsHostKind(
  host: string | null | undefined,
  isPrimaryDomain: boolean,
): RobotsHostKind {
  if (!host) return "unknown";
  const name = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (!name) return "unknown";
  if (LOCAL_HOST.test(name)) return "local";
  if (name === "vercel.app" || name.endsWith(".vercel.app")) return "vercel";
  return isPrimaryDomain ? "canonical" : "secondary";
}

// Public URLs that are pages in the tenant router but must stay out of search:
// the sponsor click redirect, registration forms, the logo asset, and individual
// player profiles (members of youth clubs).
const NON_INDEXABLE_PUBLIC_PATH =
  /^\/(?:r\/|register\/|club-logo$|club\/logo$|roster\/[0-9a-f-]{36}$)/i;

export function isIndexablePath(path: string): boolean {
  return isPublicTenantPath(path) && !NON_INDEXABLE_PUBLIC_PATH.test(path);
}

export function robotsDirective(input: RobotsInput): string {
  const indexable =
    input.vercelEnv === "production" &&
    isPublicSiteIndexable(input.publicAccess) &&
    robotsHostKind(input.host, input.isPrimaryDomain) === "canonical" &&
    isIndexablePath(input.path);
  return indexable ? ROBOTS_INDEX : ROBOTS_NOINDEX;
}

/** Whether the club's site, as served on this host, is open to indexing at all. */
export function siteIndexable(input: Omit<RobotsInput, "path">): boolean {
  return robotsDirective({ ...input, path: "/" }) === ROBOTS_INDEX;
}

/** The only writer of `X-Robots-Tag`. */
export function applyRobotsHeader<T extends { headers: Headers }>(
  response: T,
  input: RobotsInput,
): T {
  response.headers.set("X-Robots-Tag", robotsDirective(input));
  return response;
}
