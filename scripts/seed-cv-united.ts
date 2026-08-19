// CV United C1 (Step 1, + crest visual refresh): seed CV United as a local
// test tenant.
//
// Local-only, service-role seeding against the developer's local Supabase
// stack. It inserts:
//   - one onzio.clubs row (kind "test", lifecycle "onboarding", public_access
//     "preview", tier "starter"),
//   - one verified primary onzio.club_domains row for "cv-united.localhost"
//     (environment "staging", matching ONZIO_ENVIRONMENT=staging in local
//     development — see docs/local-development.md), mirroring the MLA seed
//     script's pattern. Without this row, getClubContextBySlug's
//     primary-domain lookup fails PRIMARY_DOMAIN_REQUIRED and the tenant
//     never renders, even when public_access/lifecycle allow it.
//   - two onzio.registration_forms rows:
//     * general_interest form (live, requires_payment false)
//     * academy_registration form (draft, requires_payment true with
//       placeholder price)
//   - the real club crest: validate -> normalize -> upload to the public
//     onzio-media bucket at the versioned {club_id}/branding/{asset_id}.{ext}
//     path -> one published onzio.media_assets row -> onzio.site_branding
//     (club_logo_path + club_logo_asset_id), following the exact pipeline
//     scripts/seed-mla-local.ts established for Manu Ledesma Academy's real
//     crest. That is what makes useClubBranding()'s clubLogoUrl resolve to
//     the real crest so Nav.tsx's badge and CrestHero.tsx's showcase panel
//     render it instead of an initials fallback. Source file:
//     /Users/christianalcala/Downloads/cvUnitedFCLogo.png (Christian's real,
//     approved crest, supplied 2026-08-18) — overridable with
//     --crest-source <path>.
//
// Usage (env sourced from the running local stack):
//
//   eval "$(supabase status -o env 2>/dev/null)"; \
//     NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
//     SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
//     SUPABASE_DB_URL="$DB_URL" \
//     npx tsx scripts/seed-cv-united.ts
//
// Never run against a hosted project; the loopback assertions below refuse
// non-localhost targets.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client as PostgresClient } from "pg";
import WebSocket from "ws";
import {
  normalizeGraphic,
  type NormalizedMedia,
} from "@/lib/media-processing";
import { validateMediaUpload } from "@/lib/media-validation";
import { buildStoragePath } from "@/lib/storage-path";
import { deterministicUuid } from "@/lib/migration/rose-city-plan";
import { buildCrestPresentationConfiguration } from "./crest-presentation";

// The deterministic local-contract auth fixture from supabase/seed.sql --
// the same actor MLA's seed script uses to satisfy the
// `created_by ... references auth.users(id)` constraints on the
// presentation tables. Exists only on local stacks seeded by
// `supabase db reset`; its presence is verified before any insert.
const CV_UNITED_LOCAL_PRESENTATION_ACTOR_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

export const CV_UNITED_SLUG = "cv-united";
export const CV_UNITED_NAME = "CV United";
export const CV_UNITED_LOCAL_TENANT_ID = deterministicUuid(
  `onzio:club:${CV_UNITED_SLUG}`,
);

const SEED_TIMESTAMP = "2026-08-18T00:00:00.000Z";

// Real CV United brand colors (Christian supplied 2026-08-18): Black
// #060605, Red #EC0A0C, Gold #E3A71C, Light Gold #F9D444 -- sourced from the
// real crest (cvUnitedFCLogo.png: black shield, red/gold trim, gold
// wordmark, three gold stars, red pinstripe base). Red plays the primary
// brand/action role here (mirrors --crest-action-primary in
// styles/globals.css's `.crest-home` block); Gold is the secondary accent
// (mirrors --crest-action-secondary / --crest-accent-one). Replaces the
// earlier placeholder blue/orange pair.
const CV_UNITED_PRIMARY_COLOR = "#EC0A0C"; // Red -- real CV United brand color
const CV_UNITED_SECONDARY_COLOR = "#E3A71C"; // Gold -- real CV United brand color

// Media source convention: like the sibling local importers (e.g.
// scripts/seed-mla-local.ts), real club artwork lives outside the repo.
// Christian supplied the real crest directly at this Downloads path rather
// than in a per-club asset directory, so this constant (not a
// --source-root-relative fileName) is the source of truth; still
// overridable with --crest-source <path> for a future replacement file.
export const CV_UNITED_DEFAULT_CREST_SOURCE_PATH =
  "/Users/christianalcala/Downloads/cvUnitedFCLogo.png";

// Deterministic form IDs based on club and form type
const GENERAL_INTEREST_FORM_ID = deterministicUuid(
  `onzio:${CV_UNITED_SLUG}:form:general_interest`,
);
const ACADEMY_REGISTRATION_FORM_ID = deterministicUuid(
  `onzio:${CV_UNITED_SLUG}:form:academy_registration`,
);
const CV_UNITED_LOCAL_DOMAIN_ID = deterministicUuid(
  `onzio:${CV_UNITED_SLUG}:domain:local`,
);
const CV_UNITED_LOCAL_HOSTNAME = "cv-united.localhost";

function assertLoopbackUrl(raw: string | undefined, name: string): string {
  if (!raw) throw new Error(`${name} is required.`);
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(`${name} must use a loopback host. Refusing to run.`);
  }
  return raw.replace(/\/$/, "");
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

type CvUnitedCrestPlan = {
  assetId: string;
  destinationPath: string;
  normalized: NormalizedMedia;
  sourceChecksumSha256: string;
};

// Validate + normalize the real crest exactly like the diverse-city/MLA
// local imports' media plan step: real signature/dimension validation
// first, then graphic normalization (normalizeGraphic picks png-vs-webp by
// size). The strict validator is the gate that has caught truncated/corrupt
// sources before -- when it refuses a file, suspect the file, never loosen
// the gate.
async function planCrestMedia(sourcePath: string): Promise<CvUnitedCrestPlan> {
  let bytes: Buffer;
  try {
    bytes = await readFile(sourcePath);
  } catch {
    throw new Error(
      `Crest source ${sourcePath} is missing. Place the real crest there ` +
        "(or pass --crest-source <path>) and re-run.",
    );
  }
  const sourceChecksumSha256 = sha256(bytes);
  await validateMediaUpload({
    bytes,
    metadata: {
      fileName: "cvUnitedFCLogo.png",
      mimeType: "image/png",
      size: bytes.length,
      kind: "graphic",
    },
  });
  const normalized = await normalizeGraphic(bytes);
  const assetId = deterministicUuid(
    ["onzio", CV_UNITED_SLUG, "local-media", "crest.png", sourceChecksumSha256].join(
      ":",
    ),
  );
  return {
    assetId,
    destinationPath: buildStoragePath({
      clubId: CV_UNITED_LOCAL_TENANT_ID,
      surface: "branding",
      assetId,
      extension: normalized.format,
    }),
    normalized,
    sourceChecksumSha256,
  };
}

// Idempotent storage publish, same discipline as the sibling importers'
// ensureStorageObjects/ensureMediaObject: an existing object must match the
// normalized checksum byte-for-byte; otherwise upload once with immutable
// caching.
async function ensureMediaObject(
  bucket: ReturnType<ReturnType<typeof createClient>["storage"]["from"]>,
  plan: CvUnitedCrestPlan,
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

async function main() {
  const dbUrl = assertLoopbackUrl(process.env.SUPABASE_DB_URL, "SUPABASE_DB_URL");
  const supabaseUrl = assertLoopbackUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.length < 32) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }
  const crestSourceFlag = process.argv.indexOf("--crest-source");
  const crestSourcePath =
    crestSourceFlag !== -1 && process.argv[crestSourceFlag + 1]
      ? resolve(process.argv[crestSourceFlag + 1])
      : CV_UNITED_DEFAULT_CREST_SOURCE_PATH;

  // Validate/normalize before touching storage or the database, so a
  // missing or corrupt source file fails the whole seed instead of half
  // applying.
  const crestPlan = await planCrestMedia(crestSourcePath);

  // Storage first, rows second (the sibling importers' order): a published
  // media_assets row must never reference an object that is not there yet.
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node 20 lacks a native WebSocket; same shim the sibling importers use.
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
  const bucket = service.storage.from("onzio-media");
  const crestStorageResult = await ensureMediaObject(bucket, crestPlan);

  const client = new PostgresClient({ connectionString: dbUrl });
  await client.connect();
  try {
    const now = SEED_TIMESTAMP;

    const actor = await client.query(
      "select 1 from auth.users where id = $1::uuid",
      [CV_UNITED_LOCAL_PRESENTATION_ACTOR_ID],
    );
    if (actor.rowCount !== 1) {
      throw new Error(
        `Seed auth user ${CV_UNITED_LOCAL_PRESENTATION_ACTOR_ID} is missing. ` +
          "Run `supabase db reset` so supabase/seed.sql applies, then re-run.",
      );
    }

    const { configuration, configurationDigest } =
      buildCrestPresentationConfiguration({
        createdBy: CV_UNITED_LOCAL_PRESENTATION_ACTOR_ID,
        createdAt: now,
      });

    let documentId: string;
    let publicationId: string;

    await client.query("begin");
    try {
      // Insert the clubs row with upsert (idempotent on id)
      await client.query(
        `insert into onzio.clubs
           (id, slug, name, kind, lifecycle, public_access, tier,
            primary_color, secondary_color, store_enabled,
            created_at, updated_at, archived_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, null)
         on conflict (id) do update set
           slug = excluded.slug,
           name = excluded.name,
           kind = excluded.kind,
           lifecycle = excluded.lifecycle,
           public_access = excluded.public_access,
           tier = excluded.tier,
           primary_color = excluded.primary_color,
           secondary_color = excluded.secondary_color,
           store_enabled = excluded.store_enabled,
           updated_at = excluded.updated_at`,
        [
          CV_UNITED_LOCAL_TENANT_ID,
          CV_UNITED_SLUG,
          CV_UNITED_NAME,
          "test",
          "onboarding",
          "preview",
          "starter",
          CV_UNITED_PRIMARY_COLOR,
          CV_UNITED_SECONDARY_COLOR,
          // CV United C1 shop scope: Christian confirmed CV United should
          // actually have the kit/merch showcase page live, so seed the
          // operator-only toggle (onzio.clubs.store_enabled) to true rather
          // than leaving it at the column default (false).
          true,
          now,
        ],
      );

      // Insert the verified primary local domain row (required for
      // getClubContextBySlug's tenant resolution to succeed at all).
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
        [
          CV_UNITED_LOCAL_DOMAIN_ID,
          CV_UNITED_LOCAL_TENANT_ID,
          CV_UNITED_LOCAL_HOSTNAME,
          now,
        ],
      );

      // presentation_documents rows are immutable/insert-only by design
      // (mirrors MLA's seed script). The current configuration is looked up
      // by digest; when it has never been published for this club, the next
      // version is inserted -- history is appended to, never rewritten.
      const existingDocument = await client.query(
        `select id from onzio.presentation_documents
          where club_id = $1 and configuration_digest = $2
          order by version desc limit 1`,
        [CV_UNITED_LOCAL_TENANT_ID, configurationDigest],
      );
      if (existingDocument.rowCount === 1) {
        documentId = existingDocument.rows[0].id as string;
      } else {
        const nextVersion = await client.query(
          `select coalesce(max(version), 0)::integer + 1 as version
             from onzio.presentation_documents where club_id = $1`,
          [CV_UNITED_LOCAL_TENANT_ID],
        );
        const version = nextVersion.rows[0].version as number;
        documentId = deterministicUuid(
          `onzio:${CV_UNITED_SLUG}:presentation:crest@1:v${version}:${configurationDigest}`,
        );
        await client.query(
          `insert into onzio.presentation_documents
             (id, club_id, version, schema_version, template_id,
              template_version, configuration, configuration_digest,
              created_by, created_at)
           values ($1, $2, $3, 1, 'crest', 1, $4::jsonb, $5, $6, $7)
           on conflict (id) do nothing`,
          [
            documentId,
            CV_UNITED_LOCAL_TENANT_ID,
            version,
            JSON.stringify(configuration),
            configurationDigest,
            CV_UNITED_LOCAL_PRESENTATION_ACTOR_ID,
            now,
          ],
        );
      }

      const previousState = await client.query(
        `select published_document_id from onzio.presentation_state
          where club_id = $1`,
        [CV_UNITED_LOCAL_TENANT_ID],
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
        [CV_UNITED_LOCAL_TENANT_ID, documentId, CV_UNITED_LOCAL_PRESENTATION_ACTOR_ID, now],
      );

      publicationId = deterministicUuid(
        `onzio:${CV_UNITED_SLUG}:presentation-publication:${configurationDigest}`,
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
          CV_UNITED_LOCAL_TENANT_ID,
          previousDocumentId === documentId ? null : previousDocumentId,
          documentId,
          configurationDigest,
          JSON.stringify({ valid: true, errors: [], warnings: [] }),
          CV_UNITED_LOCAL_PRESENTATION_ACTOR_ID,
          now,
        ],
      );

      // Published crest row, byte-identical in shape to seed-mla-local.ts's
      // media_assets insert: published rows live in onzio-media with
      // published_at set (enforced by the table check), dimensions/checksum
      // of the *normalized* bytes.
      await client.query(
        `insert into onzio.media_assets
           (id, club_id, storage_bucket, storage_path, surface, media_kind,
            mime_type, byte_size, width, height, checksum_sha256, status,
            created_by, created_at, published_at, deleted_at)
         values ($1, $2, 'onzio-media', $3, 'branding', 'graphic',
                 $4, $5, $6, $7, $8, 'published', null, $9, $9, null)
         on conflict (id) do nothing`,
        [
          crestPlan.assetId,
          CV_UNITED_LOCAL_TENANT_ID,
          crestPlan.destinationPath,
          crestPlan.normalized.mimeType,
          crestPlan.normalized.bytes.length,
          crestPlan.normalized.width,
          crestPlan.normalized.height,
          crestPlan.normalized.checksumSha256,
          now,
        ],
      );

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
        [CV_UNITED_LOCAL_TENANT_ID, crestPlan.destinationPath, crestPlan.assetId, now],
      );

      // Insert general interest form (live, free, no waiver required for draft status)
      await client.query(
        `insert into onzio.registration_forms
           (id, club_id, form_type, title, description, status,
            requires_payment, price_cents, currency,
            waiver_text, waiver_version,
            created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, null, null, null, null, $8, $8)
         on conflict (id) do update set
           title = excluded.title,
           description = excluded.description,
           status = excluded.status,
           requires_payment = excluded.requires_payment,
           updated_at = excluded.updated_at`,
        [
          GENERAL_INTEREST_FORM_ID,
          CV_UNITED_LOCAL_TENANT_ID,
          "general_interest",
          "Get Involved with CV United",
          "Sign up to learn more about CV United's programs, updates, and opportunities.",
          "live",
          false,
          now,
        ],
      );

      // Insert academy registration form (draft, requires payment with placeholder price)
      // PLACEHOLDER: price_cents = 1 is obviously-fake and must be replaced before going live
      await client.query(
        `insert into onzio.registration_forms
           (id, club_id, form_type, title, description, status,
            requires_payment, price_cents, currency,
            waiver_text, waiver_version,
            created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, null, $10, $10)
         on conflict (id) do update set
           title = excluded.title,
           description = excluded.description,
           status = excluded.status,
           requires_payment = excluded.requires_payment,
           price_cents = excluded.price_cents,
           currency = excluded.currency,
           updated_at = excluded.updated_at`,
        [
          ACADEMY_REGISTRATION_FORM_ID,
          CV_UNITED_LOCAL_TENANT_ID,
          "academy_registration",
          "2026 Academy Registration",
          "Register for the 2026 academy program. PLACEHOLDER — replace with real price before going live.",
          "draft",
          true,
          1, // PLACEHOLDER: obviously-fake price_cents value
          "usd",
          now,
        ],
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    // Reconcile: verify rows were actually inserted
    const seeded = await client.query(
      `select
         (select count(*)::integer from onzio.clubs where id = $1) as clubs,
         (select count(*)::integer from onzio.club_domains
            where club_id = $1 and is_primary and active
              and verified_at is not null and environment = 'staging') as domains,
         (select count(*)::integer from onzio.registration_forms
            where club_id = $1) as forms,
         (select count(*)::integer from onzio.registration_forms
            where club_id = $1 and form_type = 'general_interest'
              and status = 'live') as general_interest_forms,
         (select count(*)::integer from onzio.registration_forms
            where club_id = $1 and form_type = 'academy_registration'
              and status = 'draft') as academy_draft_forms,
         (select count(*)::integer from onzio.presentation_state
            where club_id = $1 and published_document_id is not null) as published,
         (select count(*)::integer from onzio.media_assets
            where club_id = $1 and id = $2 and status = 'published'
              and storage_bucket = 'onzio-media') as crest_assets,
         (select count(*)::integer from onzio.site_branding
            where club_id = $1 and club_logo_asset_id = $2
              and club_logo_path = $3) as branding`,
      [CV_UNITED_LOCAL_TENANT_ID, crestPlan.assetId, crestPlan.destinationPath],
    );
    const row = seeded.rows[0];
    if (
      row.clubs !== 1 ||
      row.domains !== 1 ||
      row.forms !== 2 ||
      row.general_interest_forms !== 1 ||
      row.academy_draft_forms !== 1 ||
      row.published !== 1 ||
      row.crest_assets !== 1 ||
      row.branding !== 1
    ) {
      throw new Error(`CV United seed reconciliation failed: ${JSON.stringify(row)}`);
    }

    // Log the results
    console.log(
      JSON.stringify({
        tenant: {
          id: CV_UNITED_LOCAL_TENANT_ID,
          slug: CV_UNITED_SLUG,
          name: CV_UNITED_NAME,
        },
        crest: {
          sourcePath: crestSourcePath,
          assetId: crestPlan.assetId,
          storagePath: crestPlan.destinationPath,
          mimeType: crestPlan.normalized.mimeType,
          width: crestPlan.normalized.width,
          height: crestPlan.normalized.height,
          sourceChecksumSha256: crestPlan.sourceChecksumSha256,
          storageObject: crestStorageResult,
        },
        registrationForms: [
          {
            id: GENERAL_INTEREST_FORM_ID,
            formType: "general_interest",
            status: "live",
            requiresPayment: false,
            title: "Get Involved with CV United",
          },
          {
            id: ACADEMY_REGISTRATION_FORM_ID,
            formType: "academy_registration",
            status: "draft",
            requiresPayment: true,
            priceCents: 1,
            currency: "usd",
            title: "2026 Academy Registration",
            priceNote: "PLACEHOLDER — replace with real price before going live",
          },
        ],
        counts: {
          clubs: row.clubs,
          forms: row.forms,
          generalInterestForms: row.general_interest_forms,
          academyDraftForms: row.academy_draft_forms,
          crestAssets: row.crest_assets,
          branding: row.branding,
        },
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
