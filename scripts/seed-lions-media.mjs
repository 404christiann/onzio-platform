// Local-only Lions Football Club media seed. Publishes the checked-in
// originals under supabase/fixtures/lions-media through the real validation
// and normalization pipeline into the local onzio-media bucket, then wires
// the resulting media_assets rows into site_branding and
// homepage_slideshow_photos. Idempotent: re-running publishes nothing new.
//
// Usage (after `supabase db reset`):
//   eval "$(supabase status -o env 2>/dev/null)"
//   NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
//   SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
//   node scripts/seed-lions-media.mjs

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = dirname(dirname(scriptPath));

// The pipeline modules are TypeScript with tsconfig path aliases, so this
// entrypoint re-executes itself once through the repository's tsx loader —
// the same loader the existing scripts/*.ts entrypoints use.
if (!process.env.SEED_LIONS_MEDIA_UNDER_TSX) {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), scriptPath],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env, SEED_LIONS_MEDIA_UNDER_TSX: "1" },
    },
  );
  process.exit(result.status ?? 1);
}

const { publishAuthorizedMedia } = await import("../lib/media-processing.ts");
const { buildStoragePath } = await import("../lib/storage-path.ts");
const { createServiceRoleClient } = await import(
  "../lib/supabase-service-role.ts"
);

const LIONS_SLUG = "lions";
const LIONS_CLUB_ID = "55555555-5555-4555-8555-555555555555";
const LIONS_OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8";
const FIXTURES_DIR = join(repoRoot, "supabase", "fixtures", "lions-media");

const SLIDESHOW_ROWS = [
  { id: "66666666-6666-4666-8666-666666666601", sortOrder: 0 },
  { id: "66666666-6666-4666-8666-666666666602", sortOrder: 1 },
  { id: "66666666-6666-4666-8666-666666666603", sortOrder: 2 },
  { id: "66666666-6666-4666-8666-666666666604", sortOrder: 3 },
];

const ASSETS = [
  {
    assetId: "44444444-4444-4444-8444-444444444451",
    fileName: "crest.png",
    mimeType: "image/png",
    surface: "branding",
    kind: "graphic",
    stagingExtension: "png",
    wire: "logo",
  },
  {
    assetId: "44444444-4444-4444-8444-444444444452",
    fileName: "crest-white.png",
    mimeType: "image/png",
    surface: "branding",
    kind: "graphic",
    stagingExtension: "png",
    wire: "logo-dark",
  },
  {
    assetId: "44444444-4444-4444-8444-444444444453",
    fileName: "gallery-1.jpg",
    mimeType: "image/jpeg",
    surface: "homepage",
    kind: "photo",
    stagingExtension: "jpg",
    wire: "slideshow",
    slideshowRow: SLIDESHOW_ROWS[0],
  },
  {
    assetId: "44444444-4444-4444-8444-444444444454",
    fileName: "gallery-2.jpg",
    mimeType: "image/jpeg",
    surface: "homepage",
    kind: "photo",
    stagingExtension: "jpg",
    wire: "slideshow",
    slideshowRow: SLIDESHOW_ROWS[1],
  },
  {
    assetId: "44444444-4444-4444-8444-444444444455",
    fileName: "gallery-3.jpg",
    mimeType: "image/jpeg",
    surface: "homepage",
    kind: "photo",
    stagingExtension: "jpg",
    wire: "slideshow",
    slideshowRow: SLIDESHOW_ROWS[2],
  },
  {
    assetId: "44444444-4444-4444-8444-444444444456",
    fileName: "gallery-4.jpg",
    mimeType: "image/jpeg",
    surface: "homepage",
    kind: "photo",
    stagingExtension: "jpg",
    wire: "slideshow",
    slideshowRow: SLIDESHOW_ROWS[3],
  },
];

function requireLocalEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase environment is required");
  }
  const hostname = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error(`Refusing non-local Supabase host: ${hostname}`);
  }
}

async function resolveLionsClubId(onzio) {
  const { data: club, error } = await onzio
    .from("clubs")
    .select("id")
    .eq("slug", LIONS_SLUG)
    .maybeSingle();
  if (error) throw new Error(`Unable to read clubs: ${error.message}`);
  if (!club) {
    throw new Error(
      "Lions club is not seeded. Run `supabase db reset` before this script.",
    );
  }
  if (club.id !== LIONS_CLUB_ID) {
    throw new Error(
      `Seeded lions club id ${club.id} does not match ${LIONS_CLUB_ID}`,
    );
  }
  return club.id;
}

async function publishFixtureAsset(service, onzio, asset) {
  const { data: existing, error: existingError } = await onzio
    .from("media_assets")
    .select("id, storage_path, byte_size, checksum_sha256")
    .eq("id", asset.assetId)
    .eq("club_id", LIONS_CLUB_ID)
    .eq("status", "published")
    .maybeSingle();
  if (existingError) {
    throw new Error(`Unable to read media_assets: ${existingError.message}`);
  }

  const bytes = await readFile(join(FIXTURES_DIR, asset.fileName));
  const stagingPath = buildStoragePath({
    clubId: LIONS_CLUB_ID,
    surface: asset.surface,
    assetId: asset.assetId,
    extension: asset.stagingExtension,
  });

  if (!existing) {
    const { error: stageError } = await service.storage
      .from("onzio-upload-staging")
      .upload(stagingPath, bytes, {
        contentType: asset.mimeType,
        upsert: true,
      });
    if (stageError) {
      throw new Error(
        `Unable to stage ${asset.fileName}: ${stageError.message}`,
      );
    }
  }

  const published = await publishAuthorizedMedia({
    version: 1,
    uploadId: asset.assetId,
    clubId: LIONS_CLUB_ID,
    actorId: LIONS_OWNER_ID,
    surface: asset.surface,
    kind: asset.kind,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    claimedSize: bytes.length,
    stagingPath,
    expiresAt: Date.now() + 5 * 60_000,
  });

  return published;
}

async function wireBranding(onzio, logo, logoDark) {
  const { error } = await onzio
    .from("site_branding")
    .upsert(
      {
        club_id: LIONS_CLUB_ID,
        club_logo_path: logo.storagePath,
        club_logo_asset_id: logo.assetId,
        club_logo_dark_path: logoDark.storagePath,
        club_logo_dark_asset_id: logoDark.assetId,
      },
      { onConflict: "club_id" },
    );
  if (error) throw new Error(`Unable to wire site_branding: ${error.message}`);
}

async function wireSlideshowPhoto(onzio, asset, published) {
  const { error } = await onzio
    .from("homepage_slideshow_photos")
    .upsert(
      {
        id: asset.slideshowRow.id,
        club_id: LIONS_CLUB_ID,
        url: published.publicUrl,
        media_asset_id: published.assetId,
        alt: `Lions Football Club matchday photo ${asset.slideshowRow.sortOrder + 1}`,
        sort_order: asset.slideshowRow.sortOrder,
      },
      { onConflict: "id" },
    );
  if (error) {
    throw new Error(
      `Unable to wire homepage_slideshow_photos: ${error.message}`,
    );
  }
}

async function main() {
  requireLocalEnvironment();
  const service = createServiceRoleClient();
  const onzio = service.schema("onzio");
  await resolveLionsClubId(onzio);

  const results = [];
  for (const asset of ASSETS) {
    const published = await publishFixtureAsset(service, onzio, asset);
    results.push({ asset, published });
  }

  const logo = results.find((r) => r.asset.wire === "logo").published;
  const logoDark = results.find((r) => r.asset.wire === "logo-dark").published;
  await wireBranding(onzio, logo, logoDark);
  for (const { asset, published } of results) {
    if (asset.wire === "slideshow") {
      await wireSlideshowPhoto(onzio, asset, published);
    }
  }

  for (const { asset, published } of results) {
    console.log(
      JSON.stringify({
        event: "lions.media_seeded",
        file: asset.fileName,
        assetId: published.assetId,
        surface: asset.surface,
        kind: asset.kind,
        format: published.format,
        storagePath: published.storagePath,
        byteSize: published.byteSize,
        width: published.width,
        height: published.height,
        checksumSha256: published.checksumSha256,
        alreadyPublished: published.idempotent,
      }),
    );
  }
  console.log(
    JSON.stringify({
      event: "lions.media_seed_complete",
      published: results.filter((r) => !r.published.idempotent).length,
      alreadyPublished: results.filter((r) => r.published.idempotent).length,
      brandingWired: true,
      slideshowWired: SLIDESHOW_ROWS.length,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
