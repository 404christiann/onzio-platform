import { supabase } from "@/lib/supabase";
import { Player, Staff, Fixture, GoalkeeperStats, FieldStats } from "@/lib/data";
import {
  DBPlayer,
  DBStaff,
  DBMatch,
  DBSeason,
  DBSiteBranding,
  DBShopKitPhoto,
  DBShopKitSection,
  DBShopPurchaseDetails,
  ShopKitSurface,
  ShopKitVariant,
  DBShopCarouselPhoto,
  DBHomepageHeroContent,
  DBHomepageSlideshowPhoto,
  DBHomepageSlideshowSettings,
  DBBehindTheRoseSection,
  DBAboutPageContent,
  DBClubLogoPageContent,
  DBSiteSponsorLogo,
  DBSiteSocialLink,
  DBLeagueStandingRow,
  DBLeagueStandingsSettings,
  DBProgram,
  DBContactProfile,
  DBContactPageContent,
  DBTryout,
  SponsorLogoPlacement,
} from "@/lib/db-types";
import { DEFAULT_CLUB_LOGO_PATH } from "@/lib/club-branding";
import { coerceRating } from "@/lib/db-utils";
import {
  DEFAULT_BEHIND_THE_ROSE_SECTION,
  DEFAULT_HOMEPAGE_HERO_CONTENT,
  DEFAULT_HOMEPAGE_SLIDESHOW_SETTINGS,
  DEFAULT_HOMEPAGE_SLIDESHOW_PHOTOS,
} from "@/lib/homepage-content";
import {
  normalizeKitBulletPoints,
  normalizeKitStoreNote,
} from "@/lib/shop-kit";
import { normalizeShopPurchaseDetails } from "@/lib/shop-purchase-details";
import { defaultSponsorLogosForPlacement } from "@/lib/sponsor-content";
import {
  DEFAULT_ABOUT_PAGE_CONTENT,
  EMPTY_ABOUT_PAGE_CONTENT,
  DEFAULT_CLUB_LOGO_PAGE_CONTENT,
  normalizeAboutValues,
  normalizeClubLogoColorCards,
  normalizeClubLogoFeatures,
  normalizeStoryParagraphs,
} from "@/lib/about-content";
import { normalizeSiteSocialLinks } from "@/lib/social-links";
import {
  DEFAULT_STANDINGS_ROWS,
  DEFAULT_STANDINGS_SETTINGS,
  normalizeStandingsRows,
  normalizeStandingsSettings,
  type StandingsTableContent,
} from "@/lib/standings-content";
import {
  resolveMediaReferences,
  resolveMediaStoragePath,
} from "@/lib/media-assets";
import { normalizePublicHref } from "@/lib/public-link";

const TEST_CLUB_ID = "11111111-1111-4111-8111-111111111111";

function requireClubId(clubId?: string): string {
  if (clubId) return clubId;
  if (process.env.NODE_ENV === "test") return TEST_CLUB_ID;
  throw new Error("Tenant-scoped query requires an explicit clubId");
}

function defaultGKStats(): GoalkeeperStats {
  return { goalsAgainst: 0, saves: 0, cleanSheets: 0, starts: 0, yellow: 0, red: 0, mins: 0 };
}

function defaultFieldStats(): FieldStats {
  return { goals: 0, assists: 0, tackles: 0, starts: 0, yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, foulsSuffered: 0 };
}

function mapPlayer(row: DBPlayer, stats: GoalkeeperStats | FieldStats, actionPhotos: string[] = []): Player {
  return {
    id: row.id, number: row.number, name: row.name,
    caption: row.caption ?? undefined, nationality: row.nationality,
    position: row.position, height: row.height, weight: row.weight,
    hometown: row.hometown, age: row.age,
    school: row.school ?? undefined, previousClub: row.previous_club ?? undefined,
    image: row.photo_url, stats,
    bio: row.bio ?? undefined, pronunciation: row.pronunciation ?? undefined,
    foot: row.foot ?? undefined,
    actionPhotos: actionPhotos.length > 0 ? actionPhotos : undefined,
  };
}

function mapStaff(row: DBStaff): Staff {
  return {
    initials: row.initials, name: row.name, role: row.role,
    hometown: row.hometown, nationality: row.nationality ?? "",
    bio: row.bio ?? null, image: row.photo_url,
  };
}

function mapFixture(row: DBMatch): Fixture {
  return {
    id: row.id, date: row.date, time: row.time, opponent: row.opponent,
    opponentShortName: row.opponent_short_name,
    opponentLogoUrl: row.opponent_logo_url, competition: row.competition,
    sponsorName: row.sponsor_name, sponsorLogoUrl: row.sponsor_logo_url,
    sponsorLink: row.sponsor_link,
    home: row.home, venue: row.venue, address: row.address ?? undefined,
    city: row.city, state: row.state,
    roseCityScore: row.rose_city_score,
    opponentScore: row.opponent_score,
  };
}

type MatchMeta = { date: string; opponent: string; seasonId: string | null };

function buildMatchMap(data: unknown): Map<string, MatchMeta> {
  return new Map(
    ((data ?? []) as { id: string; date: string; opponent: string; season_id: string | null }[])
      .map((m) => [m.id, { date: m.date, opponent: m.opponent, seasonId: m.season_id }]),
  );
}

const byDate = <T extends { date: string }>(a: T, b: T) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;


// ── Types ─────────────────────────────────────────────────────

export type MatchLogRow = {
  matchId:  string;
  date:     string;
  opponent: string;
  mins:     number;
  goals:    number;
  assists:  number;
  rating:   number | null;
};

export type PlayerMatchTrendPoint = {
  date:     string;
  opponent: string;
  value:    number;        // goals+assists for field players, saves for GKs
  mins:     number;
  rating:   number | null;
};

export type ShopKitContent = {
  section: DBShopKitSection | null;
  photos: DBShopKitPhoto[];
};

export type ClubBranding = {
  logoPath: string;
  inverseLogoPath: string;
};

export type HomepageContent = {
  hero: DBHomepageHeroContent;
  slideshowPhotos: DBHomepageSlideshowPhoto[];
  slideshowSettings: DBHomepageSlideshowSettings;
  behindTheRose: DBBehindTheRoseSection;
};

export type AboutClubContent = {
  about: DBAboutPageContent;
  logo: DBClubLogoPageContent;
};

export type ProgramContent = {
  id: string;
  slug: string;
  navLabel: string;
  displayTitle: string;
  kicker: string;
  summary: string;
  body: string;
  highlights: string[];
  layoutVariant: "statement_band" | "detail_focus";
  heroMediaUrl: string;
  detailMediaUrl: string;
  externalCta: { label: string; href: string } | null;
  sortOrder: number;
};

export type ContactContent = {
  profile: {
    publicEmail: string;
    publicPhone: string;
    serviceArea: string;
    hours: string;
  } | null;
  page: {
    eyebrow: string;
    headline: string;
    intro: string;
    heroMediaUrl: string;
  } | null;
  socialLinks: DBSiteSocialLink[];
};

export type TryoutAction =
  | { kind: "registration"; label: string; href: string }
  | { kind: "contact"; label: "Contact the club"; href: string };

export type TryoutContent = {
  id: string;
  programId: string | null;
  status: "upcoming" | "open" | "closed";
  eyebrow: string;
  headline: string;
  intro: string;
  heroMediaUrl: string;
  eligibilityCopy: string;
  whatToExpectCopy: string;
  preparationCopy: string;
  eventDate: string | null;
  location: string;
  costText: string;
  closedMessage: string;
  sortOrder: number;
  action: TryoutAction | null;
};

type HydratedProgram = DBProgram & {
  hero_media_url?: string;
  detail_media_url?: string;
};

type HydratedContactPage = DBContactPageContent & {
  hero_media_url?: string;
};

type HydratedTryout = DBTryout & {
  hero_media_url?: string;
};

const CLUB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function requireVerifiedClubId(clubId: string): string {
  if (!CLUB_ID_PATTERN.test(clubId)) {
    throw new Error("Public domain query requires a verified clubId UUID");
  }
  return clubId;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function mapProgram(row: HydratedProgram): ProgramContent {
  const href = normalizePublicHref(row.external_cta_href);
  const label = row.external_cta_label.trim();
  return {
    id: row.id,
    slug: row.slug,
    navLabel: row.nav_label,
    displayTitle: row.display_title,
    kicker: row.kicker,
    summary: row.summary,
    body: row.body,
    highlights: stringArray(row.highlights),
    layoutVariant:
      row.layout_variant === "detail_focus" ? "detail_focus" : "statement_band",
    heroMediaUrl: row.hero_media_url ?? "",
    detailMediaUrl: row.detail_media_url ?? "",
    externalCta: href && label ? { label, href } : null,
    sortOrder: row.sort_order,
  };
}

function contactHref(email: unknown): string {
  if (
    typeof email !== "string" ||
    email !== email.trim() ||
    !PUBLIC_EMAIL_PATTERN.test(email)
  ) {
    return "";
  }
  return `mailto:${email}`;
}

function mapTryout(row: HydratedTryout, email: unknown): TryoutContent {
  const registrationHref = normalizePublicHref(row.registration_href);
  const registrationLabel = row.cta_label.trim();
  const fallbackHref = contactHref(email);
  const action: TryoutAction | null =
    row.status !== "closed" && registrationHref && registrationLabel
      ? {
          kind: "registration",
          label: registrationLabel,
          href: registrationHref,
        }
      : fallbackHref
        ? {
            kind: "contact",
            label: "Contact the club",
            href: fallbackHref,
          }
        : null;

  return {
    id: row.id,
    programId: row.program_id,
    status:
      row.status === "open" || row.status === "closed"
        ? row.status
        : "upcoming",
    eyebrow: row.eyebrow,
    headline: row.headline,
    intro: row.intro,
    heroMediaUrl: row.hero_media_url ?? "",
    eligibilityCopy: row.eligibility_copy,
    whatToExpectCopy: row.what_to_expect_copy,
    preparationCopy: row.preparation_copy,
    eventDate: row.event_date,
    location: row.location,
    costText: row.cost_text,
    closedMessage: row.closed_message,
    sortOrder: row.sort_order,
    action,
  };
}


// ── Queries ───────────────────────────────────────────────────

/** Fetches active Programs content for one already-verified tenant. */
export async function fetchPrograms(clubId: string): Promise<ProgramContent[]> {
  const tenantId = requireVerifiedClubId(clubId);
  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .eq("club_id", tenantId)
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`fetchPrograms: ${error.message}`);

  const rows = await resolveMediaReferences(
    (data ?? []) as DBProgram[],
    tenantId,
    [
      { assetId: "hero_media_asset_id", url: "hero_media_url" },
      { assetId: "detail_media_asset_id", url: "detail_media_url" },
    ],
  );
  return (rows as HydratedProgram[]).map(mapProgram);
}

/** Fetches one active Program by tenant-scoped slug, or null when unavailable. */
export async function fetchProgramBySlug(
  clubId: string,
  slug: string,
): Promise<ProgramContent | null> {
  const tenantId = requireVerifiedClubId(clubId);
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) return null;

  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .eq("club_id", tenantId)
    .eq("slug", slug)
    .eq("status", "active")
    .limit(1);
  if (error) throw new Error(`fetchProgramBySlug: ${error.message}`);
  const rows = await resolveMediaReferences(
    (data ?? []) as DBProgram[],
    tenantId,
    [
      { assetId: "hero_media_asset_id", url: "hero_media_url" },
      { assetId: "detail_media_asset_id", url: "detail_media_url" },
    ],
  );
  const row = (rows as HydratedProgram[])[0];
  return row ? mapProgram(row) : null;
}

/** Fetches canonical Contact data, page copy, and shared social destinations. */
export async function fetchContactContent(
  clubId: string,
): Promise<ContactContent> {
  const tenantId = requireVerifiedClubId(clubId);
  const [profileResult, pageResult, socialResult] = await Promise.all([
    supabase
      .from("contact_profile")
      .select("*")
      .eq("club_id", tenantId)
      .limit(1),
    supabase
      .from("contact_page_content")
      .select("*")
      .eq("club_id", tenantId)
      .limit(1),
    supabase
      .from("site_social_links")
      .select("*")
      .eq("club_id", tenantId)
      .order("sort_order", { ascending: true }),
  ]);
  const error = profileResult.error ?? pageResult.error ?? socialResult.error;
  if (error) throw new Error(`fetchContactContent: ${error.message}`);

  const profile = ((profileResult.data ?? []) as DBContactProfile[])[0] ?? null;
  const hydratedPages = await resolveMediaReferences(
    (pageResult.data ?? []) as DBContactPageContent[],
    tenantId,
    [{ assetId: "hero_media_asset_id", url: "hero_media_url" }],
  );
  const page = (hydratedPages as HydratedContactPage[])[0] ?? null;
  const socialLinks = ((socialResult.data ?? []) as DBSiteSocialLink[])
    .map((link) => ({ ...link, href: normalizePublicHref(link.href) }))
    .filter((link) => link.href !== "");

  return {
    profile: profile
      ? {
          publicEmail: profile.public_email,
          publicPhone: profile.public_phone,
          serviceArea: profile.service_area,
          hours: profile.hours,
        }
      : null,
    page: page
      ? {
          eyebrow: page.eyebrow,
          headline: page.headline,
          intro: page.intro,
          heroMediaUrl: page.hero_media_url ?? "",
        }
      : null,
    socialLinks,
  };
}

/** Fetches ordered Tryouts and derives a safe registration/contact action. */
export async function fetchTryouts(clubId: string): Promise<TryoutContent[]> {
  const tenantId = requireVerifiedClubId(clubId);
  const [tryoutsResult, contactResult] = await Promise.all([
    supabase
      .from("tryouts")
      .select("*")
      .eq("club_id", tenantId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("contact_profile")
      .select("public_email")
      .eq("club_id", tenantId)
      .limit(1),
  ]);
  const error = tryoutsResult.error ?? contactResult.error;
  if (error) throw new Error(`fetchTryouts: ${error.message}`);

  const rows = await resolveMediaReferences(
    (tryoutsResult.data ?? []) as DBTryout[],
    tenantId,
    [{ assetId: "hero_media_asset_id", url: "hero_media_url" }],
  );
  const email = (
    (contactResult.data ?? []) as Pick<DBContactProfile, "public_email">[]
  )[0]?.public_email;
  return (rows as HydratedTryout[]).map((row) => mapTryout(row, email));
}

/** Returns all seasons ordered newest first. */
export async function fetchSeasons(clubId?: string): Promise<DBSeason[]> {
  const tenantId = requireClubId(clubId);
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .eq("club_id", tenantId)
    .order("start_year", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DBSeason[];
}

/** Returns the single active season, or null when none is configured. */
export async function fetchActiveSeason(clubId?: string): Promise<DBSeason | null> {
  const tenantId = requireClubId(clubId);
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .eq("club_id", tenantId)
    .eq("active", true)
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as DBSeason[])[0] ?? null;
}

/** Returns the shared club-branding record with the shipped crest as fallback. */
export async function fetchClubBranding(clubId?: string): Promise<ClubBranding> {
  const tenantId = requireClubId(clubId);
  const query = supabase
    .from("site_branding")
    .select("club_id, club_logo_path, club_logo_asset_id, inverse_logo_path, inverse_logo_asset_id, updated_at");
  const { data, error } = await (
    clubId ? query.eq("club_id", tenantId) : query.eq("id", 1)
  ).limit(1);
  if (error) throw new Error(`fetchClubBranding: ${error.message}`);
  const row = ((data ?? []) as unknown as DBSiteBranding[])[0] ?? null;
  return {
    logoPath: await resolveMediaStoragePath(
      tenantId,
      row?.club_logo_asset_id,
      row?.club_logo_path?.trim() || (clubId ? "" : DEFAULT_CLUB_LOGO_PATH),
    ),
    inverseLogoPath: await resolveMediaStoragePath(
      tenantId,
      row?.inverse_logo_asset_id,
      row?.inverse_logo_path?.trim() || "",
    ),
  };
}

/** Fetches the singleton shop kit section and its ordered photos. */
export async function fetchShopKitContent(
  surface: ShopKitSurface = "home",
  variant: ShopKitVariant = "home",
  clubId?: string,
): Promise<ShopKitContent> {
  const tenantId = requireClubId(clubId);
  const [sectionResult, photosResult] = await Promise.all([
    supabase
      .from("shop_kit_section")
      .select("*")
      .eq("club_id", tenantId)
      .eq("surface", surface)
      .eq("kit_variant", variant)
      .limit(1),
    supabase
      .from("shop_kit_photos")
      .select("*")
      .eq("club_id", tenantId)
      .eq("surface", surface)
      .eq("kit_variant", variant)
      .order("sort_order", { ascending: true }),
  ]);
  const error = sectionResult.error ?? photosResult.error;
  if (error) throw new Error(`fetchShopKitContent: ${error.message}`);
  const rawSection = ((sectionResult.data ?? []) as DBShopKitSection[])[0] ?? null;
  return {
    section: rawSection
      ? {
          ...rawSection,
          bullet_points: normalizeKitBulletPoints(rawSection.bullet_points),
          store_note: normalizeKitStoreNote(rawSection.store_note),
        }
      : null,
    photos: (await resolveMediaReferences(
      (photosResult.data ?? []) as Record<string, unknown>[],
      tenantId,
      [{ assetId: "media_asset_id", url: "url" }],
    )) as unknown as DBShopKitPhoto[],
  };
}

/** Fetches each configured kit presentation for a public surface. */
export async function fetchShopKitVariants(
  surface: ShopKitSurface = "home",
  clubId?: string,
): Promise<Record<ShopKitVariant, ShopKitContent>> {
  const [home, third, away] = await Promise.all([
    fetchShopKitContent(surface, "home", clubId),
    fetchShopKitContent(surface, "third", clubId),
    fetchShopKitContent(surface, "away", clubId),
  ]);
  return { home, third, away };
}

/** Fetches the editable purchase details section for the shop page. */
export async function fetchShopPurchaseDetails(clubId?: string): Promise<DBShopPurchaseDetails> {
  const tenantId = requireClubId(clubId);
  const query = supabase
    .from("shop_purchase_details")
    .select("*");
  const { data, error } = await (
    clubId ? query.eq("club_id", tenantId) : query.eq("id", 1)
  ).limit(1);
  if (error) throw new Error(`fetchShopPurchaseDetails: ${error.message}`);
  const row = ((data ?? []) as DBShopPurchaseDetails[])[0] ?? null;
  return normalizeShopPurchaseDetails(row, { legacyFallback: !clubId });
}

/** Fetches the ordered shop-page photo row for one shop kit variant. */
export async function fetchShopCarouselPhotos(
  variant: ShopKitVariant = "home",
  clubId?: string,
): Promise<DBShopCarouselPhoto[]> {
  const tenantId = requireClubId(clubId);
  const { data, error } = await supabase
    .from("shop_carousel_photos")
    .select("*")
    .eq("club_id", tenantId)
    .eq("kit_variant", variant)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`fetchShopCarouselPhotos: ${error.message}`);
  return (await resolveMediaReferences(
    (data ?? []) as Record<string, unknown>[],
    tenantId,
    [{ assetId: "media_asset_id", url: "url" }],
  )) as unknown as DBShopCarouselPhoto[];
}

/** Fetches admin-managed homepage hero, slideshow, and Behind the Rose content. */
export async function fetchHomepageContent(clubId?: string): Promise<HomepageContent> {
  const tenantId = requireClubId(clubId);
  const tenantScoped = Boolean(clubId);
  const [heroResult, slideshowResult, settingsResult, behindTheRoseResult] = await Promise.all([
    supabase
      .from("homepage_hero_content")
      .select("*")
      .eq("club_id", tenantId)
      .limit(1),
    supabase
      .from("homepage_slideshow_photos")
      .select("*")
      .eq("club_id", tenantId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("homepage_slideshow_settings")
      .select("*")
      .eq("club_id", tenantId)
      .limit(1),
    supabase
      .from("behind_the_rose_section")
      .select("*")
      .eq("club_id", tenantId)
      .limit(1),
  ]);

  const slideshowPhotos =
    slideshowResult.error || !slideshowResult.data
      ? tenantScoped ? [] : DEFAULT_HOMEPAGE_SLIDESHOW_PHOTOS
      : ((await resolveMediaReferences(
          slideshowResult.data as Record<string, unknown>[],
          tenantId,
          [{ assetId: "media_asset_id", url: "url" }],
        )) as unknown as DBHomepageSlideshowPhoto[]);
  const slideshowSettings =
    settingsResult.error || !settingsResult.data
      ? DEFAULT_HOMEPAGE_SLIDESHOW_SETTINGS
      : ((settingsResult.data ?? []) as DBHomepageSlideshowSettings[])[0] ??
        DEFAULT_HOMEPAGE_SLIDESHOW_SETTINGS;
  const behindTheRose =
    behindTheRoseResult.error || !behindTheRoseResult.data
      ? tenantScoped
        ? { ...DEFAULT_BEHIND_THE_ROSE_SECTION, visible: false }
        : DEFAULT_BEHIND_THE_ROSE_SECTION
      : ((behindTheRoseResult.data ?? []) as DBBehindTheRoseSection[])[0] ??
        (tenantScoped
          ? { ...DEFAULT_BEHIND_THE_ROSE_SECTION, visible: false }
          : DEFAULT_BEHIND_THE_ROSE_SECTION);
  // Unlike the sibling fallbacks above, this had no tenantScoped-safe variant,
  // so a club with no public-readable hero row (e.g. public_access below
  // live/grace) rendered this file's hardcoded Rose City default instead of
  // falling through to the caller's own club.name/empty-state handling.
  const tenantSafeHeroDefault: DBHomepageHeroContent = {
    ...DEFAULT_HOMEPAGE_HERO_CONTENT,
    headline_line_one: "",
    primary_cta_label: "",
    primary_cta_href: "",
    secondary_cta_label: "",
    secondary_cta_href: "",
  };

  return {
    hero:
      heroResult.error || !heroResult.data
        ? tenantScoped
          ? tenantSafeHeroDefault
          : DEFAULT_HOMEPAGE_HERO_CONTENT
        : ((heroResult.data ?? []) as DBHomepageHeroContent[])[0] ??
          (tenantScoped ? tenantSafeHeroDefault : DEFAULT_HOMEPAGE_HERO_CONTENT),
    slideshowPhotos,
    slideshowSettings,
    behindTheRose,
  };
}

/** Fetches editable About Club and Club Logo page content. */
export async function fetchAboutClubContent(clubId?: string): Promise<AboutClubContent> {
  const tenantId = requireClubId(clubId);
  const [aboutResult, logoResult] = await Promise.all([
    supabase
      .from("about_page_content")
      .select("*")
      .eq("club_id", tenantId)
      .limit(1),
    supabase
      .from("club_logo_page_content")
      .select("*")
      .eq("club_id", tenantId)
      .limit(1),
  ]);

  const hydratedAbout = await resolveMediaReferences(
    (aboutResult.data ?? []) as Record<string, unknown>[],
    tenantId,
    [{ assetId: "feature_image_asset_id", url: "feature_image_url" }],
  );
  const hydratedLogo = await resolveMediaReferences(
    (logoResult.data ?? []) as Record<string, unknown>[],
    tenantId,
    [
      { assetId: "annotated_image_asset_id", url: "annotated_image_url" },
      { assetId: "map_image_asset_id", url: "map_image_url" },
    ],
  );
  const rawAbout =
    aboutResult.error || !aboutResult.data
      ? null
      : (hydratedAbout as unknown as DBAboutPageContent[])[0] ?? null;
  const rawLogo =
    logoResult.error || !logoResult.data
      ? null
      : (hydratedLogo as unknown as DBClubLogoPageContent[])[0] ?? null;

  return {
    about: rawAbout
      ? {
          ...rawAbout,
          story_paragraphs: normalizeStoryParagraphs(rawAbout.story_paragraphs),
          values: normalizeAboutValues(rawAbout.values),
        }
      : clubId
        ? EMPTY_ABOUT_PAGE_CONTENT
        : DEFAULT_ABOUT_PAGE_CONTENT,
    logo: rawLogo
      ? {
          ...rawLogo,
          features: normalizeClubLogoFeatures(rawLogo.features),
          color_cards: normalizeClubLogoColorCards(rawLogo.color_cards),
        }
      : DEFAULT_CLUB_LOGO_PAGE_CONTENT,
  };
}

/** Fetches ordered site sponsor logos for a public placement. */
export async function fetchSiteSponsorLogos(
  placement: SponsorLogoPlacement,
  clubId?: string,
): Promise<DBSiteSponsorLogo[]> {
  const tenantId = requireClubId(clubId);
  const { data, error } = await supabase
    .from("site_sponsor_logos")
    .select("*")
    .eq("club_id", tenantId)
    .eq("placement", placement)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error(`fetchSiteSponsorLogos(${placement}):`, error.message);
    return clubId ? [] : defaultSponsorLogosForPlacement(placement);
  }
  const rows = (await resolveMediaReferences(
    (data ?? []) as Record<string, unknown>[],
    tenantId,
    [{ assetId: "media_asset_id", url: "logo_url" }],
  )) as unknown as DBSiteSponsorLogo[];
  return rows.length > 0 || clubId ? rows : defaultSponsorLogosForPlacement(placement);
}

/** Fetches the DB-backed league standings table for the homepage. */
export async function fetchLeagueStandings(clubId?: string): Promise<StandingsTableContent> {
  const tenantId = requireClubId(clubId);
  const [settingsResult, rowsResult] = await Promise.all([
    supabase
      .from("league_standings_settings")
      .select("*")
      .eq("club_id", tenantId)
      .limit(1),
    supabase
      .from("league_standings")
      .select("*")
      .eq("club_id", tenantId)
      .order("sort_order", { ascending: true }),
  ]);

  if (settingsResult.error || rowsResult.error) {
    const message = settingsResult.error?.message ?? rowsResult.error?.message;
    console.error("fetchLeagueStandings:", message);
    return {
      settings: clubId ? DEFAULT_STANDINGS_SETTINGS : normalizeStandingsSettings(null),
      rows: clubId ? [] : DEFAULT_STANDINGS_ROWS,
    };
  }

  return {
    settings: normalizeStandingsSettings(
      ((settingsResult.data ?? []) as DBLeagueStandingsSettings[])[0] ?? null,
    ),
    rows: normalizeStandingsRows(
      (await resolveMediaReferences(
        (rowsResult.data ?? []) as Record<string, unknown>[],
        tenantId,
        [{ assetId: "logo_asset_id", url: "logo_url" }],
      )) as unknown as DBLeagueStandingRow[],
    ),
  };
}

/** Fetches editable footer social media links. */
export async function fetchSiteSocialLinks(clubId?: string): Promise<DBSiteSocialLink[]> {
  const tenantId = requireClubId(clubId);
  const { data, error } = await supabase
    .from("site_social_links")
    .select("*")
    .eq("club_id", tenantId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("fetchSiteSocialLinks:", error.message);
    return clubId ? [] : normalizeSiteSocialLinks([]);
  }
  const rows = (data ?? []) as DBSiteSocialLink[];
  return clubId ? rows : normalizeSiteSocialLinks(rows);
}

/**
 * Fetches players grouped by position with season-aggregate stats.
 *
 * The cohort is determined by presence in the selected season's aggregate
 * stats. The active season additionally respects `players.active`, while
 * historical seasons retain players who have since been deactivated.
 * Falls back to the active season when omitted.
 */
export async function fetchRoster(seasonId?: string, clubId?: string): Promise<{
  goalkeepers: Player[];
  defenders:   Player[];
  midfielders: Player[];
  forwards:    Player[];
  seasonLabel: string;
  seasonId:    string;
}> {
  const tenantId = requireClubId(clubId);
  let resolvedSeasonId = "";
  let seasonLabel      = "Current Season";
  let isActiveSeason   = false;

  if (seasonId) {
    const { data, error } = await supabase.from("seasons").select("*").eq("club_id", tenantId);
    if (error) throw new Error(`fetchRoster seasons: ${error.message}`);
    const season = ((data ?? []) as DBSeason[]).find((s) => s.id === seasonId) ?? null;
    resolvedSeasonId = seasonId;
    seasonLabel      = season?.label ?? "Season";
    isActiveSeason   = season?.active === true;
  } else {
    const { data, error } = await supabase.from("seasons").select("*").eq("club_id", tenantId).eq("active", true);
    if (error) throw new Error(`fetchRoster active season: ${error.message}`);
    const season = ((data ?? []) as DBSeason[])[0] ?? null;
    resolvedSeasonId = season?.id ?? "";
    seasonLabel      = season?.label ?? "Current Season";
    isActiveSeason   = season?.active === true;
  }

  const [fieldResult, goalkeeperResult] = await Promise.all([
    supabase.from("player_season_stats").select("*").eq("club_id", tenantId).eq("season_id", resolvedSeasonId),
    supabase.from("goalkeeper_season_stats").select("*").eq("club_id", tenantId).eq("season_id", resolvedSeasonId),
  ]);
  const seasonStatsError = fieldResult.error ?? goalkeeperResult.error;
  if (seasonStatsError) throw new Error(`fetchRoster season stats: ${seasonStatsError.message}`);

  const fieldStats = (fieldResult.data      ?? []) as Record<string, unknown>[];
  const gkStats    = (goalkeeperResult.data ?? []) as Record<string, unknown>[];

  const allPlayerIds = [
    ...fieldStats.map((r) => r.player_id as string),
    ...gkStats.map((r)    => r.player_id as string),
  ].filter(Boolean);

  const [playersResult, photosResult] = await Promise.all([
    supabase.from("players").select("*").eq("club_id", tenantId).in("id", allPlayerIds),
    supabase.from("player_photos")
      .select("player_id, url, sort_order")
      .eq("club_id", tenantId)
      .in("player_id", allPlayerIds)
      .order("sort_order", { ascending: true }),
  ]);
  const rosterDataError = playersResult.error ?? photosResult.error;
  if (rosterDataError) throw new Error(`fetchRoster players: ${rosterDataError.message}`);

  const hydratedPlayers = await resolveMediaReferences(
    (playersResult.data ?? []) as Record<string, unknown>[],
    tenantId,
    [{ assetId: "photo_asset_id", url: "photo_url" }],
  );
  const hydratedPhotos = await resolveMediaReferences(
    (photosResult.data ?? []) as Record<string, unknown>[],
    tenantId,
    [{ assetId: "media_asset_id", url: "url" }],
  );
  const players = (hydratedPlayers as unknown as DBPlayer[]).filter(
    (player) => !isActiveSeason || player.active,
  );

  const photosByPlayer = new Map<string, string[]>();
  (hydratedPhotos as unknown as { player_id: string; url: string; sort_order: number }[]).forEach((r) => {
    const arr = photosByPlayer.get(r.player_id) ?? [];
    arr.push(r.url);
    photosByPlayer.set(r.player_id, arr);
  });

  const fieldStatsByPlayer = new Map<string, FieldStats>();
  fieldStats.forEach((r) => {
    fieldStatsByPlayer.set(r.player_id as string, {
      goals:         r.goals         as number,
      assists:       r.assists        as number,
      tackles:       r.tackles        as number,
      starts:        r.starts         as number,
      yellow:        r.yellow         as number,
      red:           r.red            as number,
      mins:          r.mins           as number,
      offsides:      (r.offsides      as number) ?? 0,
      fouls:         (r.fouls         as number) ?? 0,
      foulsSuffered: (r.fouls_suffered as number) ?? 0,
    });
  });

  const gkStatsByPlayer = new Map<string, GoalkeeperStats>();
  gkStats.forEach((r) => {
    gkStatsByPlayer.set(r.player_id as string, {
      goalsAgainst: r.goals_against as number,
      saves:        r.saves         as number,
      cleanSheets:  r.clean_sheets  as number,
      starts:       r.starts        as number,
      yellow:       r.yellow        as number,
      red:          r.red           as number,
      mins:         r.mins          as number,
    });
  });

  const mapped = players.map((row) => {
    const photos = photosByPlayer.get(row.id) ?? [];
    return row.position === "Goalkeeper"
      ? mapPlayer(row, gkStatsByPlayer.get(row.id)    ?? defaultGKStats(),    photos)
      : mapPlayer(row, fieldStatsByPlayer.get(row.id) ?? defaultFieldStats(), photos);
  });

  return {
    goalkeepers: mapped.filter((p) => p.position === "Goalkeeper"),
    defenders:   mapped.filter((p) => p.position === "Defender"),
    midfielders: mapped.filter((p) => p.position === "Midfielder"),
    forwards:    mapped.filter((p) => p.position === "Forward"),
    seasonLabel,
    seasonId: resolvedSeasonId,
  };
}

/** Fetches all active staff members. */
export async function fetchStaff(clubId?: string): Promise<Staff[]> {
  const tenantId = requireClubId(clubId);
  const { data, error } = await supabase
    .from("staff").select("*").eq("club_id", tenantId).eq("active", true).order("id", { ascending: true });
  if (error) throw new Error(`fetchStaff: ${error.message}`);
  const rows = await resolveMediaReferences(
    (data ?? []) as Record<string, unknown>[],
    tenantId,
    [{ assetId: "photo_asset_id", url: "photo_url" }],
  );
  return (rows as unknown as DBStaff[]).map(mapStaff);
}

/** Fetches one active roster player with current-season stats. */
export async function fetchPlayerProfile(
  playerId: string,
  clubId?: string,
): Promise<{ player: Player; seasonLabel: string; seasonId: string } | null> {
  const roster = await fetchRoster(undefined, clubId);
  const player = [
    ...roster.goalkeepers,
    ...roster.defenders,
    ...roster.midfielders,
    ...roster.forwards,
  ].find((candidate) => candidate.id === playerId);

  return player
    ? {
        player,
        seasonLabel: roster.seasonLabel,
        seasonId: roster.seasonId,
      }
    : null;
}

/**
 * Fetches per-match stats for a single player as a flat MatchLogRow[],
 * filtered to the given season. Powers the scatter plot, stacked bar,
 * donut, and match-log table.
 */
export async function fetchPlayerMatchLog(
  playerId: string,
  gk: boolean,
  seasonId: string,
  clubId?: string,
): Promise<MatchLogRow[]> {
  const tenantId = requireClubId(clubId);
  const table  = gk ? "goalkeeper_match_stats" : "player_match_stats";
  const fields = gk
    ? "match_id, goals_against, saves, mins, rating"
    : "match_id, goals, assists, mins, rating";

  const { data: statsData, error: statsError } = await supabase
    .from(table).select(fields).eq("club_id", tenantId).eq("player_id", playerId).gt("mins", 0);
  if (statsError) throw new Error(statsError.message);

  const { data: matchData, error: matchError } = await supabase
    .from("matches").select("id, date, opponent, season_id").eq("club_id", tenantId).eq("season_id", seasonId);
  if (matchError) throw new Error(matchError.message);

  const matchMap = buildMatchMap(matchData);

  return ((statsData ?? []) as Record<string, unknown>[])
    .map((r) => {
      const match = matchMap.get(r.match_id as string);
      if (!match || match.seasonId !== seasonId) return null;
      return {
        matchId:  r.match_id as string,
        date:     match.date,
        opponent: match.opponent,
        mins:     Number(r.mins),
        goals:    gk ? 0 : Number(r.goals),
        assists:  gk ? 0 : Number(r.assists),
        rating:   coerceRating(r.rating),
      };
    })
    .filter((r): r is MatchLogRow => r !== null)
    .sort(byDate);
}

/**
 * Fetches per-match stats for a single player sorted chronologically.
 * Only matches where the player played (mins > 0) are included.
 * When `seasonId` is provided, results are scoped to that season.
 */
export async function fetchPlayerMatchTrend(
  playerId: string,
  gk: boolean,
  seasonId?: string,
  clubId?: string,
): Promise<PlayerMatchTrendPoint[]> {
  const tenantId = requireClubId(clubId);
  const table  = gk ? "goalkeeper_match_stats" : "player_match_stats";
  const fields = gk
    ? "match_id, saves, mins, rating"
    : "match_id, goals, assists, mins, rating";

  const [{ data: statsData }, { data: matchData }] = await Promise.all([
    supabase.from(table).select(fields).eq("club_id", tenantId).eq("player_id", playerId).gt("mins", 0),
    supabase.from("matches").select("id, date, opponent, season_id").eq("club_id", tenantId),
  ]);

  const matchMap = buildMatchMap(matchData);

  return ((statsData ?? []) as unknown as Record<string, unknown>[])
    .map((r) => {
      const match = matchMap.get(r.match_id as string);
      if (!match) return null;
      if (seasonId && match.seasonId !== seasonId) return null;
      return {
        date:     match.date,
        opponent: match.opponent,
        value:    gk ? Number(r.saves) : Number(r.goals) + Number(r.assists),
        mins:     Number(r.mins),
        rating:   coerceRating(r.rating),
      };
    })
    .filter((r): r is PlayerMatchTrendPoint => r !== null)
    .sort(byDate);
}

/** Fetches all matches ordered by date ascending. */
export async function fetchSchedule(seasonId?: string, clubId?: string): Promise<Fixture[]> {
  const tenantId = requireClubId(clubId);
  let query = supabase.from("matches").select("*").eq("club_id", tenantId);
  if (seasonId) query = query.eq("season_id", seasonId);
  const { data, error } = await query;
  if (error) throw new Error(`fetchSchedule: ${error.message}`);
  const rows = await resolveMediaReferences(
    (data ?? []) as Record<string, unknown>[],
    tenantId,
    [
      { assetId: "opponent_logo_asset_id", url: "opponent_logo_url" },
      { assetId: "sponsor_logo_asset_id", url: "sponsor_logo_url" },
    ],
  );
  return (rows as unknown as DBMatch[]).map(mapFixture).sort((a, b) => {
    const ka = `${a.date}T${a.time ?? "00:00"}`;
    const kb = `${b.date}T${b.time ?? "00:00"}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** Fetches one tenant-owned match by its stable row ID. */
export async function fetchFixtureById(
  fixtureId: string,
  clubId?: string,
): Promise<Fixture | null> {
  const tenantId = requireClubId(clubId);
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("club_id", tenantId)
    .eq("id", fixtureId)
    .maybeSingle();
  if (error) throw new Error(`fetchFixtureById: ${error.message}`);
  const rows = await resolveMediaReferences(
    data ? [data as Record<string, unknown>] : [],
    tenantId,
    [
      { assetId: "opponent_logo_asset_id", url: "opponent_logo_url" },
      { assetId: "sponsor_logo_asset_id", url: "sponsor_logo_url" },
    ],
  );
  return rows[0] ? mapFixture(rows[0] as unknown as DBMatch) : null;
}
