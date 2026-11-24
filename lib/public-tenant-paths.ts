import { CINEMATIC_PLACEHOLDER_ROUTES } from "@/lib/cinematic-routes";

const PUBLIC_TENANT_PATHS = new Set([
  "/",
  "/roster",
  "/schedule",
  "/shop",
  "/sponsors",
  "/staff",
  "/stats",
  "/club/about",
  "/club/logo",
  "/club-logo",
  "/programs",
  "/contact",
  "/tryouts",
]);

const PROGRAM_SLUG_PATTERN = "[a-z][a-z0-9-]*";
const PROGRAM_DETAIL_PATH = new RegExp(`^/programs/${PROGRAM_SLUG_PATTERN}$`);
// RC2027-NEWS article addresses; the page checks the template and the article.
const NEWS_ARTICLE_PATH = /^\/news\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REGISTRATION_PATH =
  /^\/register\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/confirmation)?$/;

export function isPublicTenantPath(pathname: string): boolean {
  if (PUBLIC_TENANT_PATHS.has(pathname)) return true;
  // The destination handler checks the trusted template and returns 404 for
  // every other template; the rewrite still resolves the verified tenant.
  if (Object.hasOwn(CINEMATIC_PLACEHOLDER_ROUTES, pathname)) return true;
  return (
    /^\/roster\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname) ||
    /^\/schedule\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname) ||
    // TELEMETRY-02: sponsor click redirect; the handler resolves the sponsor within the verified club.
    /^\/r\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname) ||
    NEWS_ARTICLE_PATH.test(pathname) ||
    PROGRAM_DETAIL_PATH.test(pathname) ||
    REGISTRATION_PATH.test(pathname)
  );
}
