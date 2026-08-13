import { supabase } from "@/lib/supabase";
import type { DBClubIdentity } from "@/lib/db-types";

/**
 * Camel-cased club identity content for the editorial@1 presentation
 * package, sourced from onzio.club_identity (Lions E1). Deliberately
 * excludes hero copy and contact email/phone -- those already live in
 * homepage_hero_content and contact_profile respectively (see
 * lib/queries.ts's fetchHomepageHeroContent / fetchContactProfile), so
 * EditorialShell/EditorialHero/EditorialFooter fetch those separately
 * instead of expecting them here.
 */
export type ClubIdentityContent = {
  clubId: string;
  shortName: string;
  initials: string;
  foundedYear: number;
  league: string;
  division: string;
  city: string;
  state: string;
  venue: string;
  timeZone: string;
  contactAddress: string;
  slideshowHeadingTop: string;
  slideshowHeadingEm: string;
  identityHeadingTop: string;
  identityHeadingEm: string;
  storyHeadingTop: string;
  storyHeadingEm: string;
  mission: string;
  highlights: unknown;
};

function mapClubIdentity(row: DBClubIdentity): ClubIdentityContent {
  return {
    clubId: row.club_id,
    shortName: row.short_name,
    initials: row.initials,
    foundedYear: row.founded_year,
    league: row.league,
    division: row.division,
    city: row.city,
    state: row.state,
    venue: row.venue,
    timeZone: row.time_zone,
    contactAddress: row.contact_address,
    slideshowHeadingTop: row.slideshow_heading_top,
    slideshowHeadingEm: row.slideshow_heading_em,
    identityHeadingTop: row.identity_heading_top,
    identityHeadingEm: row.identity_heading_em,
    storyHeadingTop: row.story_heading_top,
    storyHeadingEm: row.story_heading_em,
    mission: row.mission,
    highlights: row.highlights,
  };
}

/**
 * Fetches the single club_identity row for a tenant. Returns null (not a
 * throw) both when no row exists yet and when the query errors, so an
 * editorial club with content still being onboarded degrades to the
 * fallback copy each section already defines rather than crashing the page.
 */
export async function fetchClubIdentity(
  clubId: string,
  client: typeof supabase = supabase,
): Promise<ClubIdentityContent | null> {
  const { data, error } = await client
    .from("club_identity")
    .select("*")
    .eq("club_id", clubId)
    .maybeSingle();
  if (error) {
    console.error("fetchClubIdentity:", error.message);
    return null;
  }
  return data ? mapClubIdentity(data as DBClubIdentity) : null;
}

export type ClubThemeColors = {
  primary: string;
  secondary: string;
  accent: string;
};

/**
 * Resolves the editorial@1 theme's --club-accent value from
 * onzio.clubs.accent_color (Lions E1). primary/secondary are passed in by
 * the caller (already resolved on ClubContext) rather than re-queried here.
 * A club with no accent_color set yet falls back to its secondary color, so
 * the gradient tokens editorial.css derives from --club-accent stay
 * well-formed instead of resolving to an empty custom property.
 */
export async function fetchClubThemeColors(
  clubId: string,
  fallback: { primary: string; secondary: string },
  client: typeof supabase = supabase,
): Promise<ClubThemeColors> {
  const { data, error } = await client
    .from("clubs")
    .select("accent_color")
    .eq("id", clubId)
    .maybeSingle();
  if (error) {
    console.error("fetchClubThemeColors:", error.message);
  }
  return {
    primary: fallback.primary,
    secondary: fallback.secondary,
    accent: data?.accent_color?.trim() || fallback.secondary,
  };
}
