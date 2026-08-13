import { createHash } from "node:crypto";
import type {
  LionsMediaImportPlan,
  LionsPlannedMediaAsset,
} from "@/lib/migration/lions-media-plan";
import { deterministicUuid } from "@/lib/migration/rose-city-plan";
import { parsePresentationDocument } from "@/packages/presentation";

export const LIONS_LOCAL_TENANT_ID = "9d292f0a-6f93-54b1-b21c-ce2d0af3afa7";
export const LIONS_LOCAL_DOMAIN_ID = deterministicUuid(
  "onzio:domain:lions.localhost",
);
export const LIONS_LOCAL_HOSTNAME = "lions.localhost";
export const LIONS_LOCAL_PRESENTATION_DOCUMENT_ID = deterministicUuid(
  "onzio:lions:presentation:clubhouse@1:published",
);
export const LIONS_LOCAL_PRESENTATION_PUBLICATION_ID = deterministicUuid(
  "onzio:lions:presentation-publication:clubhouse@1:published",
);
// Lions E7: the clubhouse@1 document/publication IDs above stay defined and
// exported -- presentation_documents rows are immutable/insert-only by
// design, so the original clubhouse@1 document this project verified against
// through E1-E6 remains a valid, permanently orphaned historical row rather
// than something deleted or repurposed. Only presentation_state now points
// at the editorial@1 document below.
export const LIONS_LOCAL_EDITORIAL_DOCUMENT_ID = deterministicUuid(
  "onzio:lions:presentation:editorial@1:published",
);
export const LIONS_LOCAL_EDITORIAL_PUBLICATION_ID = deterministicUuid(
  "onzio:lions:presentation-publication:editorial@1:published",
);
export const LIONS_LOCAL_PRESENTATION_ACTOR_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

// Superseded as of Lions E7 (Lions now publishes on editorial@1, see
// LIONS_EDITORIAL_PRESENTATION_CONFIGURATION below) but kept -- unused,
// still exported -- as the historical record of the clubhouse@1
// configuration every prior phase (E1-E6) verified against via the
// temporary local database switch this phase makes permanent.
export const LIONS_CLUBHOUSE_PRESENTATION_CONFIGURATION = {
  schemaVersion: 1,
  template: { id: "clubhouse", version: 1 },
  fontPack: "geist",
  theme: {
    surface: {
      canvas: "#1B2958",
      elevated: "#FFFFFF",
      subtle: "#F7F5F1",
      inverse: "#F0F0F0",
    },
    text: {
      primary: "#F0F0F0",
      secondary: "#C8CDD8",
      muted: "#687083",
      inverse: "#18213A",
    },
    action: {
      primary: "#F0F0F0",
      primaryHover: "#DADDE5",
      primaryText: "#1B2958",
      secondary: "#AD3234",
    },
    border: {
      subtle: "#35426B",
      strong: "#F0F0F0",
    },
    status: {
      success: "#12A140",
      warning: "#D69E2E",
      danger: "#AD3234",
    },
    accent: {
      one: "#AD3234",
      two: "#F0F0F0",
    },
  },
  modules: {
    roster: true,
    schedule: true,
    store: true,
    sponsors: true,
    staff: true,
    stats: true,
    expandedProfiles: true,
    seasons: true,
    analytics: true,
    affiliations: true,
  },
  homepage: {
    sections: [
      {
        id: "hero-main",
        type: "clubhouse.hero",
        enabled: true,
        emptyBehavior: "error",
        config: {},
      },
      {
        id: "next-match",
        type: "shared.next-match",
        enabled: true,
        emptyBehavior: "hide",
        config: {},
      },
      {
        id: "matchday-slideshow",
        type: "clubhouse.slideshow",
        enabled: true,
        emptyBehavior: "hide",
        config: {},
      },
      {
        id: "kits",
        type: "clubhouse.kits",
        enabled: true,
        emptyBehavior: "hide",
        config: {},
      },
      {
        id: "club-story",
        type: "shared.history",
        enabled: true,
        emptyBehavior: "hide",
        config: {},
      },
      {
        id: "partners",
        type: "clubhouse.partners",
        enabled: true,
        emptyBehavior: "hide",
        config: {},
      },
    ],
  },
  navigation: {
    groups: [
      {
        id: "main",
        label: null,
        routes: ["home", "roster", "schedule", "store"],
      },
    ],
  },
  metadata: {
    recommendationId: null,
    createdBy: LIONS_LOCAL_PRESENTATION_ACTOR_ID,
    createdAt: "2026-07-30T00:00:00.000Z",
    sourceArtifact: "soccerPlatformMockups:lions",
  },
} as const;

// Lions E7: the real, permanent presentation configuration Lions publishes
// on going forward. theme is carried over unchanged from the clubhouse@1
// configuration above -- it already encodes Lions' navy/red palette and
// passes the presentation system's contrast validation inside
// parsePresentationDocument below, so editorial@1 does not need a new
// palette. modules/homepage.sections/navigation are edited down to exactly
// what editorial@1 registers in packages/presentation/index.ts (Lions E2):
// no sponsors/stats/expandedProfiles/seasons/analytics/affiliations, no
// clubhouse.kits/clubhouse.partners sections, and the 7-route editorial nav.
const LIONS_EDITORIAL_PRESENTATION_CONFIGURATION = {
  schemaVersion: 1,
  template: { id: "editorial", version: 1 },
  fontPack: "geist",
  theme: {
    surface: {
      canvas: "#1B2958",
      elevated: "#FFFFFF",
      subtle: "#F7F5F1",
      inverse: "#F0F0F0",
    },
    text: {
      primary: "#F0F0F0",
      secondary: "#C8CDD8",
      muted: "#687083",
      inverse: "#18213A",
    },
    action: {
      primary: "#F0F0F0",
      primaryHover: "#DADDE5",
      primaryText: "#1B2958",
      secondary: "#AD3234",
    },
    border: {
      subtle: "#35426B",
      strong: "#F0F0F0",
    },
    status: {
      success: "#12A140",
      warning: "#D69E2E",
      danger: "#AD3234",
    },
    accent: {
      one: "#AD3234",
      two: "#F0F0F0",
    },
  },
  modules: {
    roster: true,
    schedule: true,
    store: true,
    staff: true,
    tryouts: true,
    contact: true,
  },
  homepage: {
    sections: [
      {
        id: "hero-main",
        type: "editorial.hero",
        enabled: true,
        emptyBehavior: "error",
        config: {},
      },
      {
        id: "next-match",
        type: "shared.next-match",
        enabled: true,
        emptyBehavior: "hide",
        config: {},
      },
      {
        id: "matchday-slideshow",
        type: "editorial.slideshow",
        enabled: true,
        emptyBehavior: "hide",
        config: {},
      },
      {
        id: "club-story",
        type: "shared.history",
        enabled: true,
        emptyBehavior: "hide",
        config: {},
      },
    ],
  },
  navigation: {
    groups: [
      {
        id: "main",
        label: null,
        routes: [
          "home",
          "club",
          "roster",
          "schedule",
          "tryouts",
          "store",
          "contact",
        ],
      },
    ],
  },
  metadata: {
    recommendationId: null,
    createdBy: LIONS_LOCAL_PRESENTATION_ACTOR_ID,
    createdAt: "2026-08-12T00:00:00.000Z",
    sourceArtifact: "soccerPlatformMockups:lions-editorial",
  },
} as const;

type SourceRow = Record<string, unknown>;

export type LionsLocalImportRows = {
  club: SourceRow;
  domain: SourceRow;
  subscription: SourceRow;
  seasons: SourceRow[];
  matches: SourceRow[];
  players: SourceRow[];
  playerSeasonStats: SourceRow[];
  goalkeeperSeasonStats: SourceRow[];
  staff: SourceRow[];
  presentationDocument: SourceRow;
  presentationState: SourceRow;
  presentationPublication: SourceRow;
  mediaAssets: SourceRow[];
  siteBranding: SourceRow;
  homepageHeroContent: SourceRow;
  homepageSlideshowSettings: SourceRow;
  homepageSlideshowPhotos: SourceRow[];
  shopKitSections: SourceRow[];
  shopKitPhotos: SourceRow[];
  shopCarouselPhotos: SourceRow[];
  shopPurchaseDetails: SourceRow;
  aboutPageContent: SourceRow;
  siteSponsorLogos: SourceRow[];
  siteSocialLinks: SourceRow[];
  clubIdentity: SourceRow;
  contactProfile: SourceRow;
  contactPageContent: SourceRow;
  tryouts: SourceRow[];
  tryoutsPageContent: SourceRow;
  auditEvent: SourceRow;
};

export type LionsLocalImportReconciliation = {
  tenantId: string;
  assetCount: number;
  mediaAssetCount: number;
  homepageHeroContentCount: number;
  homepageSlideshowPhotoCount: number;
  shopKitPhotoCount: number;
  shopCarouselPhotoCount: number;
  matchCount: number;
  playerCount: number;
  playerSeasonStatsCount: number;
  goalkeeperSeasonStatsCount: number;
  staffCount: number;
  presentationDocumentCount: number;
  presentationStateCount: number;
  presentationPublicationCount: number;
  sponsorLogoCount: number;
  clubIdentityCount: number;
  contactProfileCount: number;
  contactPageContentCount: number;
  tryoutCount: number;
  tryoutsPageContentCount: number;
  readyContentLinkCount: number;
  blockedContentLinkCount: number;
  sourceChecksumCount: number;
  normalizedChecksumCount: number;
  relationshipCount: number;
  oldSourceUrlReferences: 0;
  hostedMutations: 0;
};

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestJson(value: unknown): string {
  return digest(JSON.stringify(value));
}

function fixedTimestamp(): string {
  return "2026-07-29T00:00:00.000Z";
}

type LionsMockupPosition = "GK" | "DF" | "MF" | "FW";

type LionsMockupPlayer = {
  mockupId: string;
  firstName: string;
  lastName: string;
  number: number;
  position: LionsMockupPosition;
  hometown: string;
  height: string;
  yearJoined: number;
  stats: {
    appearances: number;
    starts: number;
    minutes: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    cleanSheets?: number;
    saves?: number;
  };
};

type LionsMockupStaffMember = {
  mockupId: string;
  name: string;
  role: string;
  bio?: string;
};

const LIONS_FIRST_TEAM: Array<[string, string, number, LionsMockupPosition]> = [
  ["Jonah", "Reed", 1, "GK"],
  ["Mateo", "Silva", 13, "GK"],
  ["Elias", "Ford", 2, "DF"],
  ["Andre", "Kouyate", 3, "DF"],
  ["Noah", "Chen", 4, "DF"],
  ["Luca", "Bennett", 5, "DF"],
  ["Darius", "Cole", 15, "DF"],
  ["Owen", "Park", 22, "DF"],
  ["Miles", "Okafor", 6, "MF"],
  ["Nico", "Valdez", 8, "MF"],
  ["Theo", "Santos", 10, "MF"],
  ["Caleb", "Wright", 14, "MF"],
  ["Isaac", "Amini", 18, "MF"],
  ["Rowan", "Kim", 21, "MF"],
  ["Malik", "Johnson", 7, "FW"],
  ["Santiago", "Ruiz", 9, "FW"],
  ["Adrian", "Brooks", 11, "FW"],
  ["Kenji", "Tanaka", 19, "FW"],
];

const LIONS_U23: Array<[string, string, number, LionsMockupPosition]> = [
  ["Evan", "Hart", 31, "GK"],
  ["Luis", "Mora", 32, "DF"],
  ["Aiden", "Shaw", 33, "DF"],
  ["Rami", "Nasser", 34, "DF"],
  ["Tomas", "Vega", 35, "MF"],
  ["Ben", "Ito", 36, "MF"],
  ["Jalen", "Price", 37, "FW"],
  ["Marco", "Diaz", 38, "FW"],
];

const LIONS_ACADEMY: Array<[string, string, number, LionsMockupPosition]> = [
  ["Kai", "Young", 41, "GK"],
  ["Sam", "Ortiz", 42, "DF"],
  ["Leo", "Mills", 43, "DF"],
  ["Amir", "Khan", 44, "MF"],
  ["Ty", "Ramos", 45, "MF"],
  ["Cole", "Grant", 46, "FW"],
];

const LIONS_STAFF: LionsMockupStaffMember[] = [
  {
    mockupId: "st01",
    name: "Marcus Hale",
    role: "Head Coach",
    bio: "A detail-led coach committed to brave, front-foot soccer.",
  },
  {
    mockupId: "st02",
    name: "Elena Torres",
    role: "Assistant Coach",
    bio: "Leads player development and match preparation.",
  },
  { mockupId: "st03", name: "David Kim", role: "Goalkeeper Coach" },
  { mockupId: "st04", name: "Dr. Maya Brooks", role: "Athletic Trainer" },
  { mockupId: "st05", name: "Renee Walker", role: "Club General Manager" },
  { mockupId: "st06", name: "Omar Castillo", role: "U23 Head Coach" },
];

function positionLabel(position: LionsMockupPosition) {
  return {
    GK: "Goalkeeper",
    DF: "Defender",
    MF: "Midfielder",
    FW: "Forward",
  }[position];
}

function makeLionsPlayers(
  rows: Array<[string, string, number, LionsMockupPosition]>,
  start: number,
): LionsMockupPlayer[] {
  return rows.map(([firstName, lastName, number, position], index) => ({
    mockupId: `p${String(start + index).padStart(2, "0")}`,
    firstName,
    lastName,
    number,
    position,
    hometown:
      index % 3 === 0
        ? "Columbus, OH"
        : index % 3 === 1
          ? "Dublin, OH"
          : "Westerville, OH",
    height: position === "GK" ? "6'2\"" : index % 2 ? "5'11\"" : "6'0\"",
    yearJoined: 2022 + (index % 4),
    stats: {
      appearances: 7,
      starts: 4 + (index % 4),
      minutes: 414 + index * 23,
      goals:
        position === "FW" ? 2 + (index % 4) : position === "MF" ? index % 3 : 0,
      assists: position === "MF" ? 1 + (index % 4) : index % 2,
      yellowCards: index % 3,
      redCards: 0,
      ...(position === "GK" ? { cleanSheets: 2, saves: 24 + index * 3 } : {}),
    },
  }));
}

const LIONS_PLAYERS: LionsMockupPlayer[] = [
  ...makeLionsPlayers(LIONS_FIRST_TEAM, 1),
  ...makeLionsPlayers(LIONS_U23, 19),
  ...makeLionsPlayers(LIONS_ACADEMY, 27),
];

function assetUrl(asset: LionsPlannedMediaAsset): string {
  return asset.destinationPath;
}

function assertPlanSafeForLocalImport(plan: LionsMediaImportPlan) {
  if (
    plan.kind !== "lions-fc-media-import-dry-run-plan" ||
    plan.formatVersion !== 1 ||
    plan.dryRunOnly !== true ||
    plan.summary.hostedMutations !== 0 ||
    plan.destination.environment !== "staging" ||
    plan.destination.tenantId !== LIONS_LOCAL_TENANT_ID
  ) {
    throw new Error("Unexpected Lions media plan for local import.");
  }
  const serialized = JSON.stringify(plan);
  const forbiddenSupabaseTransformPath = ["/storage/v1", "render/image"].join("/");
  if (
    serialized.includes(forbiddenSupabaseTransformPath) ||
    serialized.includes("/_next/image") ||
    /(?:sb_secret_|sk_live_|whsec_|service_role)/i.test(serialized)
  ) {
    throw new Error("Lions media plan contains forbidden delivery or secret-shaped content.");
  }
}

function plannedAssetByName(
  plan: LionsMediaImportPlan,
  name: string,
): LionsPlannedMediaAsset {
  const asset = plan.assets.find((item) => item.sourcePath.endsWith(`/${name}`));
  if (!asset) throw new Error(`Missing planned Lions asset ${name}.`);
  return asset;
}

function readyLink(asset: LionsPlannedMediaAsset, table: string) {
  const link = asset.contentLinks.find(
    (item) => item.status === "ready" && item.table === table,
  );
  if (!link || link.status !== "ready") {
    throw new Error(`Missing ready ${table} link for ${asset.sourcePath}.`);
  }
  return link;
}

function siteBrandingLink(asset: LionsPlannedMediaAsset) {
  const link = asset.contentLinks.find(
    (item) => item.status === "ready" && item.table === "site_branding",
  );
  if (!link || link.status !== "ready" || link.table !== "site_branding") {
    throw new Error(`Missing ready site_branding link for ${asset.sourcePath}.`);
  }
  return link;
}

export function buildLionsLocalImportRows(
  plan: LionsMediaImportPlan,
): LionsLocalImportRows {
  assertPlanSafeForLocalImport(plan);
  const now = fixedTimestamp();
  const clubId = plan.destination.tenantId;
  const crest = plannedAssetByName(plan, "crest.png");
  const whiteCrest = plannedAssetByName(plan, "crest-white.png");
  const primaryLogoLink = siteBrandingLink(crest).fields;
  const inverseLogoLink = siteBrandingLink(whiteCrest).fields;
  if (!primaryLogoLink.club_logo_asset_id || !inverseLogoLink.inverse_logo_asset_id) {
    throw new Error("Lions branding links must include primary and inverse logo media asset IDs.");
  }
  const firstSlideshowImage = plannedAssetByName(
    plan,
    "491417483_17927675355024475_5496002634953332765_n.jpg",
  );
  const currentSeasonId = deterministicUuid("onzio:lions:season:2026");
  const previousSeasonId = deterministicUuid("onzio:lions:season:2025");

  const mediaAssets = plan.assets.map((asset) => ({
    id: asset.assetId,
    club_id: clubId,
    storage_bucket: "onzio-media",
    storage_path: asset.destinationPath,
    surface: asset.surface,
    media_kind: asset.mediaKind,
    mime_type: asset.normalizedMimeType,
    byte_size: asset.normalizedByteSize,
    width: asset.normalizedWidth,
    height: asset.normalizedHeight,
    checksum_sha256: asset.normalizedChecksumSha256,
    status: "published",
    created_by: null,
    created_at: now,
    published_at: now,
    deleted_at: null,
  }));

  const slideshowPhotos = plan.assets
    .flatMap((asset) =>
      asset.contentLinks
        .filter(
          (link) =>
            link.status === "ready" &&
            link.table === "homepage_slideshow_photos",
        )
        .map((link) => {
          if (link.status !== "ready" || link.table !== "homepage_slideshow_photos") {
            throw new Error("Unexpected slideshow link.");
          }
          return {
            id: deterministicUuid(`onzio:lions:homepage-photo:${asset.assetId}`),
            club_id: clubId,
            url: assetUrl(asset),
            media_asset_id: asset.assetId,
            alt: link.fields.alt,
            sort_order: link.fields.sort_order,
            created_at: now,
          };
        }),
    )
    .sort((left, right) => Number(left.sort_order) - Number(right.sort_order));

  const shopKitPhotos = plan.assets.flatMap((asset) =>
    asset.contentLinks
      .filter((link) => link.status === "ready" && link.table === "shop_kit_photos")
      .map((link) => {
        if (link.status !== "ready" || link.table !== "shop_kit_photos") {
          throw new Error("Unexpected shop kit link.");
        }
        return {
          id: deterministicUuid(
            `onzio:lions:shop-kit-photo:${link.fields.surface}:${link.fields.kit_variant}:${asset.assetId}`,
          ),
          club_id: clubId,
          surface: link.fields.surface,
          kit_variant: link.fields.kit_variant,
          url: assetUrl(asset),
          media_asset_id: asset.assetId,
          sort_order: link.fields.sort_order,
          created_at: now,
        };
      }),
  );

  const shopCarouselPhotos = plan.assets.flatMap((asset) =>
    asset.contentLinks
      .filter(
        (link) => link.status === "ready" && link.table === "shop_carousel_photos",
      )
      .map((link) => {
        if (link.status !== "ready" || link.table !== "shop_carousel_photos") {
          throw new Error("Unexpected shop carousel link.");
        }
        return {
          id: deterministicUuid(
            `onzio:lions:shop-carousel-photo:${link.fields.kit_variant}:${asset.assetId}`,
          ),
          club_id: clubId,
          kit_variant: link.fields.kit_variant,
          url: assetUrl(asset),
          media_asset_id: asset.assetId,
          sort_order: link.fields.sort_order,
          created_at: now,
        };
      }),
  );

  const club = {
    id: clubId,
    slug: "lions",
    name: "Lions Football Club",
    lifecycle: "active",
    public_access: "live",
    tier: "pro",
    primary_color: "#1B2958",
    secondary_color: "#AD3234",
    accent_color: "#F0F0F0",
    // Lions E7: Christian wants a Store on the real site; store_enabled is
    // operator-only (Lions E1) and defaults false for new clubs, so it is
    // set explicitly here rather than relying on any backfill.
    store_enabled: true,
    created_at: now,
    updated_at: now,
    archived_at: null,
  };
  const players = LIONS_PLAYERS.map((player, index) => {
    const name = `${player.firstName} ${player.lastName}`;
    return {
      id: deterministicUuid(`onzio:lions:player:${player.mockupId}`),
      club_id: clubId,
      number: player.number,
      name,
      caption: player.number === 10 ? "C" : null,
      nationality: "American",
      position: positionLabel(player.position),
      height: player.height,
      weight: "",
      hometown: player.hometown,
      age: 19 + (index % 9),
      school: null,
      previous_club: null,
      photo_url: "",
      photo_asset_id: null,
      active: true,
      bio: `${player.firstName} brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.`,
      pronunciation: null,
      foot: index % 3 === 0 ? "Left" : "Right",
      created_at: now,
      updated_at: now,
    };
  });
  const playerSeasonStats = LIONS_PLAYERS.filter(
    (player) => player.position !== "GK",
  ).map((player) => ({
    club_id: clubId,
    player_id: deterministicUuid(`onzio:lions:player:${player.mockupId}`),
    season_id: currentSeasonId,
    goals: player.stats.goals,
    assists: player.stats.assists,
    tackles: 8 + player.number,
    starts: player.stats.starts,
    yellow: player.stats.yellowCards,
    red: player.stats.redCards,
    mins: player.stats.minutes,
    offsides: player.position === "FW" ? player.number % 4 : 0,
    fouls: player.number % 5,
    fouls_suffered: player.position === "MF" ? 3 + (player.number % 4) : player.number % 3,
    updated_at: now,
  }));
  const goalkeeperSeasonStats = LIONS_PLAYERS.filter(
    (player) => player.position === "GK",
  ).map((player) => ({
    club_id: clubId,
    player_id: deterministicUuid(`onzio:lions:player:${player.mockupId}`),
    season_id: currentSeasonId,
    goals_against: Math.max(0, player.stats.starts - 2),
    saves: player.stats.saves ?? 0,
    clean_sheets: player.stats.cleanSheets ?? 0,
    starts: player.stats.starts,
    yellow: player.stats.yellowCards,
    red: player.stats.redCards,
    mins: player.stats.minutes,
    updated_at: now,
  }));
  const staff = LIONS_STAFF.map((member) => ({
    id: deterministicUuid(`onzio:lions:staff:${member.mockupId}`),
    club_id: clubId,
    initials: member.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 3),
    name: member.name,
    role: member.role,
    hometown: "Columbus, OH",
    nationality: "American",
    bio: member.bio ?? null,
    photo_url: "",
    photo_asset_id: null,
    active: true,
    created_at: now,
    updated_at: now,
  }));
  const presentationConfiguration = parsePresentationDocument(
    LIONS_EDITORIAL_PRESENTATION_CONFIGURATION,
    { surface: "operator_preview" },
  );
  const presentationDigest = digestJson(presentationConfiguration);
  const tryoutOpenId = deterministicUuid(
    "onzio:lions:tryout:2026-academy-fall-id-days",
  );
  const tryoutUpcomingId = deterministicUuid(
    "onzio:lions:tryout:2026-fall-open-trial",
  );
  const tryoutClosedId = deterministicUuid(
    "onzio:lions:tryout:2026-u23-summer-id-camp",
  );

  return {
    club,
    domain: {
      id: LIONS_LOCAL_DOMAIN_ID,
      club_id: clubId,
      hostname: LIONS_LOCAL_HOSTNAME,
      is_primary: true,
      verified_at: now,
      environment: "staging",
      active: true,
      created_at: now,
      updated_at: now,
    },
    subscription: {
      club_id: clubId,
      stripe_customer_id: "cus_lions_local_only",
      stripe_subscription_id: "sub_lions_local_only",
      price_id: "price_lions_local_pro",
      tier: "pro",
      status: "active",
      cancel_at_period_end: false,
      paid_through: "2027-07-29T00:00:00.000Z",
      grace_ends_at: null,
      last_applied_stripe_event_id: "evt_lions_local_seed",
      last_applied_stripe_event_created_at: now,
      created_at: now,
      updated_at: now,
    },
    seasons: [
      {
        id: currentSeasonId,
        club_id: clubId,
        label: "2026 Season",
        start_year: 2026,
        end_year: 2026,
        active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: previousSeasonId,
        club_id: clubId,
        label: "2025 Season",
        start_year: 2025,
        end_year: 2025,
        active: false,
        created_at: now,
        updated_at: now,
      },
    ],
    matches: [
      {
        id: deterministicUuid("onzio:lions:match:2026:f07"),
        club_id: clubId,
        season_id: currentSeasonId,
        date: "2026-07-11",
        time: "19:00",
        opponent: "Scioto Valley FC",
        opponent_short_name: "SVFC",
        opponent_logo_url: "",
        opponent_logo_asset_id: null,
        competition: "Midwest Premier League",
        sponsor_name: null,
        sponsor_logo_url: null,
        sponsor_logo_asset_id: null,
        sponsor_link: null,
        home: true,
        venue: "Scioto Field",
        address: "1814 W Broad St",
        city: "Columbus",
        state: "OH",
        rose_city_score: 2,
        opponent_score: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: deterministicUuid("onzio:lions:match:2026:f08"),
        club_id: clubId,
        season_id: currentSeasonId,
        date: "2026-08-15",
        time: "19:00",
        opponent: "Capital City Athletic",
        opponent_short_name: "CCA",
        opponent_logo_url: "",
        opponent_logo_asset_id: null,
        competition: "Midwest Premier League",
        sponsor_name: null,
        sponsor_logo_url: null,
        sponsor_logo_asset_id: null,
        sponsor_link: null,
        home: true,
        venue: "Scioto Field",
        address: "1814 W Broad St",
        city: "Columbus",
        state: "OH",
        rose_city_score: null,
        opponent_score: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: deterministicUuid("onzio:lions:match:2026:f09"),
        club_id: clubId,
        season_id: currentSeasonId,
        date: "2026-08-22",
        time: "18:00",
        opponent: "Dayton Rovers SC",
        opponent_short_name: "DRSC",
        opponent_logo_url: "",
        opponent_logo_asset_id: null,
        competition: "Midwest Premier League",
        sponsor_name: null,
        sponsor_logo_url: null,
        sponsor_logo_asset_id: null,
        sponsor_link: null,
        home: false,
        venue: "Dayton Soccer Complex",
        address: "",
        city: "Dayton",
        state: "OH",
        rose_city_score: null,
        opponent_score: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: deterministicUuid("onzio:lions:match:2026:f10"),
        club_id: clubId,
        season_id: currentSeasonId,
        date: "2026-09-05",
        time: "19:00",
        opponent: "Queen City FC",
        opponent_short_name: "QCFC",
        opponent_logo_url: "",
        opponent_logo_asset_id: null,
        competition: "Midwest Premier League",
        sponsor_name: null,
        sponsor_logo_url: null,
        sponsor_logo_asset_id: null,
        sponsor_link: null,
        home: true,
        venue: "Scioto Field",
        address: "1814 W Broad St",
        city: "Columbus",
        state: "OH",
        rose_city_score: null,
        opponent_score: null,
        created_at: now,
        updated_at: now,
      },
    ],
    players,
    playerSeasonStats,
    goalkeeperSeasonStats,
    staff,
    presentationDocument: {
      id: LIONS_LOCAL_EDITORIAL_DOCUMENT_ID,
      club_id: clubId,
      version: 1,
      schema_version: 1,
      template_id: "editorial",
      template_version: 1,
      configuration: presentationConfiguration,
      configuration_digest: presentationDigest,
      created_by: LIONS_LOCAL_PRESENTATION_ACTOR_ID,
      created_at: now,
    },
    presentationState: {
      club_id: clubId,
      draft_document_id: null,
      published_document_id: LIONS_LOCAL_EDITORIAL_DOCUMENT_ID,
      updated_by: LIONS_LOCAL_PRESENTATION_ACTOR_ID,
      updated_at: now,
    },
    presentationPublication: {
      id: LIONS_LOCAL_EDITORIAL_PUBLICATION_ID,
      club_id: clubId,
      action: "publish",
      previous_document_id: null,
      next_document_id: LIONS_LOCAL_EDITORIAL_DOCUMENT_ID,
      next_configuration_digest: presentationDigest,
      validation_result: { valid: true, errors: [], warnings: [] },
      override_reason: null,
      created_by: LIONS_LOCAL_PRESENTATION_ACTOR_ID,
      created_at: now,
    },
    mediaAssets,
    siteBranding: {
      club_id: clubId,
      club_logo_path: assetUrl(crest),
      club_logo_asset_id: primaryLogoLink.club_logo_asset_id,
      inverse_logo_path: assetUrl(whiteCrest),
      inverse_logo_asset_id: inverseLogoLink.inverse_logo_asset_id,
      updated_at: now,
    },
    homepageHeroContent: {
      club_id: clubId,
      eyebrow: "",
      headline_line_one: "Capital City.",
      headline_line_two: "Roar as One.",
      intro:
        "Columbus-built football, carried by a club that plays for the city and every supporter behind it.",
      primary_cta_label: "Next match",
      primary_cta_href: "/schedule",
      secondary_cta_label: "Meet the squad",
      secondary_cta_href: "/roster",
      updated_at: now,
    },
    homepageSlideshowSettings: {
      club_id: clubId,
      season_label: "Lions FC Matchday",
      updated_at: now,
    },
    homepageSlideshowPhotos: slideshowPhotos,
    shopKitSections: [
      {
        id: deterministicUuid("onzio:lions:shop-kit-section:shop:home"),
        club_id: clubId,
        surface: "shop",
        kit_variant: "home",
        eyebrow: "Home Kit",
        title: "Blue Jersey",
        description:
          "The navy Lions home jersey brings Columbus matchday energy into a clean, supporter-ready presentation.",
        bullet_points: [
          "Transparent product media",
          "Navy first-team colorway",
          "Local-only import preview",
        ],
        store_note: "Local LionsFC media import preview.",
        cta_label: "Shop Home Kit",
        cta_link: "https://lionsfc.example/shop",
        updated_at: now,
      },
      {
        id: deterministicUuid("onzio:lions:shop-kit-section:shop:third"),
        club_id: clubId,
        surface: "shop",
        kit_variant: "third",
        eyebrow: "Third Kit",
        title: "Red Jersey",
        description:
          "The red Lions third jersey brings the club accent color into the full matchday collection.",
        bullet_points: [
          "Transparent product media",
          "Red third-kit colorway",
          "Mapped from the public Lions mockup source asset",
        ],
        store_note: "Local LionsFC media import preview.",
        cta_label: "Shop Third Kit",
        cta_link: "https://lionsfc.example/shop",
        updated_at: now,
      },
      {
        id: deterministicUuid("onzio:lions:shop-kit-section:shop:away"),
        club_id: clubId,
        surface: "shop",
        kit_variant: "away",
        eyebrow: "Away Kit",
        title: "White Jersey",
        description:
          "The white Lions away jersey keeps the crest prominent while giving the shop a second kit variant to render.",
        bullet_points: [
          "Transparent product media",
          "White away colorway",
          "Mapped from Christian's organized Jersey folder",
        ],
        store_note: "Local LionsFC media import preview.",
        cta_label: "Shop Away Kit",
        cta_link: "https://lionsfc.example/shop",
        updated_at: now,
      },
    ],
    shopKitPhotos,
    shopCarouselPhotos,
    shopPurchaseDetails: {
      club_id: clubId,
      heading: "Lions FC Shop",
      cards: [
        {
          label: "Local preview",
          title: "Media import only",
          body: "These rows prove local media linkage before any hosted import.",
        },
      ],
      cta_eyebrow: "Lions FC",
      cta_text: "Local-only shop media preview.",
      cta_label: "Contact Onzio",
      cta_link: "https://onziofutbol.com",
      updated_at: now,
    },
    aboutPageContent: {
      club_id: clubId,
      hero_title: "A club shaped by Columbus.",
      story_paragraphs: [
        "Lions Football Club was founded to give Columbus a club that competes with ambition and belongs to its community. From Scioto Field to every neighborhood training ground, we wear the badge for the Capital City with purpose.",
        "Our first team, U23s, and academy share one pathway: local players, brave soccer, and standards that travel beyond matchday. One pathway, one badge, one city behind it.",
      ],
      feature_image_url: assetUrl(firstSlideshowImage),
      feature_image_asset_id: firstSlideshowImage.assetId,
      values_heading: "What defines us",
      values: [
        {
          title: "2025 Ohio Valley Division Champions",
          description: "A winning standard for the Capital City.",
        },
        {
          title: "Three connected player pathways",
          description: "First team, U23s, and academy moving as one club.",
        },
        {
          title: "Columbus-owned and community-backed",
          description: "Built for local players and supporters.",
        },
      ],
      closing_text: "Roar as one for Columbus.",
      closing_cta_label: "Our story",
      closing_cta_href: "/club/about",
      updated_at: now,
    },
    siteSponsorLogos: [
      "Highbank Credit Union",
      "Short North Roasters",
      "Olentangy Physical Therapy",
      "Franklinton Works",
      "Columbus Transit Co.",
      "Midwest Supply",
    ].map((name, index) => ({
      id: deterministicUuid(`onzio:lions:sponsor:${name}`),
      club_id: clubId,
      placement: index < 3 ? "carousel" : "footer",
      name,
      logo_url: "",
      media_asset_id: null,
      sort_order: index,
      created_at: now,
    })),
    siteSocialLinks: [
      {
        club_id: clubId,
        id: "instagram",
        label: "Instagram",
        href: "https://www.instagram.com/columbuslionsfc",
        icon: "/icons/instagram.svg",
        sort_order: 0,
        updated_at: now,
      },
      {
        club_id: clubId,
        id: "youtube",
        label: "YouTube",
        href: "https://www.youtube.com/@lionsfootballclub-q3p",
        icon: "/icons/youtube.svg",
        sort_order: 1,
        updated_at: now,
      },
    ],
    // Lions E7: club_identity (Lions E1) content for the editorial@1 pages
    // built in E3-E6. founded_year/league/division/venue/city/state are kept
    // consistent with the fixtures already elsewhere in this file: the
    // "2025 Ohio Valley Division Champions" highlight on aboutPageContent,
    // the "Midwest Premier League" competition and "Scioto Field" venue on
    // the seeded matches, and the "1814 W Broad St" match address.
    clubIdentity: {
      club_id: clubId,
      short_name: "Lions FC",
      initials: "LFC",
      founded_year: 2015,
      league: "Midwest Premier League",
      division: "Ohio Valley Division",
      city: "Columbus",
      state: "OH",
      venue: "Scioto Field",
      time_zone: "America/New_York",
      contact_address: "1814 W Broad St, Columbus, OH 43222",
      slideshow_heading_top: "This is how",
      slideshow_heading_em: "Columbus roars.",
      identity_heading_top: "One badge,",
      identity_heading_em: "every neighborhood.",
      story_heading_top: "Built by Columbus,",
      story_heading_em: "for Columbus.",
      mission:
        "To give Columbus a club that competes with ambition, develops local talent through one connected pathway, and belongs to the community it represents.",
      highlights: [
        "2025 Ohio Valley Division Champions",
        "Three connected player pathways: first team, U23s, academy",
        "Columbus-owned and community-backed since 2015",
      ],
      updated_at: now,
    },
    contactProfile: {
      club_id: clubId,
      public_email: "columbuslionsfc@gmail.com",
      public_phone: "(614) 555-0142",
      service_area: "Columbus, Ohio",
      hours: "Mon-Fri, 9am-5pm ET",
      updated_at: now,
    },
    contactPageContent: {
      club_id: clubId,
      eyebrow: "Contact Us",
      headline: "Reach out. We're here for Columbus.",
      intro:
        "Questions about tryouts, tickets, partnerships, or Lions FC in general? Reach us directly by email, phone, or social media below.",
      hero_media_asset_id: null,
      updated_at: now,
    },
    // Lions E7: three tryouts rows exercising all three onzio.tryouts
    // statuses that mapTryout (lib/queries.ts, built against for E5)
    // resolves into distinct public states -- upcoming (falls back to the
    // mailto contact action above since no registration link is set yet),
    // open with a real registration link, and closed with a closed_message.
    // None reference a program (Lions has no onzio.programs rows) or a hero
    // media asset.
    tryouts: [
      {
        id: tryoutUpcomingId,
        club_id: clubId,
        program_id: null,
        status: "upcoming",
        eyebrow: "First Team",
        headline: "Fall Open Trial",
        intro:
          "An open evaluation session for the Lions FC first team ahead of the fall slate.",
        hero_media_asset_id: null,
        eligibility_copy:
          "Open to players 18 and older with prior competitive or collegiate experience.",
        what_to_expect_copy:
          "Small-sided games, technical drills, and a scrimmage in front of First Team and U23 staff.",
        preparation_copy:
          "Bring boots, shin guards, and both a light and dark training top.",
        event_date: "2026-09-19",
        location: "Scioto Field, Columbus, OH",
        cost_text: "$25 registration fee, due at check-in",
        cta_label: "",
        registration_href: "",
        closed_message: "",
        sort_order: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: tryoutOpenId,
        club_id: clubId,
        program_id: null,
        status: "open",
        eyebrow: "Academy",
        headline: "Academy Fall Identification Days",
        intro:
          "Two identification sessions for players ages 12-17 interested in the Lions FC academy pathway.",
        hero_media_asset_id: null,
        eligibility_copy: "Open to players ages 12-17 living in or near Columbus.",
        what_to_expect_copy:
          "Positional drills and small-sided play evaluated by academy coaching staff.",
        preparation_copy:
          "Arrive 30 minutes early to check in and complete a waiver.",
        event_date: "2026-08-30",
        location: "Scioto Field, Columbus, OH",
        cost_text: "$15 registration fee",
        cta_label: "Register Now",
        registration_href: "https://forms.gle/lionsfc-academy-tryouts",
        closed_message: "",
        sort_order: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: tryoutClosedId,
        club_id: clubId,
        program_id: null,
        status: "closed",
        eyebrow: "U23",
        headline: "U23 Summer Identification Camp",
        intro:
          "Summer identification camp for the Lions FC U23 developmental roster.",
        hero_media_asset_id: null,
        eligibility_copy: "Open to players ages 18-23 with prior competitive experience.",
        what_to_expect_copy:
          "Full-field scrimmages evaluated by U23 coaching staff.",
        preparation_copy: "Boots, shin guards, and both training kits required.",
        event_date: "2026-07-12",
        location: "Scioto Field, Columbus, OH",
        cost_text: "$20 registration fee",
        cta_label: "",
        registration_href: "",
        closed_message:
          "Registration for this session has closed. Check back for the next U23 identification camp.",
        sort_order: 2,
        created_at: now,
        updated_at: now,
      },
    ],
    tryoutsPageContent: {
      club_id: clubId,
      intro_with_tryouts:
        "Review upcoming Lions FC tryout dates below. Registration, waivers, and participant information stay with the club's external provider.",
      intro_no_tryouts:
        "Lions FC tryout dates are still being finalized for this season. Check back soon or contact the club to stay informed.",
      updated_at: now,
    },
    auditEvent: {
      club_id: clubId,
      actor_user_id: null,
      actor_type: "migration",
      operation: "lions_media_local_import",
      resource_type: "club",
      resource_id: clubId,
      payload: {
        plan_digest: plan.planDigest,
        source_digest: digest(
          plan.assets
            .map((asset) => `${asset.sourcePath}:${asset.sourceChecksumSha256}`)
            .sort()
            .join("\n"),
        ),
        media_assets: plan.assets.length,
      },
    },
  };
}

export function reconcileLionsLocalImportPlan(
  plan: LionsMediaImportPlan,
  rows: LionsLocalImportRows = buildLionsLocalImportRows(plan),
): LionsLocalImportReconciliation {
  assertPlanSafeForLocalImport(plan);
  const serializedRows = JSON.stringify(rows);
  const forbiddenSupabaseTransformPath = ["/storage/v1", "render/image"].join("/");
  if (
    serializedRows.includes("ydvggllbrswfchgjhjhr") ||
    serializedRows.includes(forbiddenSupabaseTransformPath) ||
    serializedRows.includes("/_next/image")
  ) {
    throw new Error("Imported Lions content rows contain forbidden source or transform URLs.");
  }
  const relationshipAssetIds = new Set(rows.mediaAssets.map((asset) => asset.id));
  const linkedAssetIds = [
    rows.siteBranding.club_logo_asset_id,
    rows.siteBranding.inverse_logo_asset_id,
    rows.aboutPageContent.feature_image_asset_id,
    ...rows.homepageSlideshowPhotos.map((photo) => photo.media_asset_id),
    ...rows.shopKitPhotos.map((photo) => photo.media_asset_id),
    ...rows.shopCarouselPhotos.map((photo) => photo.media_asset_id),
  ];
  for (const assetId of linkedAssetIds) {
    if (!relationshipAssetIds.has(assetId)) {
      throw new Error(`Lions content references missing media asset ${String(assetId)}.`);
    }
  }

  return {
    tenantId: plan.destination.tenantId,
    assetCount: plan.assets.length,
    mediaAssetCount: rows.mediaAssets.length,
    homepageHeroContentCount: rows.homepageHeroContent ? 1 : 0,
    homepageSlideshowPhotoCount: rows.homepageSlideshowPhotos.length,
    shopKitPhotoCount: rows.shopKitPhotos.length,
    shopCarouselPhotoCount: rows.shopCarouselPhotos.length,
    matchCount: rows.matches.length,
    playerCount: rows.players.length,
    playerSeasonStatsCount: rows.playerSeasonStats.length,
    goalkeeperSeasonStatsCount: rows.goalkeeperSeasonStats.length,
    staffCount: rows.staff.length,
    presentationDocumentCount: rows.presentationDocument ? 1 : 0,
    presentationStateCount: rows.presentationState ? 1 : 0,
    presentationPublicationCount: rows.presentationPublication ? 1 : 0,
    sponsorLogoCount: rows.siteSponsorLogos.length,
    clubIdentityCount: rows.clubIdentity ? 1 : 0,
    contactProfileCount: rows.contactProfile ? 1 : 0,
    contactPageContentCount: rows.contactPageContent ? 1 : 0,
    tryoutCount: rows.tryouts.length,
    tryoutsPageContentCount: rows.tryoutsPageContent ? 1 : 0,
    readyContentLinkCount: plan.summary.readyContentLinkCount,
    blockedContentLinkCount: plan.summary.blockedContentLinkCount,
    sourceChecksumCount: new Set(
      plan.assets.map((asset) => asset.sourceChecksumSha256),
    ).size,
    normalizedChecksumCount: new Set(
      plan.assets.map((asset) => asset.normalizedChecksumSha256),
    ).size,
    relationshipCount: linkedAssetIds.length,
    oldSourceUrlReferences: 0,
    hostedMutations: 0,
  };
}
