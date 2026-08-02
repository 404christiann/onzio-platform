import { createHash } from "node:crypto";
import {
  DIVERSE_CITY_LOCAL_TENANT_ID,
  type DiverseCityImportPlan,
  type DiverseCityKnownAssetPath,
  type DiverseCityPlannedAsset,
} from "@/lib/migration/diverse-city-plan";
import { deterministicUuid } from "@/lib/migration/rose-city-plan";
import { parsePresentationDocument } from "@/packages/presentation";

export const DIVERSE_CITY_LOCAL_HOSTNAME = "diverse-city.localhost";
export const DIVERSE_CITY_LOCAL_DOMAIN_ID = deterministicUuid(
  `onzio:domain:${DIVERSE_CITY_LOCAL_HOSTNAME}`,
);
export const DIVERSE_CITY_LOCAL_PRESENTATION_DOCUMENT_ID = deterministicUuid(
  "onzio:diverse-city:presentation:academy@1:published",
);
export const DIVERSE_CITY_LOCAL_PRESENTATION_PUBLICATION_ID = deterministicUuid(
  "onzio:diverse-city:presentation-publication:academy@1:published",
);
export const DIVERSE_CITY_LOCAL_PRESENTATION_ACTOR_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

type SourceRow = Record<string, unknown>;

export type DiverseCityLocalImportRows = {
  club: SourceRow;
  domain: SourceRow;
  subscription: SourceRow;
  localMember: SourceRow;
  seasons: SourceRow[];
  players: SourceRow[];
  staff: SourceRow[];
  matches: SourceRow[];
  leagueStandings: SourceRow[];
  tryouts: SourceRow[];
  presentationDocument: SourceRow;
  presentationState: SourceRow;
  presentationPublication: SourceRow;
  mediaAssets: SourceRow[];
  siteBranding: SourceRow;
  homepageHeroContent: SourceRow;
  behindTheRoseSection: SourceRow;
  aboutPageContent: SourceRow;
  programs: SourceRow[];
  contactProfile: SourceRow;
  contactPageContent: SourceRow;
  shopKitSections: SourceRow[];
  shopKitPhotos: SourceRow[];
  shopCarouselPhotos: SourceRow[];
  shopPurchaseDetails: SourceRow;
  siteSponsorLogos: SourceRow[];
  siteSocialLinks: SourceRow[];
  auditEvent: SourceRow;
};

export type DiverseCityLocalImportReconciliation = {
  tenantId: string;
  assetCount: number;
  mediaAssetCount: number;
  programCount: number;
  tryoutCount: number;
  playerCount: number;
  staffCount: number;
  matchCount: number;
  standingsCount: number;
  sponsorLogoCount: number;
  shopKitPhotoCount: number;
  shopCarouselPhotoCount: number;
  presentationDocumentCount: number;
  sourceChecksumCount: number;
  relationshipCount: number;
  forbiddenReferenceCount: 0;
  hostedMutations: 0;
};

const FIXED_TIMESTAMP = "2026-08-01T00:00:00.000Z";
const ACTIVE_SEASON_ID = deterministicUuid("onzio:diverse-city:season:2026");

const ACADEMY_PRESENTATION_CONFIGURATION = {
  schemaVersion: 1,
  template: { id: "academy", version: 1 },
  fontPack: "montserrat-inter-dmsans",
  theme: {
    surface: {
      canvas: "#1E3653",
      elevated: "#F9FAFD",
      subtle: "#B9E3F6",
      inverse: "#F9FAFD",
    },
    text: {
      primary: "#F9FAFD",
      secondary: "#B9E3F6",
      muted: "#51667E",
      inverse: "#1E3653",
    },
    action: {
      primary: "#FF1616",
      primaryHover: "#D70000",
      primaryText: "#FFFFFF",
      secondary: "#B9E3F6",
    },
    border: { subtle: "#51667E", strong: "#F9FAFD" },
    status: {
      success: "#12A140",
      warning: "#D69E2E",
      danger: "#FF1616",
    },
    accent: { one: "#FF1616", two: "#B9E3F6" },
  },
  modules: {
    roster: true,
    schedule: true,
    store: true,
    sponsors: true,
    standings: true,
    programs: true,
    tryouts: true,
    contact: true,
    affiliations: false,
  },
  homepage: {
    sections: [
      { id: "hero-main", type: "academy.hero", enabled: true, emptyBehavior: "hide", config: {} },
      { id: "kit-feature", type: "academy.kit-feature", enabled: true, emptyBehavior: "hide", config: {} },
      { id: "next-match", type: "shared.next-match", enabled: false, emptyBehavior: "hide", config: {} },
      { id: "club-story", type: "shared.history", enabled: false, emptyBehavior: "hide", config: {} },
      { id: "partners", type: "academy.partners", enabled: true, emptyBehavior: "hide", config: {} },
      { id: "standings", type: "academy.standings", enabled: false, emptyBehavior: "hide", config: {} },
      { id: "programs-pathway", type: "academy.programs-pathway", enabled: true, emptyBehavior: "hide", config: {} },
    ],
  },
  navigation: {
    groups: [
      {
        id: "main",
        label: null,
        routes: ["home", "roster", "schedule", "club", "programs", "store", "sponsors", "tryouts", "contact"],
      },
    ],
  },
  metadata: {
    recommendationId: null,
    createdBy: DIVERSE_CITY_LOCAL_PRESENTATION_ACTOR_ID,
    createdAt: FIXED_TIMESTAMP,
    sourceArtifact: "diverse-city-fc:5bbdfa3",
  },
} as const;

function digestJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertSafePlan(plan: DiverseCityImportPlan) {
  if (
    plan.kind !== "diverse-city-local-import-plan" ||
    plan.formatVersion !== 1 ||
    plan.dryRunOnly !== true ||
    plan.destination.environment !== "local" ||
    plan.destination.tenantId !== DIVERSE_CITY_LOCAL_TENANT_ID ||
    plan.destination.hostedMutations !== 0 ||
    plan.approval.rightsAndCurrentFactsConfirmed !== true
  ) {
    throw new Error("Unexpected Diverse City plan for local import.");
  }
  const serialized = JSON.stringify(plan);
  if (
    /storage\/v1\/render\/image|\/_next\/image|google\.com|\.mp4|sb_secret_|service_role/i.test(
      serialized,
    )
  ) {
    throw new Error("Diverse City plan contains a forbidden reference.");
  }
}

function assetByPath(
  plan: DiverseCityImportPlan,
  path: DiverseCityKnownAssetPath,
): DiverseCityPlannedAsset {
  const asset = plan.assets.find((candidate) => candidate.sourcePath === path);
  if (!asset) throw new Error(`Diverse City plan is missing ${path}.`);
  return asset;
}

function mediaRow(asset: DiverseCityPlannedAsset): SourceRow {
  return {
    id: asset.assetId,
    club_id: DIVERSE_CITY_LOCAL_TENANT_ID,
    storage_bucket: asset.destinationBucket,
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
    created_at: FIXED_TIMESTAMP,
    published_at: FIXED_TIMESTAMP,
    deleted_at: null,
  };
}

export function buildDiverseCityLocalImportRows(
  plan: DiverseCityImportPlan,
): DiverseCityLocalImportRows {
  assertSafePlan(plan);
  const clubId = DIVERSE_CITY_LOCAL_TENANT_ID;
  const crest = assetByPath(plan, "media/crest.png");
  const about = assetByPath(plan, "media/about-team-lineup.webp");
  const youth = assetByPath(plan, "media/hero.webp");
  const kickers = assetByPath(plan, "media/programs/special-kickers-hero.webp");
  const olympics = assetByPath(plan, "media/programs/special-olympics-hero.webp");
  const mensHero = assetByPath(plan, "media/programs/mens-teams-hero.webp");
  const mensDetail = assetByPath(plan, "media/programs/mens-teams-detail.webp");
  const jerseyFront = assetByPath(plan, "media/shop/front_jersey.png");
  const jerseyBack = assetByPath(plan, "media/shop/back_jersey.png");
  const elsa = assetByPath(plan, "media/sponsors/elsas-bakery.webp");
  const presentation = parsePresentationDocument(
    ACADEMY_PRESENTATION_CONFIGURATION,
    { surface: "operator_preview" },
  );
  const presentationDigest = digestJson(presentation);

  const programDefinitions = [
    {
      slug: "youth-academy",
      nav_label: "Youth Academy",
      display_title: "Building Future Champions",
      kicker: "Build the foundation",
      summary: "Competitive player development for aspiring young athletes.",
      body: "Competitive player development for aspiring young athletes. Structured coaching, mentorship, and meaningful competition help players build strong technical foundations and prepare for the next level.",
      highlights: ["Competitive player development", "Structured coaching and mentorship", "Preparation for the next level"],
      layout_variant: "statement_band",
      hero_media_asset_id: youth.assetId,
      detail_media_asset_id: null,
    },
    {
      slug: "special-kickers-program",
      nav_label: "Special Kickers",
      display_title: "Play, Learn, Thrive",
      kicker: "A place for every athlete",
      summary: "An encouraging soccer environment for confidence, communication, motor skills, and teamwork.",
      body: "Soccer programming designed specifically for children and young adults with autism and other developmental disabilities, creating an encouraging environment for confidence, communication, motor skills, and teamwork.",
      highlights: ["Programming for autism and developmental disabilities", "Confidence and communication", "Motor skills and teamwork"],
      layout_variant: "statement_band",
      hero_media_asset_id: kickers.assetId,
      detail_media_asset_id: null,
    },
    {
      slug: "special-olympics-soccer",
      nav_label: "Special Olympics",
      display_title: "Empowering Athletes",
      kicker: "Train, compete, belong",
      summary: "Training and competition opportunities for athletes with intellectual disabilities.",
      body: "Training and competition opportunities for athletes with intellectual disabilities. Players experience the joy of competition while developing confidence, sportsmanship, teamwork, and lifelong skills.",
      highlights: ["Training and competition", "Confidence and sportsmanship", "Teamwork and lifelong skills"],
      layout_variant: "statement_band",
      hero_media_asset_id: olympics.assetId,
      detail_media_asset_id: null,
    },
    {
      slug: "upsl-mens-teams",
      nav_label: "Men's Teams",
      display_title: "Development without limits.",
      kicker: "The next competitive step",
      summary: "High-level amateur and pro-development teams with collegiate and professional pathways.",
      body: "High-level amateur and pro-development teams providing a pathway toward collegiate, semi-professional, and professional soccer in an environment built around discipline, opportunity, and continuous development.",
      highlights: ["High-level amateur competition", "Collegiate and professional pathways", "Discipline and continuous development"],
      layout_variant: "detail_focus",
      hero_media_asset_id: mensHero.assetId,
      detail_media_asset_id: mensDetail.assetId,
    },
  ] as const;

  const programs = programDefinitions.map((program, index) => ({
    id: deterministicUuid(`onzio:diverse-city:program:${program.slug}`),
    club_id: clubId,
    ...program,
    external_cta_label: "",
    external_cta_href: "",
    status: "active",
    sort_order: index,
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP,
  }));

  const shopKitPhotos = (["home", "shop"] as const).flatMap((surface) =>
    [jerseyFront, jerseyBack].map((asset, index) => ({
      id: deterministicUuid(`onzio:diverse-city:shop-kit-photo:${surface}:${asset.assetId}`),
      club_id: clubId,
      surface,
      kit_variant: "home",
      url: asset.destinationPath,
      media_asset_id: asset.assetId,
      sort_order: index,
      created_at: FIXED_TIMESTAMP,
    })),
  );

  return {
    club: {
      id: clubId,
      slug: "diverse-city",
      name: "Diverse City FC",
      lifecycle: "active",
      public_access: "live",
      tier: "pro",
      primary_color: "#1E3653",
      secondary_color: "#FF1616",
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
      archived_at: null,
    },
    domain: {
      id: DIVERSE_CITY_LOCAL_DOMAIN_ID,
      club_id: clubId,
      hostname: DIVERSE_CITY_LOCAL_HOSTNAME,
      is_primary: true,
      verified_at: FIXED_TIMESTAMP,
      environment: "staging",
      active: true,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    },
    subscription: {
      club_id: clubId,
      stripe_customer_id: "cus_diverse_city_local_only",
      stripe_subscription_id: "sub_diverse_city_local_only",
      price_id: "price_diverse_city_local_pro",
      tier: "pro",
      status: "active",
      cancel_at_period_end: false,
      paid_through: "2027-08-01T00:00:00.000Z",
      grace_ends_at: null,
      last_applied_stripe_event_id: "evt_diverse_city_local_seed",
      last_applied_stripe_event_created_at: FIXED_TIMESTAMP,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    },
    localMember: {
      user_id: DIVERSE_CITY_LOCAL_PRESENTATION_ACTOR_ID,
      club_id: clubId,
      role: "owner",
      status: "active",
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
      removed_at: null,
    },
    seasons: [{
      id: ACTIVE_SEASON_ID,
      club_id: clubId,
      label: "Current",
      start_year: 2026,
      end_year: 2026,
      active: true,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    }],
    players: [],
    staff: [],
    matches: [],
    leagueStandings: [],
    tryouts: [],
    presentationDocument: {
      id: DIVERSE_CITY_LOCAL_PRESENTATION_DOCUMENT_ID,
      club_id: clubId,
      version: 1,
      schema_version: 1,
      template_id: "academy",
      template_version: 1,
      configuration: presentation,
      configuration_digest: presentationDigest,
      created_by: DIVERSE_CITY_LOCAL_PRESENTATION_ACTOR_ID,
      created_at: FIXED_TIMESTAMP,
    },
    presentationState: {
      club_id: clubId,
      draft_document_id: null,
      published_document_id: DIVERSE_CITY_LOCAL_PRESENTATION_DOCUMENT_ID,
      updated_by: DIVERSE_CITY_LOCAL_PRESENTATION_ACTOR_ID,
      updated_at: FIXED_TIMESTAMP,
    },
    presentationPublication: {
      id: DIVERSE_CITY_LOCAL_PRESENTATION_PUBLICATION_ID,
      club_id: clubId,
      action: "publish",
      previous_document_id: null,
      next_document_id: DIVERSE_CITY_LOCAL_PRESENTATION_DOCUMENT_ID,
      next_configuration_digest: presentationDigest,
      validation_result: { valid: true, errors: [], warnings: [] },
      override_reason: null,
      created_by: DIVERSE_CITY_LOCAL_PRESENTATION_ACTOR_ID,
      created_at: FIXED_TIMESTAMP,
    },
    mediaAssets: plan.assets.map(mediaRow),
    siteBranding: {
      club_id: clubId,
      club_logo_path: crest.destinationPath,
      club_logo_asset_id: crest.assetId,
      updated_at: FIXED_TIMESTAMP,
    },
    homepageHeroContent: {
      club_id: clubId,
      eyebrow: "",
      headline_line_one: "One Club",
      headline_line_two: "One Community",
      intro: "An inclusive, community-driven soccer club and pro academy developing players of all abilities while creating opportunities on and off the field.",
      primary_cta_label: "Explore Our Programs",
      primary_cta_href: "/programs",
      secondary_cta_label: "Discover the Club",
      secondary_cta_href: "/club/about",
      updated_at: FIXED_TIMESTAMP,
    },
    behindTheRoseSection: {
      club_id: clubId,
      visible: false,
      eyebrow: "",
      title: "",
      description: "",
      video_url: "",
      video_title: "",
      caption: "",
      updated_at: FIXED_TIMESTAMP,
    },
    aboutPageContent: {
      club_id: clubId,
      hero_title: "About Club",
      story_paragraphs: [
        "Diverse City FC is an inclusive, community-driven soccer club and pro academy serving the Chicago area. Founded in 2022 by former MLS Chicago Fire Academy player Giovanni Sanchez, the club develops players of all abilities while creating opportunities on and off the field.",
        "Based primarily in Schaumburg, Diverse City FC removes barriers to participation through high-quality coaching, competitive opportunities, and an environment where athletes of every background and ability can thrive. The club is especially committed to neurodiverse athletes and players with intellectual disabilities.",
        "From youth development to the UPSL Midwest Central Conference, the club provides a clear pathway toward collegiate, semi-professional, and professional soccer. Conference championships and national-stage appearances support a larger vision: becoming one of the nation’s leading inclusive soccer organizations.",
      ],
      feature_image_url: about.destinationPath,
      feature_image_asset_id: about.assetId,
      values_heading: "Our Values",
      values: [
        { title: "Inclusion", description: "Every athlete deserves a meaningful place in the game, regardless of ability or background." },
        { title: "Development", description: "Professional coaching, mentorship, and competition strengthen both the player and the person." },
        { title: "Community", description: "Soccer brings players, families, schools, and local organizations together through shared opportunity." },
      ],
      closing_text: "See Diverse City FC in action this season.",
      closing_cta_label: "See the Schedule",
      closing_cta_href: "/schedule",
      updated_at: FIXED_TIMESTAMP,
    },
    programs,
    contactProfile: {
      club_id: clubId,
      public_email: "diverse.cityfc@gmail.com",
      public_phone: "(312) 731-9479",
      service_area: "Schaumburg, Illinois",
      hours: "",
      updated_at: FIXED_TIMESTAMP,
    },
    contactPageContent: {
      club_id: clubId,
      eyebrow: "Contact Us",
      headline: "Reach out. We're here for you.",
      intro: "Questions about programs, partnerships, or Diverse City FC in general? Reach us directly by email, phone, or social media below.",
      hero_media_asset_id: null,
      updated_at: FIXED_TIMESTAMP,
    },
    shopKitSections: (["home", "shop"] as const).map((surface) => ({
      id: deterministicUuid(`onzio:diverse-city:shop-kit-section:${surface}:home`),
      club_id: clubId,
      surface,
      kit_variant: "home",
      eyebrow: surface === "home" ? "Sky Blue" : "Official Club Store",
      title: "Diverse City FC Match Jersey",
      description: "The official sky blue match jersey featuring the Diverse City FC crest, academy detailing, and the club's signature inclusive identity.",
      bullet_points: ["Available item: Match Jersey", "Sizing and price: Contact the club"],
      store_note: "Ask the club about current availability, sizing, customization, and ordering details.",
      cta_label: surface === "home" ? "View the Club Store" : "Contact the Club to Order",
      cta_link: surface === "home" ? "/shop" : "mailto:diverse.cityfc@gmail.com?subject=Diverse%20City%20FC%20Jersey%20Order",
      updated_at: FIXED_TIMESTAMP,
    })),
    shopKitPhotos,
    shopCarouselPhotos: [jerseyFront, jerseyBack].map((asset, index) => ({
      id: deterministicUuid(`onzio:diverse-city:shop-carousel-photo:${asset.assetId}`),
      club_id: clubId,
      kit_variant: "home",
      url: asset.destinationPath,
      media_asset_id: asset.assetId,
      sort_order: index,
      created_at: FIXED_TIMESTAMP,
    })),
    shopPurchaseDetails: {
      club_id: clubId,
      heading: "Purchase Details",
      cards: [
        { label: "Available Item", title: "Match Jersey", body: "The official Diverse City FC sky blue match jersey." },
        { label: "Sizing and Price", title: "Contact the club", body: "Ask the club for current availability, sizing, customization, price, and ordering details." },
      ],
      cta_eyebrow: "Ready to Order",
      cta_text: "Ordering stays directly with Diverse City FC.",
      cta_label: "Contact the Club to Order",
      cta_link: "mailto:diverse.cityfc@gmail.com?subject=Diverse%20City%20FC%20Jersey%20Order",
      updated_at: FIXED_TIMESTAMP,
    },
    siteSponsorLogos: (["carousel", "footer"] as const).map((placement) => ({
      id: deterministicUuid(`onzio:diverse-city:sponsor:elsas-bakery:${placement}`),
      club_id: clubId,
      placement,
      name: "Elsa's Bakery",
      logo_url: elsa.destinationPath,
      media_asset_id: elsa.assetId,
      sort_order: 0,
      created_at: FIXED_TIMESTAMP,
    })),
    siteSocialLinks: [
      { id: "instagram", label: "Instagram", href: "https://www.instagram.com/diversecity_fc/?hl=en", icon: "/images/logo/instagramLogo.svg" },
      { id: "facebook", label: "Facebook", href: "https://www.facebook.com/p/Diverse-City-FC-100083085652794/", icon: "/images/logo/facebookLogo.svg" },
      { id: "x", label: "X", href: "https://x.com/diversecityfc22", icon: "/images/logo/xLogo.svg" },
    ].map((row, index) => ({
      club_id: clubId,
      ...row,
      sort_order: index,
      updated_at: FIXED_TIMESTAMP,
    })),
    auditEvent: {
      club_id: clubId,
      actor_user_id: null,
      actor_type: "migration",
      operation: "diverse_city_local_import",
      resource_type: "club",
      resource_id: clubId,
      payload: {
        plan_digest: plan.planDigest,
        retained_assets: plan.assets.length,
        hosted_mutations: 0,
      },
    },
  };
}

export function reconcileDiverseCityLocalImportPlan(
  plan: DiverseCityImportPlan,
  rows: DiverseCityLocalImportRows = buildDiverseCityLocalImportRows(plan),
): DiverseCityLocalImportReconciliation {
  assertSafePlan(plan);
  const mediaIds = new Set(rows.mediaAssets.map((row) => row.id));
  const relationships = [
    rows.siteBranding.club_logo_asset_id,
    rows.aboutPageContent.feature_image_asset_id,
    ...rows.programs.flatMap((row) => [row.hero_media_asset_id, row.detail_media_asset_id]).filter(Boolean),
    ...rows.shopKitPhotos.map((row) => row.media_asset_id),
    ...rows.shopCarouselPhotos.map((row) => row.media_asset_id),
    ...rows.siteSponsorLogos.map((row) => row.media_asset_id),
  ];
  for (const relationship of relationships) {
    if (!mediaIds.has(relationship)) {
      throw new Error(`Diverse City content references missing media asset ${String(relationship)}.`);
    }
  }
  const serialized = JSON.stringify(rows);
  const forbidden = serialized.match(
    /storage\/v1\/render\/image|\/_next\/image|google\.com|\.mp4|Player 0|Opponent TBA|Date TBA|Sponsor opportunity|Pasadena|Niky's/gi,
  );
  if (forbidden) {
    throw new Error(`Diverse City rows contain forbidden references: ${forbidden.join(", ")}`);
  }
  return {
    tenantId: DIVERSE_CITY_LOCAL_TENANT_ID,
    assetCount: plan.assets.length,
    mediaAssetCount: rows.mediaAssets.length,
    programCount: rows.programs.length,
    tryoutCount: rows.tryouts.length,
    playerCount: rows.players.length,
    staffCount: rows.staff.length,
    matchCount: rows.matches.length,
    standingsCount: rows.leagueStandings.length,
    sponsorLogoCount: rows.siteSponsorLogos.length,
    shopKitPhotoCount: rows.shopKitPhotos.length,
    shopCarouselPhotoCount: rows.shopCarouselPhotos.length,
    presentationDocumentCount: rows.presentationDocument ? 1 : 0,
    sourceChecksumCount: new Set(plan.assets.map((asset) => asset.sourceChecksumSha256)).size,
    relationshipCount: relationships.length,
    forbiddenReferenceCount: 0,
    hostedMutations: 0,
  };
}
