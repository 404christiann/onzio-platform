/**
 * Known internal destinations for admin-editable navigation links (e.g. the
 * homepage hero's Primary/Secondary Link fields).
 *
 * The DB constraint on these columns only checks shape
 * (`^/[-A-Za-z0-9_/?#=&%.]*$`) — it cannot tell a real route from a typo, so
 * an admin could previously save a path to a page that doesn't exist and
 * only find out when a visitor hits a 404. Presenting these as a picker
 * instead of free text removes that failure mode: every option here is a
 * route this app actually serves.
 *
 * Excludes: dynamic detail pages reached by clicking into a list rather than
 * navigated to directly (`/roster/[playerId]`, `/schedule/[fixtureId]`), and
 * `/club/logo` (a media utility endpoint, not a content page).
 */
export type SiteRouteOption = {
  href: string;
  label: string;
};

export const STATIC_SITE_ROUTES: readonly SiteRouteOption[] = [
  { href: "/", label: "Home" },
  { href: "/club/about", label: "About" },
  { href: "/roster", label: "Roster" },
  { href: "/schedule", label: "Schedule" },
  { href: "/programs", label: "Programs" },
  { href: "/shop", label: "Shop" },
  { href: "/sponsors", label: "Sponsors" },
  { href: "/contact", label: "Contact" },
  { href: "/tryouts", label: "Tryouts" },
];

export function programRouteOptions(
  programs: ReadonlyArray<{ slug: string; navLabel: string; displayTitle: string }>,
): SiteRouteOption[] {
  return programs.map((program) => ({
    href: `/programs/${program.slug}`,
    label: `Programs — ${program.navLabel || program.displayTitle}`,
  }));
}

/**
 * The full picker list, always containing an option matching `current` so a
 * <select> bound to this list is never silently mismatched:
 *
 * - An empty `current` (a legitimate stored state — the public site falls
 *   back to a template default when this column is blank) gets a leading
 *   "Use template default" option with value `""`.
 * - A non-empty `current` that isn't one of the known routes (an unusual but
 *   already-saved link) is appended labeled as the current value, rather
 *   than silently dropped from the picker.
 */
export function siteRouteOptionsWithFallback(
  programs: ReadonlyArray<{ slug: string; navLabel: string; displayTitle: string }>,
  current: string,
): SiteRouteOption[] {
  const options = [...STATIC_SITE_ROUTES, ...programRouteOptions(programs)];
  const trimmed = current.trim();
  if (!trimmed) {
    return [{ href: "", label: "Use template default" }, ...options];
  }
  if (!options.some((option) => option.href === trimmed)) {
    options.push({ href: trimmed, label: `Current value (${trimmed})` });
  }
  return options;
}
