import { randomUUID } from "node:crypto";
import { PNG } from "pngjs";
import {
  publishAuthorizedMedia,
  retirePublishedMedia,
  type MediaAuthorization,
} from "@/lib/media-processing";
import { buildStoragePath } from "@/lib/storage-path";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

function fixture(): Buffer {
  const image = new PNG({ width: 8, height: 8 });
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = 20;
    image.data[offset + 1] = 90;
    image.data[offset + 2] = 200;
    image.data[offset + 3] = offset === 0 ? 0 : 255;
  }
  return PNG.sync.write(image);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Local Supabase environment is required");
  const hostname = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error(`Refusing non-local Supabase host: ${hostname}`);
  }

  const service = createServiceRoleClient();
  const onzio = service.schema("onzio");
  const uploadId = randomUUID();
  const stagingPath = buildStoragePath({
    clubId: CLUB_ID,
    surface: "branding",
    assetId: uploadId,
    extension: "png",
  });
  const bytes = fixture();
  const authorization: MediaAuthorization = {
    version: 1,
    uploadId,
    clubId: CLUB_ID,
    actorId: ACTOR_ID,
    surface: "branding",
    kind: "graphic",
    fileName: "smoke-crest.png",
    mimeType: "image/png",
    claimedSize: bytes.length,
    stagingPath,
    expiresAt: Date.now() + 60_000,
  };

  try {
    const { error: stageError } = await service.storage
      .from("onzio-upload-staging")
      .upload(stagingPath, bytes, {
        contentType: "image/png",
        upsert: false,
      });
    if (stageError) throw stageError;

    const first = await publishAuthorizedMedia(authorization);
    const retry = await publishAuthorizedMedia(authorization);
    if (!retry.idempotent || retry.assetId !== first.assetId) {
      throw new Error("Idempotent retry contract failed");
    }
    const retired = await retirePublishedMedia({
      clubId: CLUB_ID,
      actorId: ACTOR_ID,
      assetId: uploadId,
    });
    console.log(
      JSON.stringify({
        event: "media.pipeline_smoke",
        publishedFormat: first.format,
        alphaPreserved: first.format === "png",
        idempotentRetry: retry.idempotent,
        retired: retired.status === "retired",
      }),
    );
  } finally {
    await service.storage.from("onzio-upload-staging").remove([stagingPath]);
    const { data: assets } = await onzio
      .from("media_assets")
      .select("storage_path")
      .eq("id", uploadId);
    for (const asset of assets ?? []) {
      await service.storage.from("onzio-media").remove([asset.storage_path]);
    }
    await onzio
      .from("media_cleanup_queue")
      .delete()
      .eq("club_id", CLUB_ID)
      .eq("storage_path", stagingPath);
    await onzio
      .from("audit_events")
      .delete()
      .eq("resource_type", "media_asset")
      .eq("resource_id", uploadId);
    await onzio.from("media_assets").delete().eq("id", uploadId);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
