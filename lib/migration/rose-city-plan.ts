import { createHash } from "node:crypto";

export const ROSE_CITY_SOURCE_TABLES = [
  "about_page_content",
  "behind_the_rose_section",
  "club_logo_page_content",
  "goalkeeper_match_stats",
  "goalkeeper_season_stats",
  "homepage_slideshow_photos",
  "homepage_slideshow_settings",
  "league_standings",
  "league_standings_settings",
  "matches",
  "player_match_stats",
  "player_photos",
  "player_season_stats",
  "players",
  "seasons",
  "shop_carousel_photos",
  "shop_kit_photos",
  "shop_kit_section",
  "shop_purchase_details",
  "site_branding",
  "site_social_links",
  "site_sponsor_logos",
  "staff",
  "stripe_subscription",
] as const;

export type RoseCitySourceTable = (typeof ROSE_CITY_SOURCE_TABLES)[number];
export type SourceRow = Record<string, unknown>;
export type SourceTables = Record<RoseCitySourceTable, SourceRow[]>;

export type PlannedMedia = {
  id: string;
  sourceBucket: string;
  sourcePath: string;
  sourceChecksumSha256: string;
  referenced: boolean;
  classification:
    | "photograph"
    | "graphic"
    | "video"
    | "gif"
    | "unsupported"
    | "corrupt"
    | "placeholder";
  surface: string;
  importable: boolean;
  destinationPath: string | null;
  outputRelativePath: string | null;
  outputMimeType: "image/png" | "image/webp" | null;
  outputByteSize: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  outputChecksumSha256: string | null;
  reason: string | null;
  migrationException:
    | {
        code: "approved-rehearsal-input-limit-pre-normalization";
        approvedAt: "2026-07-27";
        scope: "referenced-asset-only";
      }
    | null;
};

export type FieldDisposition = {
  source: string;
  target: string | null;
  transformation: string;
};

export type TableMapping = {
  sourceTable: RoseCitySourceTable;
  targetTable: string;
  sourceRowCount: number;
  targetRowCount: number;
  fields: FieldDisposition[];
};

export type RoseCityImportPlan = {
  formatVersion: 1;
  kind: "rose-city-local-import-plan";
  sourceDigest: string;
  planDigest: string;
  club: SourceRow;
  domain: SourceRow;
  localIdentities: Array<{
    key: "owner" | "admin";
    email: string;
    role: "owner" | "admin";
    sourceIdentityCount: number;
    passwordSource: "environment";
    requiresMfaEnrollment: true;
  }>;
  sourceCounts: Record<RoseCitySourceTable, number>;
  mappings: TableMapping[];
  tables: Record<string, SourceRow[]>;
  media: PlannedMedia[];
  mediaSummary: {
    sourceObjectCount: number;
    referencedObjectCount: number;
    unreferencedObjectCount: number;
    importableObjectCount: number;
    excludedObjectCount: number;
    referencedExcludedObjectCount: number;
    approvedInputExceptionCount: number;
  };
  stripe: {
    sourceSubscriptionId: string;
    sourceCustomerId: string | null;
    preserved: true;
    networkCalls: 0;
  };
  reconciliation: {
    allSourceTablesMapped: true;
    sourceRowCount: number;
    mappedSourceRowCount: number;
    relationshipsPreserved: true;
    referencedMediaResolved: true;
    credentialsEmbedded: false;
  };
};

const CLUB_ID = deterministicUuid("onzio:club:rose-city-futbol-club");
const DOMAIN_ID = deterministicUuid("onzio:domain:rose-city.localhost");
const MEDIA_TOKEN_PREFIX = "__ONZIO_MEDIA__/";
const SOURCE_STORAGE_HOST = "nsgtkwqkbyxkiwrhzsje.supabase.co";

const TARGET_COLUMNS: Record<RoseCitySourceTable, readonly string[]> = {
  about_page_content: [
    "hero_title",
    "story_paragraphs",
    "feature_image_url",
    "values_heading",
    "values",
    "closing_text",
    "closing_cta_label",
    "closing_cta_href",
    "updated_at",
  ],
  behind_the_rose_section: [
    "visible",
    "eyebrow",
    "title",
    "description",
    "video_url",
    "video_title",
    "caption",
    "updated_at",
  ],
  club_logo_page_content: [
    "annotated_image_url",
    "features",
    "map_image_url",
    "color_cards",
    "updated_at",
  ],
  goalkeeper_match_stats: [
    "id",
    "player_id",
    "match_id",
    "starts",
    "mins",
    "goals_against",
    "saves",
    "clean_sheets",
    "yellow",
    "red",
  ],
  goalkeeper_season_stats: [
    "player_id",
    "season_id",
    "goals_against",
    "saves",
    "clean_sheets",
    "starts",
    "yellow",
    "red",
    "mins",
  ],
  homepage_slideshow_photos: [
    "id",
    "url",
    "alt",
    "sort_order",
    "created_at",
  ],
  homepage_slideshow_settings: ["season_label", "updated_at"],
  league_standings: [
    "id",
    "team_name",
    "team_abbreviation",
    "logo_url",
    "played",
    "wins",
    "draws",
    "losses",
    "goal_difference",
    "points",
    "is_club",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  league_standings_settings: ["eyebrow", "title", "intro", "updated_at"],
  matches: [
    "id",
    "season_id",
    "date",
    "time",
    "opponent",
    "opponent_short_name",
    "opponent_logo_url",
    "competition",
    "sponsor_name",
    "sponsor_logo_url",
    "sponsor_link",
    "home",
    "venue",
    "address",
    "city",
    "state",
    "rose_city_score",
    "opponent_score",
    "created_at",
  ],
  player_match_stats: [
    "id",
    "player_id",
    "match_id",
    "starts",
    "mins",
    "goals",
    "assists",
    "tackles",
    "offsides",
    "fouls",
    "fouls_suffered",
    "yellow",
    "red",
  ],
  player_photos: ["id", "player_id", "url", "sort_order", "created_at"],
  player_season_stats: [
    "player_id",
    "season_id",
    "goals",
    "assists",
    "tackles",
    "starts",
    "yellow",
    "red",
    "mins",
    "offsides",
    "fouls",
    "fouls_suffered",
  ],
  players: [
    "id",
    "number",
    "name",
    "caption",
    "nationality",
    "position",
    "height",
    "weight",
    "hometown",
    "age",
    "school",
    "previous_club",
    "photo_url",
    "active",
    "bio",
    "pronunciation",
    "foot",
    "created_at",
  ],
  seasons: ["id", "label", "start_year", "end_year", "active", "created_at"],
  shop_carousel_photos: [
    "id",
    "kit_variant",
    "url",
    "sort_order",
    "created_at",
  ],
  shop_kit_photos: [
    "id",
    "surface",
    "kit_variant",
    "url",
    "sort_order",
    "created_at",
  ],
  shop_kit_section: [
    "id",
    "surface",
    "kit_variant",
    "eyebrow",
    "title",
    "description",
    "bullet_points",
    "store_note",
    "cta_label",
    "cta_link",
    "updated_at",
  ],
  shop_purchase_details: [
    "heading",
    "cards",
    "cta_eyebrow",
    "cta_text",
    "cta_label",
    "cta_link",
    "updated_at",
  ],
  site_branding: ["club_logo_path", "updated_at"],
  site_social_links: [
    "id",
    "label",
    "href",
    "icon",
    "sort_order",
    "updated_at",
  ],
  site_sponsor_logos: [
    "id",
    "placement",
    "name",
    "logo_url",
    "sort_order",
    "created_at",
  ],
  staff: [
    "id",
    "initials",
    "name",
    "role",
    "hometown",
    "nationality",
    "bio",
    "photo_url",
    "active",
    "created_at",
  ],
  stripe_subscription: [
    "stripe_customer_id",
    "stripe_subscription_id",
    "status",
    "cancel_at_period_end",
    "current_period_end",
    "updated_at",
  ],
};

const ALIAS_FIELDS: Partial<
  Record<RoseCitySourceTable, Record<string, string>>
> = {
  goalkeeper_match_stats: {
    minutes: "mins",
    clean_sheet: "clean_sheets",
    yellow_cards: "yellow",
    red_cards: "red",
  },
  matches: {
    score_ours: "rose_city_score",
    score_them: "opponent_score",
  },
  player_match_stats: {
    minutes: "mins",
    yellow_cards: "yellow",
    red_cards: "red",
  },
};

const RELATIONSHIP_COLUMNS: Partial<
  Record<RoseCitySourceTable, readonly string[]>
> = {
  goalkeeper_match_stats: ["player_id", "match_id"],
  goalkeeper_season_stats: ["player_id", "season_id"],
  matches: ["season_id"],
  player_match_stats: ["player_id", "match_id"],
  player_photos: ["player_id"],
  player_season_stats: ["player_id", "season_id"],
};

const MEDIA_COLUMNS: Partial<
  Record<RoseCitySourceTable, Record<string, string>>
> = {
  about_page_content: { feature_image_url: "feature_image_asset_id" },
  club_logo_page_content: {
    annotated_image_url: "annotated_image_asset_id",
    map_image_url: "map_image_asset_id",
  },
  homepage_slideshow_photos: { url: "media_asset_id" },
  league_standings: { logo_url: "logo_asset_id" },
  matches: {
    opponent_logo_url: "opponent_logo_asset_id",
    sponsor_logo_url: "sponsor_logo_asset_id",
  },
  player_photos: { url: "media_asset_id" },
  players: { photo_url: "photo_asset_id" },
  shop_carousel_photos: { url: "media_asset_id" },
  shop_kit_photos: { url: "media_asset_id" },
  site_branding: { club_logo_path: "club_logo_asset_id" },
  site_sponsor_logos: { logo_url: "media_asset_id" },
  staff: { photo_url: "photo_asset_id" },
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deterministicUuid(seed: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(seed, "utf8").digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function sourceIdentity(table: RoseCitySourceTable, row: SourceRow): string {
  if (table === "goalkeeper_season_stats" || table === "player_season_stats") {
    return `${String(row.player_id)}:${String(row.season_id)}`;
  }
  if (row.id === undefined || row.id === null || String(row.id) === "") {
    throw new Error(`${table} contains a row without its required source identity.`);
  }
  return String(row.id);
}

function remapId(table: RoseCitySourceTable, sourceId: unknown): string {
  return deterministicUuid(`onzio:rose-city:${table}:${String(sourceId)}`);
}

function targetRelationshipTable(column: string): RoseCitySourceTable {
  if (column === "player_id") return "players";
  if (column === "match_id") return "matches";
  if (column === "season_id") return "seasons";
  throw new Error(`Unsupported relationship column ${column}.`);
}

function parseStorageReference(value: string): {
  bucket: string;
  path: string;
} | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hostname !== SOURCE_STORAGE_HOST) return null;
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const publicIndex = segments.findIndex(
    (segment, index) =>
      segment === "public" &&
      index >= 3 &&
      segments[index - 1] === "object",
  );
  const transformedIndex = segments.findIndex(
    (segment, index) =>
      segment === "public" &&
      index >= 4 &&
      segments[index - 1] === "image" &&
      segments[index - 2] === "render",
  );
  const index = publicIndex >= 0 ? publicIndex : transformedIndex;
  if (index < 0 || segments.length < index + 3) return null;
  return {
    bucket: segments[index + 1],
    path: segments.slice(index + 2).join("/"),
  };
}

function mediaKey(bucket: string, path: string): string {
  return `${bucket}\u001f${path}`;
}

function replaceMediaStrings(
  value: unknown,
  mediaBySource: ReadonlyMap<string, PlannedMedia>,
): unknown {
  if (typeof value === "string") {
    const reference = parseStorageReference(value);
    if (!reference) return value;
    const media = mediaBySource.get(mediaKey(reference.bucket, reference.path));
    if (!media?.importable || !media.destinationPath) {
      throw new Error(
        `Referenced media is not importable: ${reference.bucket}/${reference.path}`,
      );
    }
    return `${MEDIA_TOKEN_PREFIX}${media.destinationPath}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceMediaStrings(item, mediaBySource));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as SourceRow).map(([key, item]) => [
        key,
        replaceMediaStrings(item, mediaBySource),
      ]),
    );
  }
  return value;
}

function directMedia(
  value: unknown,
  mediaBySource: ReadonlyMap<string, PlannedMedia>,
): PlannedMedia | null {
  if (typeof value !== "string") return null;
  const reference = parseStorageReference(value);
  if (!reference) return null;
  const media = mediaBySource.get(mediaKey(reference.bucket, reference.path));
  if (!media?.importable || !media.destinationPath) {
    throw new Error(
      `Referenced media is not importable: ${reference.bucket}/${reference.path}`,
    );
  }
  return media;
}

function valueForTarget(
  table: RoseCitySourceTable,
  row: SourceRow,
  targetColumn: string,
): unknown {
  if (row[targetColumn] !== undefined && row[targetColumn] !== null) {
    return row[targetColumn];
  }
  const aliases = ALIAS_FIELDS[table] ?? {};
  const alias = Object.entries(aliases).find(
    ([, target]) => target === targetColumn,
  )?.[0];
  return alias ? row[alias] : row[targetColumn];
}

function transformRows(
  table: RoseCitySourceTable,
  rows: SourceRow[],
  mediaBySource: ReadonlyMap<string, PlannedMedia>,
): SourceRow[] {
  if (table === "stripe_subscription") return [];
  const singleton = [
    "about_page_content",
    "behind_the_rose_section",
    "club_logo_page_content",
    "homepage_slideshow_settings",
    "league_standings_settings",
    "shop_purchase_details",
    "site_branding",
  ].includes(table);
  const relationshipColumns = new Set(RELATIONSHIP_COLUMNS[table] ?? []);
  const mediaColumns = MEDIA_COLUMNS[table] ?? {};

  return rows.map((row) => {
    const result: SourceRow = { club_id: CLUB_ID };
    for (const targetColumn of TARGET_COLUMNS[table]) {
      if (targetColumn === "id") {
        result.id = remapId(table, sourceIdentity(table, row));
        continue;
      }
      const sourceValue = valueForTarget(table, row, targetColumn);
      result[targetColumn] = relationshipColumns.has(targetColumn)
        ? remapId(targetRelationshipTable(targetColumn), sourceValue)
        : replaceMediaStrings(sourceValue, mediaBySource);
    }
    if (singleton) delete result.id;
    for (const [urlColumn, assetColumn] of Object.entries(mediaColumns)) {
      const media =
        directMedia(row[urlColumn], mediaBySource) ??
        (table === "site_branding" &&
        urlColumn === "club_logo_path" &&
        typeof row[urlColumn] === "string"
          ? mediaBySource.get(mediaKey("logos_v2", row[urlColumn])) ?? null
          : null);
      result[assetColumn] = media?.id ?? null;
      if (
        table === "site_branding" &&
        media?.destinationPath &&
        urlColumn === "club_logo_path"
      ) {
        result.club_logo_path = media.destinationPath;
      }
    }
    return result;
  });
}

function fieldDispositions(
  table: RoseCitySourceTable,
  rows: SourceRow[],
): FieldDisposition[] {
  const sourceFields = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  const targets = new Set(TARGET_COLUMNS[table]);
  const aliases = ALIAS_FIELDS[table] ?? {};
  return sourceFields.map((source) => {
    if (source === "id" && !targets.has("id")) {
      return {
        source,
        target: null,
        transformation: "singleton source identity is replaced by club_id",
      };
    }
    if (targets.has(source)) {
      return {
        source,
        target: source === "current_period_end" ? "paid_through" : source,
        transformation:
          source.endsWith("_url") || source === "club_logo_path"
            ? "source Storage references become deterministic onzio-media references"
            : "preserved",
      };
    }
    if (aliases[source]) {
      return {
        source,
        target: aliases[source],
        transformation: `legacy alias used only when ${aliases[source]} is absent`,
      };
    }
    return {
      source,
      target: null,
      transformation:
        "legacy-only field retained in this mapping ledger and intentionally excluded because the Onzio schema has no equivalent",
    };
  });
}

function assertTables(input: Record<string, SourceRow[]>): SourceTables {
  const actual = Object.keys(input).sort();
  const expected = [...ROSE_CITY_SOURCE_TABLES].sort();
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `Source table set mismatch. Expected ${expected.join(", ")}; received ${actual.join(", ")}.`,
    );
  }
  for (const table of ROSE_CITY_SOURCE_TABLES) {
    const identities = input[table].map((row) => sourceIdentity(table, row));
    if (new Set(identities).size !== identities.length) {
      throw new Error(`${table} contains duplicate source identities.`);
    }
  }
  return input as SourceTables;
}

function assertRelationships(tables: SourceTables): void {
  const targets = {
    player_id: new Set(tables.players.map((row) => String(row.id))),
    match_id: new Set(tables.matches.map((row) => String(row.id))),
    season_id: new Set(tables.seasons.map((row) => String(row.id))),
  };
  for (const [table, columns] of Object.entries(RELATIONSHIP_COLUMNS) as Array<
    [RoseCitySourceTable, readonly string[]]
  >) {
    for (const row of tables[table]) {
      for (const column of columns) {
        const value = row[column];
        if (value === undefined || !targets[column as keyof typeof targets].has(String(value))) {
          throw new Error(`${table}.${column} contains a broken relationship.`);
        }
      }
    }
  }
}

function subscriptionProjection(row: SourceRow | undefined): SourceRow {
  if (!row) throw new Error("stripe_subscription must contain exactly one row.");
  const subscriptionId = String(row.stripe_subscription_id ?? "").trim();
  const customerId = String(row.stripe_customer_id ?? "").trim();
  if (!subscriptionId || !customerId) {
    throw new Error("Rose City Stripe customer and subscription IDs are required.");
  }
  return {
    club_id: CLUB_ID,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    price_id: "price_rose_city_rehearsal_source_not_exported",
    tier: "pro",
    status: String(row.status ?? "active"),
    cancel_at_period_end: row.cancel_at_period_end === true,
    paid_through: row.current_period_end ?? null,
    grace_ends_at: null,
    last_applied_stripe_event_id: null,
    last_applied_stripe_event_created_at: null,
    created_at: row.updated_at ?? "2026-07-27T00:00:00.000Z",
    updated_at: row.updated_at ?? "2026-07-27T00:00:00.000Z",
  };
}

export function materializeMediaTokens(
  value: unknown,
  supabaseUrl: string,
): unknown {
  if (typeof value === "string" && value.startsWith(MEDIA_TOKEN_PREFIX)) {
    const path = value.slice(MEDIA_TOKEN_PREFIX.length);
    return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/onzio-media/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => materializeMediaTokens(item, supabaseUrl));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as SourceRow).map(([key, item]) => [
        key,
        materializeMediaTokens(item, supabaseUrl),
      ]),
    );
  }
  return value;
}

export function buildRoseCityImportPlan(input: {
  sourceTables: Record<string, SourceRow[]>;
  media: PlannedMedia[];
  sourceIdentityCount: number;
  verifiedSourceDigest: string;
}): RoseCityImportPlan {
  const tables = assertTables(input.sourceTables);
  assertRelationships(tables);

  const mediaBySource = new Map(
    input.media.map((item) => [
      mediaKey(item.sourceBucket, item.sourcePath),
      item,
    ]),
  );
  if (mediaBySource.size !== input.media.length) {
    throw new Error("Media inventory contains duplicate bucket/path identities.");
  }
  const referencedExcluded = input.media.filter(
    (item) => item.referenced && !item.importable,
  );
  if (referencedExcluded.length > 0) {
    throw new Error(
      `Referenced media cannot be represented: ${referencedExcluded
        .map((item) => `${item.sourceBucket}/${item.sourcePath}`)
        .join(", ")}`,
    );
  }

  const transformedTables: Record<string, SourceRow[]> = {};
  const mappings: TableMapping[] = [];
  for (const sourceTable of ROSE_CITY_SOURCE_TABLES) {
    const targetTable =
      sourceTable === "stripe_subscription"
        ? "club_subscriptions"
        : sourceTable;
    const targetRows =
      sourceTable === "stripe_subscription"
        ? [subscriptionProjection(tables.stripe_subscription[0])]
        : transformRows(sourceTable, tables[sourceTable], mediaBySource);
    transformedTables[targetTable] = targetRows;
    mappings.push({
      sourceTable,
      targetTable,
      sourceRowCount: tables[sourceTable].length,
      targetRowCount: targetRows.length,
      fields: fieldDispositions(sourceTable, tables[sourceTable]),
    });
  }

  const sourceCounts = Object.fromEntries(
    ROSE_CITY_SOURCE_TABLES.map((table) => [table, tables[table].length]),
  ) as Record<RoseCitySourceTable, number>;
  const subscription = tables.stripe_subscription[0];
  const mediaSummary = {
    sourceObjectCount: input.media.length,
    referencedObjectCount: input.media.filter((item) => item.referenced).length,
    unreferencedObjectCount: input.media.filter((item) => !item.referenced).length,
    importableObjectCount: input.media.filter((item) => item.importable).length,
    excludedObjectCount: input.media.filter((item) => !item.importable).length,
    referencedExcludedObjectCount: referencedExcluded.length,
    approvedInputExceptionCount: input.media.filter(
      (item) => item.migrationException !== null,
    ).length,
  };
  const sourceRowCount = Object.values(sourceCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const base = {
    formatVersion: 1 as const,
    kind: "rose-city-local-import-plan" as const,
    sourceDigest: input.verifiedSourceDigest,
    planDigest: "",
    club: {
      id: CLUB_ID,
      slug: "rose-city",
      name: "Rose City Futbol Club",
      lifecycle: "active",
      public_access: "live",
      tier: "pro",
      primary_color: "#C8102E",
      secondary_color: "#111111",
      created_at: "2026-07-27T00:00:00.000Z",
      updated_at: "2026-07-27T00:00:00.000Z",
      archived_at: null,
    },
    domain: {
      id: DOMAIN_ID,
      club_id: CLUB_ID,
      hostname: "rose-city.localhost",
      is_primary: true,
      verified_at: "2026-07-27T00:00:00.000Z",
      environment: "staging",
      active: true,
      created_at: "2026-07-27T00:00:00.000Z",
      updated_at: "2026-07-27T00:00:00.000Z",
    },
    localIdentities: [
      {
        key: "owner" as const,
        email: "owner@rose-city.localhost",
        role: "owner" as const,
        sourceIdentityCount: input.sourceIdentityCount,
        passwordSource: "environment" as const,
        requiresMfaEnrollment: true as const,
      },
      {
        key: "admin" as const,
        email: "admin@rose-city.localhost",
        role: "admin" as const,
        sourceIdentityCount: input.sourceIdentityCount,
        passwordSource: "environment" as const,
        requiresMfaEnrollment: true as const,
      },
    ],
    sourceCounts,
    mappings,
    tables: transformedTables,
    media: [...input.media].sort((left, right) =>
      `${left.sourceBucket}/${left.sourcePath}`.localeCompare(
        `${right.sourceBucket}/${right.sourcePath}`,
      ),
    ),
    mediaSummary,
    stripe: {
      sourceSubscriptionId: String(subscription.stripe_subscription_id),
      sourceCustomerId:
        typeof subscription.stripe_customer_id === "string"
          ? subscription.stripe_customer_id
          : null,
      preserved: true as const,
      networkCalls: 0 as const,
    },
    reconciliation: {
      allSourceTablesMapped: true as const,
      sourceRowCount,
      mappedSourceRowCount: mappings.reduce(
        (total, mapping) => total + mapping.sourceRowCount,
        0,
      ),
      relationshipsPreserved: true as const,
      referencedMediaResolved: true as const,
      credentialsEmbedded: false as const,
    },
  };
  return {
    ...base,
    planDigest: digest({ ...base, planDigest: undefined }),
  };
}
