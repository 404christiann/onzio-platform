export const CLUB_LOGO_BUCKET = "logos_v2";
export const DEFAULT_CLUB_LOGO_PATH = "Rose City FC Patch Color.png";

/** Mirrors the CHECK on onzio.site_branding.footer_tagline. */
export const FOOTER_TAGLINE_LIMIT = 160;

/**
 * Approved academy@1 footer tagline, previously hardcoded in
 * `components/Footer.tsx`. Kept here as a template default so an untouched
 * column renders the approved wording instead of a blank line, exactly like
 * `DEFAULT_PROGRAM_REGISTRATION_CONTENT`.
 *
 * The newline is meaningful: the footer renders the tagline with preserved
 * line breaks, which is how the two-line lockup reproduces.
 */
export const DEFAULT_ACADEMY_FOOTER_TAGLINE =
  "One Club. One Community.\nEndless Opportunities.";

/** Resolves a stored tagline against the academy@1 template default. */
export function resolveFooterTagline(stored: string | null | undefined): string {
  const value = typeof stored === "string" ? stored.trim() : "";
  return value || DEFAULT_ACADEMY_FOOTER_TAGLINE;
}

/** Returns a message when a tagline cannot be saved, or null when it can. */
export function validateFooterTagline(value: string): string | null {
  return value.length > FOOTER_TAGLINE_LIMIT
    ? `The tagline must be ${FOOTER_TAGLINE_LIMIT} characters or fewer.`
    : null;
}

export function clubLogoUrl(
  path: string = DEFAULT_CLUB_LOGO_PATH,
): string {
  if (!path) return "";
  if (path.startsWith("/")) return path;
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const bucket = /^[0-9a-f-]{36}\//i.test(path)
    ? "onzio-media"
    : CLUB_LOGO_BUCKET;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodedPath}`;
}
