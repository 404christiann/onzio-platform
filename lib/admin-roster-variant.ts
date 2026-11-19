/**
 * Which clubs get the editor-kit Roster editor (RC-ADMIN-4b-roster). Keyed on the
 * club slug, not on the presentation template, so no template selector is added
 * and a future cinematic club keeps the classic editor until it is listed here.
 * Diverse City is not listed: its Roster stays the classic editor, unchanged.
 */
export const KIT_ROSTER_CLUBS: readonly string[] = ["rose-city"];

export function usesKitRoster(clubSlug: string | null | undefined): boolean {
  return Boolean(clubSlug) && KIT_ROSTER_CLUBS.includes(clubSlug as string);
}
