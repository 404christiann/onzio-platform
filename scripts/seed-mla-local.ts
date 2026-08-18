// MLA P1 Step 8 (+ Home sections pass): seed Manu Ledesma Academy as a local
// preview tenant on the pathway@1 presentation template.
//
// Local-only, service-role seeding against the developer's local Supabase
// stack -- the structural sibling of the other local import scripts,
// including their media pipeline for the club's real assets: the crest and
// the five Home photographs.
//
// It inserts:
//   - one onzio.clubs row (deterministic id, kind "test", lifecycle
//     "onboarding", public_access "preview", tier "starter"),
//   - one verified primary onzio.club_domains row for
//     manu-ledesma-academy.localhost. Middleware resolves *.localhost hosts
//     by slug without a domain row, but getClubContextBySlug
//     (lib/club-context.ts) unconditionally requires a verified primary
//     domain for ONZIO_ENVIRONMENT and fails PRIMARY_DOMAIN_REQUIRED
//     otherwise -- every route page resolves club context through it, so
//     the domain row is load-bearing for local rendering, matching what
//     every sibling local import seeds.
//   - the presentation triple (presentation_documents /
//     presentation_state / presentation_publications), row-for-row on the
//     local-import precedent in lib/migration. The document itself is built
//     and validated by scripts/mla-pathway-presentation.ts, whose
//     production-surface parse is the single most important gate here: an
//     invalid published document does not error at render time, it silently
//     degrades the tenant to presentationTemplateKey null.
//
//     presentation_documents is insert-only by design, so the document id
//     is deterministic on the *configuration digest*: re-running with an
//     unchanged configuration is a no-op, while a changed configuration
//     inserts the next version for the club and re-points
//     presentation_state at it (with a publication row recording the
//     supersession). History is never rewritten.
//   - the real club media, validate -> normalize -> upload to the public
//     onzio-media bucket at the versioned {club_id}/{surface}/{asset_id}.{ext}
//     path -> one published onzio.media_assets row each -> content links:
//       * crest (graphic, surface "branding"): onzio.site_branding by both
//         club_logo_path and club_logo_asset_id -- the exact diverse-city
//         local-import shape. That is what makes useClubBranding()'s
//         clubLogoUrl resolve so PathwayNav renders the real crest, and
//         what /club-logo (favicon + link-preview image) redirects to.
//       * five Home photographs (photo, surface "homepage"):
//         onzio.homepage_slideshow_photos rows (url = storage path,
//         media_asset_id, alt, sort_order) -- the same link-table shape the
//         sibling homepage-photography imports use. pathway@1's Home reads
//         them as fixed slots by sort_order (HOME_PHOTO_SLOTS in
//         components/pathway/content.ts): 0 leader band, 1-3 expect-grid,
//         4 hero background (the team photograph behind the opening band).
//
//     Asset ids are deterministic on the source checksum, so re-running
//     with the same artwork is idempotent while new artwork gets a fresh
//     versioned path (immutable caching stays honest -- the old object is
//     never overwritten; the link row moves to the new asset).
//
//     Source files follow the sibling importers' Downloads-rooted
//     convention: /Users/christianalcala/Downloads/mlaAssets by default,
//     overridable with --source-root <dir>.
//
// Usage (env sourced from the running local stack, same as the sibling
// import scripts' npm entries):
//
//   eval "$(supabase status -o env 2>/dev/null)"; \
//     NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
//     SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
//     SUPABASE_DB_URL="$DB_URL" \
//     npx tsx scripts/seed-mla-local.ts
//
// (Note: `supabase status -o env` sets those vars WITHOUT exporting them --
// pass them explicitly on the command line as above or child processes see
// nothing.)
//
// Never run against a hosted project; the loopback assertions below refuse
// non-localhost targets. The hosted counterpart is
// scripts/provision-mla-staging.ts (written for Christian to run explicitly;
// never executed by agents).

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { Client as PostgresClient } from "pg";
import WebSocket from "ws";
import {
  normalizeGraphic,
  normalizePhoto,
  type NormalizedMedia,
} from "@/lib/media-processing";
import { validateMediaUpload } from "@/lib/media-validation";
import { deterministicUuid } from "@/lib/migration/rose-city-plan";
import { buildStoragePath } from "@/lib/storage-path";
import {
  buildMlaPathwayPresentationConfiguration,
  MLA_NAME,
  MLA_SLUG,
} from "@/scripts/mla-pathway-presentation";
import { parsePresentationDocument } from "@/packages/presentation";

export const MLA_LOCAL_TENANT_ID = deterministicUuid(
  `onzio:club:${MLA_SLUG}`,
);
export const MLA_LOCAL_HOSTNAME = `${MLA_SLUG}.localhost`;
export const MLA_LOCAL_DOMAIN_ID = deterministicUuid(
  `onzio:domain:${MLA_LOCAL_HOSTNAME}`,
);
// The deterministic local-contract auth fixture from supabase/seed.sql --
// the same actor the sibling local imports use to satisfy the
// `created_by ... references auth.users(id)` constraints on the
// presentation tables. Exists only on local stacks seeded by `supabase db
// reset`; its presence is verified before any insert.
export const MLA_LOCAL_PRESENTATION_ACTOR_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

const SEED_TIMESTAMP = "2026-08-15T00:00:00.000Z";

// Real MLA brand palette (provided by Christian 2026-08-15). Must satisfy the
// clubs check constraint `^#[0-9A-Fa-f]{6}$` (phase2_foundation migration);
// uppercase matches the repo's existing hex convention. The third brand color
// (#077df2 bright blue) is deliberately unplaced for now.
export const MLA_PRIMARY_COLOR = "#002B80"; // dark navy — CTA / primary-button fill
export const MLA_SECONDARY_COLOR = "#FC6601"; // orange — active-nav underline accent

const MLA_UPSL_STANDINGS_SETTINGS = {
  eyebrow: "League standings",
  title: "Ohio Valley Division",
  intro: "Current table for Manu Ledesma Academy's 2026 campaign.",
};

type MlaUpslStanding = {
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  points: number;
  isClub: boolean;
};

// The exact Spring 2026 Ohio Valley snapshot used by Lions FC. MLA shares
// the division, so the values and published order stay identical while the
// tenant ownership marker moves from Lions to Manu Ledesma Academy.
const MLA_UPSL_STANDINGS: readonly MlaUpslStanding[] = [
  { teamName: "Lions Football Club", played: 10, wins: 7, draws: 3, losses: 0, goalDifference: 21, points: 24, isClub: false },
  { teamName: "Leal United FC", played: 10, wins: 5, draws: 4, losses: 1, goalDifference: 11, points: 19, isClub: false },
  { teamName: "Columbus Astray", played: 10, wins: 6, draws: 1, losses: 3, goalDifference: 7, points: 19, isClub: false },
  { teamName: "Fut Ohio SC", played: 10, wins: 4, draws: 5, losses: 1, goalDifference: 27, points: 17, isClub: false },
  { teamName: "Indy Gladiators SC", played: 10, wins: 3, draws: 5, losses: 2, goalDifference: 10, points: 14, isClub: false },
  { teamName: "Manu Ledesma Academy", played: 10, wins: 4, draws: 2, losses: 4, goalDifference: 9, points: 8, isClub: true },
  { teamName: "Ohio International FC", played: 10, wins: 1, draws: 2, losses: 7, goalDifference: -30, points: 5, isClub: false },
  { teamName: "Lightning SC", played: 10, wins: 1, draws: 2, losses: 7, goalDifference: -27, points: 5, isClub: false },
  { teamName: "Mahoning Trumbull United SC", played: 10, wins: 1, draws: 2, losses: 7, goalDifference: -28, points: 5, isClub: false },
];

function standingRowId(teamName: string): string {
  const teamSlug = teamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return deterministicUuid(`onzio:${MLA_SLUG}:standing:${teamSlug}`);
}

// Media source convention: like the sibling local importers, real club
// artwork lives in a Downloads-rooted asset directory, not in the repo.
export const MLA_DEFAULT_SOURCE_ROOT =
  "/Users/christianalcala/Downloads/mlaAssets";

// Everything the tenant's media pipeline carries, in one declarative table
// (the sibling importers' ASSET_ROLES shape). Home photo sort_order values
// must agree with HOME_PHOTO_SLOTS in components/pathway/content.ts.
type MlaMediaSpec = {
  role:
    | "crest"
    | "home-hero"
    | "home-leader"
    | "home-agility"
    | "home-foot-skills"
    | "home-teamwork";
  fileName: string;
  mimeType: "image/png" | "image/jpeg";
  kind: "photo" | "graphic";
  mediaKind: "photograph" | "graphic";
  surface: "branding" | "homepage";
  homeSlot?: { sortOrder: number; alt: string };
};

export const MLA_MEDIA_SPECS: readonly MlaMediaSpec[] = [
  {
    role: "crest",
    fileName: "crest.png",
    mimeType: "image/png",
    kind: "graphic",
    mediaKind: "graphic",
    surface: "branding",
  },
  {
    role: "home-hero",
    fileName: "home-hero.png",
    mimeType: "image/png",
    kind: "photo",
    mediaKind: "photograph",
    surface: "homepage",
    homeSlot: {
      sortOrder: 4,
      alt: "The academy squad gathered together for a team photograph on the field",
    },
  },
  {
    role: "home-leader",
    fileName: "home-leader.png",
    mimeType: "image/png",
    kind: "photo",
    mediaKind: "photograph",
    surface: "homepage",
    homeSlot: {
      sortOrder: 0,
      alt: "Manu Ledesma standing beside the goal, holding a match ball",
    },
  },
  {
    role: "home-agility",
    fileName: "home-agility.jpeg",
    mimeType: "image/jpeg",
    kind: "photo",
    mediaKind: "photograph",
    surface: "homepage",
    homeSlot: {
      sortOrder: 1,
      alt: "A young player sprinting through a cone agility drill while a coach watches",
    },
  },
  {
    role: "home-foot-skills",
    fileName: "home-foot-skills.png",
    mimeType: "image/png",
    kind: "photo",
    mediaKind: "photograph",
    surface: "homepage",
    homeSlot: {
      sortOrder: 2,
      alt: "A player in orange club kit striking the ball on a turf field",
    },
  },
  {
    role: "home-teamwork",
    fileName: "home-teamwork.png",
    mimeType: "image/png",
    kind: "photo",
    mediaKind: "photograph",
    surface: "homepage",
    homeSlot: {
      sortOrder: 3,
      alt: "Teammates in orange kits celebrating together on the field",
    },
  },
];

type MlaMediaPlan = {
  spec: MlaMediaSpec;
  assetId: string;
  linkRowId: string | null;
  destinationPath: string;
  normalized: NormalizedMedia;
  sourceChecksumSha256: string;
};

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

// Validate + normalize exactly like the diverse-city local import's plan
// step: real signature/dimension validation first, then the kind-appropriate
// normalization (normalizeGraphic picks png-vs-webp by size; normalizePhoto
// re-encodes to webp at a bounded long edge). The strict validator is the
// gate that caught a silently truncated crest source last time -- when it
// refuses a file, suspect the file, never loosen the gate.
async function planMedia(
  spec: MlaMediaSpec,
  sourceRoot: string,
): Promise<MlaMediaPlan> {
  const sourcePath = resolve(sourceRoot, spec.fileName);
  let bytes: Buffer;
  try {
    bytes = await readFile(sourcePath);
  } catch {
    throw new Error(
      `Media source ${sourcePath} is missing. Place the club artwork ` +
        "there (or pass --source-root <dir>) and re-run.",
    );
  }
  const sourceChecksumSha256 = sha256(bytes);
  await validateMediaUpload({
    bytes,
    metadata: {
      fileName: spec.fileName,
      mimeType: spec.mimeType,
      size: bytes.length,
      kind: spec.kind,
    },
  });
  const normalized =
    spec.kind === "photo"
      ? await normalizePhoto(bytes)
      : await normalizeGraphic(bytes);
  const assetId = deterministicUuid(
    ["onzio", MLA_SLUG, "local-media", spec.fileName, sourceChecksumSha256].join(
      ":",
    ),
  );
  return {
    spec,
    assetId,
    // Stable per role, so replacement artwork moves the same link row to the
    // new asset instead of accumulating rows.
    linkRowId: spec.homeSlot
      ? deterministicUuid(`onzio:${MLA_SLUG}:home-photo:${spec.role}`)
      : null,
    destinationPath: buildStoragePath({
      clubId: MLA_LOCAL_TENANT_ID,
      surface: spec.surface,
      assetId,
      extension: normalized.format,
    }),
    normalized,
    sourceChecksumSha256,
  };
}

// Idempotent storage publish, same discipline as the sibling importers'
// ensureStorageObjects: an existing object must match the normalized
// checksum byte-for-byte; otherwise upload once with immutable caching.
async function ensureMediaObject(
  bucket: ReturnType<ReturnType<typeof createClient>["storage"]["from"]>,
  plan: MlaMediaPlan,
): Promise<"uploaded" | "reused"> {
  const existing = await bucket.download(plan.destinationPath);
  if (!existing.error && existing.data) {
    const bytes = Buffer.from(await existing.data.arrayBuffer());
    if (sha256(bytes) !== plan.normalized.checksumSha256) {
      throw new Error(
        `Existing local object checksum mismatch: ${plan.destinationPath}`,
      );
    }
    return "reused";
  }
  const upload = await bucket.upload(plan.destinationPath, plan.normalized.bytes, {
    contentType: plan.normalized.mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (upload.error) throw upload.error;
  return "uploaded";
}

function assertLoopbackUrl(raw: string | undefined, name: string): string {
  if (!raw) throw new Error(`${name} is required.`);
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(`${name} must use a loopback host. Refusing to run.`);
  }
  return raw.replace(/\/$/, "");
}

async function main() {
  const supabaseUrl = assertLoopbackUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const dbUrl = assertLoopbackUrl(process.env.SUPABASE_DB_URL, "SUPABASE_DB_URL");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.length < 32) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }
  const sourceRootFlag = process.argv.indexOf("--source-root");
  const sourceRoot =
    sourceRootFlag !== -1 && process.argv[sourceRootFlag + 1]
      ? resolve(process.argv[sourceRootFlag + 1])
      : MLA_DEFAULT_SOURCE_ROOT;

  // Validate/normalize every asset before touching storage or the database,
  // so a missing or corrupt source file fails the whole seed instead of
  // half-applying.
  const plans: MlaMediaPlan[] = [];
  for (const spec of MLA_MEDIA_SPECS) {
    plans.push(await planMedia(spec, sourceRoot));
  }
  const crest = plans.find((plan) => plan.spec.role === "crest");
  if (!crest) throw new Error("Crest plan missing.");
  const homePhotos = plans.filter((plan) => plan.spec.homeSlot);

  // Throws (non-zero exit via the catch below) on any schema, registry,
  // provenance, config-safety, or theme-contrast failure -- see the module's
  // doc comment for why this must happen before any insert.
  const { configuration, configurationDigest } =
    buildMlaPathwayPresentationConfiguration({
      createdBy: MLA_LOCAL_PRESENTATION_ACTOR_ID,
      createdAt: SEED_TIMESTAMP,
    });

  // Storage first, rows second (the sibling importers' order): a published
  // media_assets row must never reference an object that is not there yet.
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node 20 lacks a native WebSocket; same shim the sibling importers use.
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
  const bucket = service.storage.from("onzio-media");
  const storageResults: Record<string, "uploaded" | "reused"> = {};
  for (const plan of plans) {
    storageResults[plan.spec.role] = await ensureMediaObject(bucket, plan);
  }

  const now = SEED_TIMESTAMP;
  const standingsRows = MLA_UPSL_STANDINGS.map((standing, sortOrder) => ({
    ...standing,
    id: standingRowId(standing.teamName),
    sortOrder,
  }));
  const client = new PostgresClient({ connectionString: dbUrl });
  await client.connect();
  try {
    const actor = await client.query(
      "select 1 from auth.users where id = $1::uuid",
      [MLA_LOCAL_PRESENTATION_ACTOR_ID],
    );
    if (actor.rowCount !== 1) {
      throw new Error(
        `Seed auth user ${MLA_LOCAL_PRESENTATION_ACTOR_ID} is missing. ` +
          "Run `supabase db reset` so supabase/seed.sql applies, then re-run.",
      );
    }

    let documentId: string;
    let publicationId: string;
    await client.query("begin");
    try {
      await client.query(
        `insert into onzio.clubs
           (id, slug, name, kind, lifecycle, public_access, tier,
            stripe_price_id, primary_color, secondary_color,
            created_at, updated_at, archived_at)
         values ($1, $2, $3, $4, $5, $6, $7, null, $8, $9, $10, $10, null)
         on conflict (id) do update set
           slug = excluded.slug,
           name = excluded.name,
           kind = excluded.kind,
           lifecycle = excluded.lifecycle,
           public_access = excluded.public_access,
           tier = excluded.tier,
           primary_color = excluded.primary_color,
           secondary_color = excluded.secondary_color,
           updated_at = excluded.updated_at`,
        [
          MLA_LOCAL_TENANT_ID,
          MLA_SLUG,
          MLA_NAME,
          "test",
          "onboarding",
          "preview",
          "starter",
          MLA_PRIMARY_COLOR,
          MLA_SECONDARY_COLOR,
          now,
        ],
      );

      // environment "staging" matches local development's
      // ONZIO_ENVIRONMENT=staging (docs/local-development.md), the value
      // getClubContextBySlug filters primary-domain lookups by -- the same
      // choice every sibling local import makes.
      await client.query(
        `insert into onzio.club_domains
           (id, club_id, hostname, is_primary, verified_at, environment,
            active, created_at, updated_at)
         values ($1, $2, $3, true, $4, 'staging', true, $4, $4)
         on conflict (id) do update set
           hostname = excluded.hostname,
           is_primary = excluded.is_primary,
           verified_at = excluded.verified_at,
           active = excluded.active,
           updated_at = excluded.updated_at`,
        [MLA_LOCAL_DOMAIN_ID, MLA_LOCAL_TENANT_ID, MLA_LOCAL_HOSTNAME, now],
      );

      await client.query(
        `insert into onzio.league_standings_settings
           (club_id, eyebrow, title, intro, updated_at)
         values ($1, $2, $3, $4, $5)
         on conflict (club_id) do update set
           eyebrow = excluded.eyebrow,
           title = excluded.title,
           intro = excluded.intro,
           updated_at = excluded.updated_at`,
        [
          MLA_LOCAL_TENANT_ID,
          MLA_UPSL_STANDINGS_SETTINGS.eyebrow,
          MLA_UPSL_STANDINGS_SETTINGS.title,
          MLA_UPSL_STANDINGS_SETTINGS.intro,
          now,
        ],
      );

      for (const standing of standingsRows) {
        await client.query(
          `insert into onzio.league_standings
             (id, club_id, team_name, team_abbreviation, logo_url,
              logo_asset_id, played, wins, draws, losses, goal_difference,
              points, is_club, sort_order, created_at, updated_at)
           values ($1, $2, $3, null, null, null, $4, $5, $6, $7, $8,
                   $9, $10, $11, $12, $12)
           on conflict (id) do update set
             team_name = excluded.team_name,
             team_abbreviation = excluded.team_abbreviation,
             logo_url = excluded.logo_url,
             logo_asset_id = excluded.logo_asset_id,
             played = excluded.played,
             wins = excluded.wins,
             draws = excluded.draws,
             losses = excluded.losses,
             goal_difference = excluded.goal_difference,
             points = excluded.points,
             is_club = excluded.is_club,
             sort_order = excluded.sort_order,
             updated_at = excluded.updated_at`,
          [
            standing.id,
            MLA_LOCAL_TENANT_ID,
            standing.teamName,
            standing.played,
            standing.wins,
            standing.draws,
            standing.losses,
            standing.goalDifference,
            standing.points,
            standing.isClub,
            standing.sortOrder,
            now,
          ],
        );
      }

      await client.query(
        `delete from onzio.league_standings
          where club_id = $1
            and not (id = any($2::uuid[]))`,
        [MLA_LOCAL_TENANT_ID, standingsRows.map((standing) => standing.id)],
      );

      // presentation_documents rows are immutable/insert-only by design
      // (same as the sibling importers' INSERT_ONLY_TABLES). The current
      // configuration is looked up by digest; when it has never been
      // published for this club, the next version is inserted -- history is
      // appended to, never rewritten.
      const existingDocument = await client.query(
        `select id from onzio.presentation_documents
          where club_id = $1 and configuration_digest = $2
          order by version desc limit 1`,
        [MLA_LOCAL_TENANT_ID, configurationDigest],
      );
      if (existingDocument.rowCount === 1) {
        documentId = existingDocument.rows[0].id as string;
      } else {
        const nextVersion = await client.query(
          `select coalesce(max(version), 0)::integer + 1 as version
             from onzio.presentation_documents where club_id = $1`,
          [MLA_LOCAL_TENANT_ID],
        );
        const version = nextVersion.rows[0].version as number;
        documentId = deterministicUuid(
          `onzio:${MLA_SLUG}:presentation:pathway@1:v${version}:${configurationDigest}`,
        );
        await client.query(
          `insert into onzio.presentation_documents
             (id, club_id, version, schema_version, template_id,
              template_version, configuration, configuration_digest,
              created_by, created_at)
           values ($1, $2, $3, 1, 'pathway', 1, $4::jsonb, $5, $6, $7)
           on conflict (id) do nothing`,
          [
            documentId,
            MLA_LOCAL_TENANT_ID,
            version,
            JSON.stringify(configuration),
            configurationDigest,
            MLA_LOCAL_PRESENTATION_ACTOR_ID,
            now,
          ],
        );
      }

      // Record what was published before this run so the publication row
      // can carry an honest previous_document_id on upgrades.
      const previousState = await client.query(
        `select published_document_id from onzio.presentation_state
          where club_id = $1`,
        [MLA_LOCAL_TENANT_ID],
      );
      const previousDocumentId =
        (previousState.rows[0]?.published_document_id as string | undefined) ??
        null;

      await client.query(
        `insert into onzio.presentation_state
           (club_id, draft_document_id, published_document_id,
            updated_by, updated_at)
         values ($1, null, $2, $3, $4)
         on conflict (club_id) do update set
           draft_document_id = excluded.draft_document_id,
           published_document_id = excluded.published_document_id,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
        [MLA_LOCAL_TENANT_ID, documentId, MLA_LOCAL_PRESENTATION_ACTOR_ID, now],
      );

      publicationId = deterministicUuid(
        `onzio:${MLA_SLUG}:presentation-publication:${configurationDigest}`,
      );
      await client.query(
        `insert into onzio.presentation_publications
           (id, club_id, action, previous_document_id, next_document_id,
            next_configuration_digest, validation_result, override_reason,
            created_by, created_at)
         values ($1, $2, 'publish', $3, $4, $5, $6::jsonb, null, $7, $8)
         on conflict (id) do nothing`,
        [
          publicationId,
          MLA_LOCAL_TENANT_ID,
          previousDocumentId === documentId ? null : previousDocumentId,
          documentId,
          configurationDigest,
          JSON.stringify({ valid: true, errors: [], warnings: [] }),
          MLA_LOCAL_PRESENTATION_ACTOR_ID,
          now,
        ],
      );

      // Published media rows, byte-identical in shape to the sibling
      // importers' mediaRow(): published rows live in onzio-media with
      // published_at set (enforced by the table check), surface and
      // media_kind from the spec, dimensions/checksum of the *normalized*
      // bytes.
      for (const plan of plans) {
        await client.query(
          `insert into onzio.media_assets
             (id, club_id, storage_bucket, storage_path, surface, media_kind,
              mime_type, byte_size, width, height, checksum_sha256, status,
              created_by, created_at, published_at, deleted_at)
           values ($1, $2, 'onzio-media', $3, $4, $5,
                   $6, $7, $8, $9, $10, 'published', null, $11, $11, null)
           on conflict (id) do nothing`,
          [
            plan.assetId,
            MLA_LOCAL_TENANT_ID,
            plan.destinationPath,
            plan.spec.surface,
            plan.spec.mediaKind,
            plan.normalized.mimeType,
            plan.normalized.bytes.length,
            plan.normalized.width,
            plan.normalized.height,
            plan.normalized.checksumSha256,
            now,
          ],
        );
      }

      // Both columns on purpose: fetchClubBranding resolves through
      // club_logo_asset_id (media_assets is authoritative), while the
      // /club-logo favicon/link-preview route still reads club_logo_path.
      // The on-conflict update touches only the crest columns so any
      // admin-edited footer tagline or inverse logo survives a re-seed.
      await client.query(
        `insert into onzio.site_branding
           (club_id, club_logo_path, club_logo_asset_id, updated_at)
         values ($1, $2, $3, $4)
         on conflict (club_id) do update set
           club_logo_path = excluded.club_logo_path,
           club_logo_asset_id = excluded.club_logo_asset_id,
           updated_at = excluded.updated_at`,
        [MLA_LOCAL_TENANT_ID, crest.destinationPath, crest.assetId, now],
      );

      // Home photo link rows: url stores the storage path (the sibling
      // homepage-photography importers' convention; resolveMediaReferences
      // hydrates it to a public URL at read time), sort_order is the
      // HOME_PHOTO_SLOTS contract. Row ids are stable per role so
      // replacement artwork updates in place.
      for (const plan of homePhotos) {
        await client.query(
          `insert into onzio.homepage_slideshow_photos
             (id, club_id, url, media_asset_id, alt, sort_order, created_at)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (id) do update set
             url = excluded.url,
             media_asset_id = excluded.media_asset_id,
             alt = excluded.alt,
             sort_order = excluded.sort_order`,
          [
            plan.linkRowId,
            MLA_LOCAL_TENANT_ID,
            plan.destinationPath,
            plan.assetId,
            plan.spec.homeSlot!.alt,
            plan.spec.homeSlot!.sortOrder,
            now,
          ],
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    // Reconcile: re-read what render-time resolution will read and re-parse
    // it at the production surface, so a bad seed fails here instead of
    // silently degrading the tenant chrome.
    const photoAssetIds = homePhotos.map((plan) => plan.assetId);
    const seeded = await client.query(
      `select
         (select count(*)::integer from onzio.clubs where id = $1) as clubs,
         (select count(*)::integer from onzio.club_domains
            where club_id = $1 and is_primary and active
              and verified_at is not null and environment = 'staging') as domains,
         (select count(*)::integer from onzio.presentation_documents
            where club_id = $1 and id = $2
              and configuration_digest = $3) as documents,
         (select count(*)::integer from onzio.presentation_state
            where club_id = $1 and published_document_id = $2) as state,
         (select count(*)::integer from onzio.presentation_publications
            where club_id = $1 and next_document_id = $2) as publications,
         (select count(*)::integer from onzio.media_assets
            where club_id = $1 and id = $4 and status = 'published'
              and storage_bucket = 'onzio-media') as crest_assets,
         (select count(*)::integer from onzio.site_branding
            where club_id = $1 and club_logo_asset_id = $4
              and club_logo_path = $5) as branding,
         (select count(*)::integer from onzio.media_assets
            where club_id = $1 and id = any($6::uuid[])
              and status = 'published' and surface = 'homepage'
              and storage_bucket = 'onzio-media') as home_photo_assets,
         (select count(*)::integer from onzio.homepage_slideshow_photos
            where club_id = $1 and media_asset_id = any($6::uuid[])) as home_photo_links,
         (select count(*)::integer from onzio.league_standings_settings
            where club_id = $1) as standings_settings,
         (select count(*)::integer from onzio.league_standings
            where club_id = $1) as standings_rows,
         (select configuration from onzio.presentation_documents
            where id = $2) as configuration`,
      [
        MLA_LOCAL_TENANT_ID,
        documentId,
        configurationDigest,
        crest.assetId,
        crest.destinationPath,
        photoAssetIds,
      ],
    );
    const row = seeded.rows[0];
    if (
      row.clubs !== 1 ||
      row.domains !== 1 ||
      row.documents !== 1 ||
      row.state !== 1 ||
      row.publications !== 1 ||
      row.crest_assets !== 1 ||
      row.branding !== 1 ||
      row.home_photo_assets !== homePhotos.length ||
      row.home_photo_links !== homePhotos.length ||
      row.standings_settings !== 1 ||
      row.standings_rows !== standingsRows.length
    ) {
      throw new Error(`MLA seed reconciliation failed: ${JSON.stringify(row)}`);
    }

    const persistedStandings = await client.query(
      `select team_name, played, wins, draws, losses, goal_difference,
              points, is_club, sort_order
         from onzio.league_standings
        where club_id = $1
        order by sort_order asc`,
      [MLA_LOCAL_TENANT_ID],
    );
    standingsRows.forEach((expected, index) => {
      const actual = persistedStandings.rows[index];
      if (
        actual?.team_name !== expected.teamName ||
        actual?.played !== expected.played ||
        actual?.wins !== expected.wins ||
        actual?.draws !== expected.draws ||
        actual?.losses !== expected.losses ||
        actual?.goal_difference !== expected.goalDifference ||
        actual?.points !== expected.points ||
        actual?.is_club !== expected.isClub ||
        actual?.sort_order !== expected.sortOrder
      ) {
        throw new Error(
          `MLA standings reconciliation failed at row ${index + 1}: ${JSON.stringify(actual)}`,
        );
      }
    });
    // jsonb does not preserve key order, so the re-read document cannot be
    // compared by re-digesting its serialization -- deep equality against
    // the validated in-memory document is the honest check.
    const persisted = parsePresentationDocument(row.configuration, {
      surface: "production",
    });
    if (!isDeepStrictEqual(persisted, configuration)) {
      throw new Error("Persisted configuration does not match the validated document.");
    }

    console.log(
      JSON.stringify({
        tenant: {
          id: MLA_LOCAL_TENANT_ID,
          slug: MLA_SLUG,
          localUrl: `http://${MLA_LOCAL_HOSTNAME}:3000`,
        },
        domain: { id: MLA_LOCAL_DOMAIN_ID, hostname: MLA_LOCAL_HOSTNAME },
        presentation: {
          documentId,
          publicationId,
          templateKey: "pathway@1",
          configurationDigest,
          productionSurfaceParse: "passed",
        },
        media: plans.map((plan) => ({
          role: plan.spec.role,
          assetId: plan.assetId,
          storagePath: plan.destinationPath,
          mimeType: plan.normalized.mimeType,
          width: plan.normalized.width,
          height: plan.normalized.height,
          sourceChecksumSha256: plan.sourceChecksumSha256,
          storageObject: storageResults[plan.spec.role],
          homeSlot: plan.spec.homeSlot?.sortOrder ?? null,
        })),
        counts: {
          clubs: row.clubs,
          domains: row.domains,
          documents: row.documents,
          state: row.state,
          publications: row.publications,
          crestAssets: row.crest_assets,
          branding: row.branding,
          homePhotoAssets: row.home_photo_assets,
          homePhotoLinks: row.home_photo_links,
          standingsSettings: row.standings_settings,
          standingsRows: row.standings_rows,
        },
        hostedMutations: 0,
      }),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
