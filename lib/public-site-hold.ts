/**
 * Clubs whose public site is temporarily held (uncached, noindex 404) while
 * admin editing stays available. Rose City is held until its 2027 relaunch
 * (PR #85, #54). Shared by the middleware and the homepage browser check so the
 * check follows the hold instead of asserting a public page that is off.
 */
export const PUBLIC_SITE_HOLD_SLUGS: ReadonlySet<string> = new Set(["rose-city"]);
