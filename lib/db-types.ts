// ─────────────────────────────────────────────
//  Raw row types from Supabase — mirrors the DB schema exactly.
//  Do NOT use these directly in components; use the mapped types
//  from lib/data.ts via lib/queries.ts instead.
// ─────────────────────────────────────────────

import type { Tables } from "@/lib/database.generated";

export type DBProgram = Tables<{ schema: "onzio" }, "programs">;
export type DBProgramMedia = Tables<{ schema: "onzio" }, "program_media">;
export type DBContactProfile = Tables<
  { schema: "onzio" },
  "contact_profile"
>;
export type DBContactPageContent = Tables<
  { schema: "onzio" },
  "contact_page_content"
>;
export type DBTryout = Tables<{ schema: "onzio" }, "tryouts">;
export type DBHomepageStorySection = Tables<
  { schema: "onzio" },
  "homepage_story_section"
>;
export type DBProgramsPageContent = Tables<
  { schema: "onzio" },
  "programs_page_content"
>;

export type DBPlayer = {
  id: string;
  number: number;
  name: string;
  caption: string | null;
  nationality: string;
  position: "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
  height: string;
  weight: string;
  hometown: string;
  age: number;
  school: string | null;
  previous_club: string | null;
  photo_url: string;
  active: boolean;
  bio: string | null;
  pronunciation: string | null;
  foot: string | null;
};

export type DBStaff = {
  id: string;
  initials: string;
  name: string;
  role: string;
  hometown: string;
  nationality: string;
  bio: string | null;
  photo_url: string;
  active: boolean;
};

export type DBMatch = {
  id: string;
  date: string;
  time: string;
  opponent: string;
  opponent_short_name: string | null;
  opponent_logo_url: string | null;
  competition: string | null;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  sponsor_link: string | null;
  home: boolean;
  venue: string;
  address: string | null;
  city: string | null;
  state: string | null;
  rose_city_score: number | null;
  opponent_score: number | null;
  season_id: string | null;
};

export type DBSeason = {
  id: string;
  label: string;
  start_year: number;
  end_year: number;
  active: boolean;
  created_at: string;
};

export type DBPlayerPhoto = {
  id: string;
  player_id: string;
  url: string;
  sort_order: number;
  created_at: string;
};

export type DBPlayerMatchStats = {
  id: string;
  player_id: string;
  match_id: string;
  starts: boolean;        // checkbox in the stats entry form
  mins: number;
  goals: number;
  assists: number;
  tackles: number;
  offsides: number;
  fouls: number;
  fouls_suffered: number;
  yellow: number;
  red: number;
  rating: number | null;
};

export type DBGoalkeeperMatchStats = {
  id: string;
  player_id: string;
  match_id: string;
  starts: boolean;        // checkbox in the stats entry form
  mins: number;
  goals_against: number;
  saves: number;
  clean_sheets: number;
  yellow: number;
  red: number;
  rating: number | null;
};

export type ShopKitSurface = "home" | "shop";
export type ShopKitVariant = "home" | "third" | "away";

export type DBShopKitSection = {
  id: string;
  club_id?: string;
  surface: ShopKitSurface;
  kit_variant: ShopKitVariant;
  eyebrow: string;
  title: string;
  description: string;
  bullet_points: string[];
  store_note: string;
  cta_label: string;
  cta_link: string;
  updated_at: string;
};

export type DBShopKitPhoto = {
  id: string;
  surface: ShopKitSurface;
  kit_variant: ShopKitVariant;
  url: string;
  sort_order: number;
  created_at: string;
};

export type DBShopCarouselPhoto = {
  id: string;
  kit_variant: ShopKitVariant;
  url: string;
  sort_order: number;
  created_at: string;
};

export type ShopPurchaseDetailCard = {
  label: string;
  title: string;
  body: string;
};

export type DBShopPurchaseDetails = {
  id: number;
  heading: string;
  cards: ShopPurchaseDetailCard[];
  cta_eyebrow: string;
  cta_text: string;
  cta_label: string;
  cta_link: string;
  updated_at: string;
};

export type DBHomepageSlideshowPhoto = {
  id: string;
  url: string;
  alt: string;
  sort_order: number;
  created_at: string;
};

export type DBHomepageSlideshowSettings = {
  id: number;
  season_label: string;
  updated_at: string;
};

export type DBHomepageHeroContent = {
  id: number;
  eyebrow: string;
  headline_line_one: string;
  headline_line_two: string;
  intro: string;
  primary_cta_label: string;
  primary_cta_href: string;
  secondary_cta_label: string;
  secondary_cta_href: string;
  updated_at: string;
};

export type DBAboutPageContent = {
  id: number;
  hero_title: string;
  story_paragraphs: string[];
  feature_image_url: string;
  values_heading: string;
  values: Array<{ title: string; description: string }>;
  closing_text: string;
  closing_cta_label: string;
  closing_cta_href: string;
  updated_at: string;
};

export type DBClubLogoPageContent = {
  id: number;
  annotated_image_url: string;
  features: Array<{
    title: string;
    icon_url: string;
    icon_size: number;
    icon_scale: number;
    patch_url: string;
    description: string;
  }>;
  map_image_url: string;
  color_cards: Array<{
    label: string;
    image_url: string;
  }>;
  updated_at: string;
};

export type SponsorLogoPlacement = "carousel" | "footer";

export type DBSiteSponsorLogo = {
  id: string;
  placement: SponsorLogoPlacement;
  name: string;
  logo_url: string;
  sort_order: number;
  created_at: string;
};

export type SiteSocialPlatform =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "x"
  | "youtube";

export type DBSiteSocialLink = {
  id: SiteSocialPlatform;
  label: string;
  href: string;
  icon: string;
  sort_order: number;
  updated_at: string;
};

export type DBBehindTheRoseSection = {
  id: number;
  visible: boolean;
  eyebrow: string;
  title: string;
  description: string;
  video_url: string;
  video_title: string;
  caption: string;
  updated_at: string;
};

export type DBSiteBranding = {
  id: number;
  club_logo_path: string;
  club_logo_asset_id: string | null;
  inverse_logo_path: string;
  inverse_logo_asset_id: string | null;
  /** academy@1 footer tagline; empty means "use the template default". */
  footer_tagline: string;
  updated_at: string;
};

export type DBLeagueStandingsSettings = {
  id: number;
  eyebrow: string;
  title: string;
  intro: string;
  updated_at: string;
};

export type DBLeagueStandingRow = {
  id: string;
  team_name: string;
  team_abbreviation: string | null;
  logo_url: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goal_difference: number;
  points: number;
  is_club: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DBStripeSubscription = {
  id: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  updated_at: string;
};
