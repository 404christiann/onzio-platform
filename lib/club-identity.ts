import { supabase } from "@/lib/supabase";
import { clubLogoUrl } from "@/lib/club-branding";
import { resolveMediaStoragePath } from "@/lib/media-assets";

/**
 * Public club identity content for presentation packages.
 *
 * Backed by the singleton `onzio.club_identity` row and readable by anonymous
 * visitors whenever the club is publicly accessible (the same `branding`
 * feature gate that protects `site_branding`).
 */
export type ClubIdentityContent = {
  shortName: string;
  initials: string;
  foundedYear: number;
  league: string;
  division: string;
  city: string;
  state: string;
  venue: string;
  timeZone: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  heroHeadlineTop: string;
  heroHeadlineEm: string;
  heroIntro: string;
  slideshowHeadingTop: string;
  slideshowHeadingEm: string;
  identityHeadingTop: string;
  identityHeadingEm: string;
  storyHeadingTop: string;
  storyHeadingEm: string;
  mission: string;
  highlights: string[];
};

type ClubIdentityRow = {
  club_id: string;
  short_name: string;
  initials: string;
  founded_year: number;
  league: string;
  division: string;
  city: string;
  state: string;
  venue: string;
  time_zone: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  hero_headline_top: string;
  hero_headline_em: string;
  hero_intro: string;
  slideshow_heading_top: string;
  slideshow_heading_em: string;
  identity_heading_top: string;
  identity_heading_em: string;
  story_heading_top: string;
  story_heading_em: string;
  mission: string;
  highlights: unknown;
};

function normalizeHighlights(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Fetches the singleton club identity row, or null when none exists. */
export async function fetchClubIdentity(
  clubId: string,
): Promise<ClubIdentityContent | null> {
  if (!clubId) throw new Error("fetchClubIdentity requires an explicit clubId");
  const { data, error } = await supabase
    .from("club_identity")
    .select("*")
    .eq("club_id", clubId)
    .maybeSingle();
  if (error) {
    console.error("fetchClubIdentity:", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as unknown as ClubIdentityRow;
  return {
    shortName: row.short_name,
    initials: row.initials,
    foundedYear: row.founded_year,
    league: row.league,
    division: row.division,
    city: row.city,
    state: row.state,
    venue: row.venue,
    timeZone: row.time_zone,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactAddress: row.contact_address,
    heroHeadlineTop: row.hero_headline_top,
    heroHeadlineEm: row.hero_headline_em,
    heroIntro: row.hero_intro,
    slideshowHeadingTop: row.slideshow_heading_top,
    slideshowHeadingEm: row.slideshow_heading_em,
    identityHeadingTop: row.identity_heading_top,
    identityHeadingEm: row.identity_heading_em,
    storyHeadingTop: row.story_heading_top,
    storyHeadingEm: row.story_heading_em,
    mission: row.mission,
    highlights: normalizeHighlights(row.highlights),
  };
}

/**
 * Club theme colors injected as `--club-primary` / `--club-secondary` /
 * `--club-accent` custom properties on the editorial template wrapper.
 * The accent falls back to the secondary color, mirroring the mockup's
 * root-layout behavior; neutrals cover clubs without stored colors.
 */
export type ClubThemeColors = {
  primary: string;
  secondary: string;
  accent: string;
};

export const DEFAULT_CLUB_THEME_COLORS: ClubThemeColors = {
  primary: "#141414",
  secondary: "#767676",
  accent: "#F5F5F5",
};

export async function fetchClubThemeColors(
  clubId: string,
): Promise<ClubThemeColors> {
  if (!clubId) {
    throw new Error("fetchClubThemeColors requires an explicit clubId");
  }
  const { data, error } = await supabase
    .from("clubs")
    .select("primary_color, secondary_color, accent_color")
    .eq("id", clubId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchClubThemeColors:", error.message);
    return DEFAULT_CLUB_THEME_COLORS;
  }
  const row = data as {
    primary_color: string | null;
    secondary_color: string | null;
    accent_color: string | null;
  };
  const primary = row.primary_color ?? DEFAULT_CLUB_THEME_COLORS.primary;
  const secondary = row.secondary_color ?? DEFAULT_CLUB_THEME_COLORS.secondary;
  return {
    primary,
    secondary,
    // The mockup root layout derives the accent from the secondary color when
    // no explicit accent exists.
    accent: row.accent_color ?? secondary,
  };
}

/**
 * Full-color and on-dark crest URLs for the editorial template. The on-dark
 * variant falls back to the full-color crest when unset, per the mockup's
 * `Branding.crestOnDark` contract.
 */
export type EditorialCrests = {
  crestUrl: string;
  crestOnDarkUrl: string;
};

export async function fetchEditorialCrests(
  clubId: string,
): Promise<EditorialCrests> {
  if (!clubId) {
    throw new Error("fetchEditorialCrests requires an explicit clubId");
  }
  const { data, error } = await supabase
    .from("site_branding")
    .select(
      "club_id, club_logo_path, club_logo_asset_id, club_logo_dark_path, club_logo_dark_asset_id",
    )
    .eq("club_id", clubId)
    .maybeSingle();
  if (error) {
    console.error("fetchEditorialCrests:", error.message);
    return { crestUrl: "", crestOnDarkUrl: "" };
  }
  const row = data as {
    club_logo_path: string | null;
    club_logo_asset_id: string | null;
    club_logo_dark_path: string | null;
    club_logo_dark_asset_id: string | null;
  } | null;
  const crestPath = await resolveMediaStoragePath(
    clubId,
    row?.club_logo_asset_id,
    row?.club_logo_path?.trim() || "",
  );
  const crestOnDarkPath = await resolveMediaStoragePath(
    clubId,
    row?.club_logo_dark_asset_id,
    row?.club_logo_dark_path?.trim() || "",
  );
  const crestUrl = crestPath ? clubLogoUrl(crestPath) : "";
  const crestOnDarkUrl = crestOnDarkPath ? clubLogoUrl(crestOnDarkPath) : "";
  return {
    crestUrl,
    // Fall back to the full-color crest when no dark variant exists.
    crestOnDarkUrl: crestOnDarkUrl || crestUrl,
  };
}

/**
 * Informational tryout/recruitment page content for the editorial
 * presentation package. No public form or mutation; backed by the singleton
 * `onzio.tryout_page_content` row and readable by anonymous visitors under
 * the same `branding` feature gate as `club_identity`.
 */
export type TryoutSession = {
  ageGroup: string;
  dateRange: string;
  dayTime: string;
  notes: string;
};

export type TryoutPageContent = {
  heroHeadlineTop: string;
  heroHeadlineEm: string;
  heroIntro: string;
  sessions: TryoutSession[];
  whatToBring: string[];
  feeNote: string;
  ctaLabel: string;
};

type TryoutPageContentRow = {
  club_id: string;
  hero_headline_top: string;
  hero_headline_em: string;
  hero_intro: string;
  sessions: unknown;
  what_to_bring: unknown;
  fee_note: string;
  cta_label: string;
};

function normalizeTryoutSessions(value: unknown): TryoutSession[] {
  if (!Array.isArray(value)) return [];
  const sessions: TryoutSession[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const { ageGroup, dateRange, dayTime, notes } = candidate;
    if (
      typeof ageGroup === "string" &&
      typeof dateRange === "string" &&
      typeof dayTime === "string" &&
      typeof notes === "string"
    ) {
      sessions.push({ ageGroup, dateRange, dayTime, notes });
    }
  }
  return sessions;
}

function normalizeWhatToBring(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Fetches the singleton tryout page content row, or null when none exists. */
export async function fetchTryoutPageContent(
  clubId: string,
): Promise<TryoutPageContent | null> {
  if (!clubId) {
    throw new Error("fetchTryoutPageContent requires an explicit clubId");
  }
  const { data, error } = await supabase
    .from("tryout_page_content")
    .select("*")
    .eq("club_id", clubId)
    .maybeSingle();
  if (error) {
    console.error("fetchTryoutPageContent:", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as unknown as TryoutPageContentRow;
  return {
    heroHeadlineTop: row.hero_headline_top,
    heroHeadlineEm: row.hero_headline_em,
    heroIntro: row.hero_intro,
    sessions: normalizeTryoutSessions(row.sessions),
    whatToBring: normalizeWhatToBring(row.what_to_bring),
    feeNote: row.fee_note,
    ctaLabel: row.cta_label,
  };
}
