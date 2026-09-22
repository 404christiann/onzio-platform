import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PNG } from "pngjs";
import WebSocket from "ws";

const supabaseUrl = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const clubId = "11111111-1111-4111-8111-111111111111";
const assetId = "44444444-4444-4444-8444-444444444441";
const storagePath = `${clubId}/branding/${assetId}.png`;

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl)) {
  throw new Error("seed-local-homepage-media.ts only permits a loopback Supabase URL");
}
if (!serviceRoleKey) {
  throw new Error("SUPABASE_TEST_SERVICE_ROLE_KEY is required");
}

const image = new PNG({ width: 64, height: 64 });
for (let index = 0; index < image.data.length; index += 4) {
  image.data[index] = 20;
  image.data[index + 1] = 90;
  image.data[index + 2] = 200;
  image.data[index + 3] = index === 0 ? 0 : 255;
}
const bytes = PNG.sync.write(image);
const checksum = createHash("sha256").update(bytes).digest("hex");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "onzio" },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
});

async function main() {
  const upload = await supabase.storage.from("onzio-media").upload(storagePath, bytes, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: true,
  });
  if (upload.error) throw upload.error;

  const update = await supabase.from("media_assets").update({
    byte_size: bytes.length,
    width: image.width,
    height: image.height,
    checksum_sha256: checksum,
  }).eq("id", assetId).eq("club_id", clubId);
  if (update.error) throw update.error;

  console.log(JSON.stringify({ storagePath, byteSize: bytes.length, width: image.width, height: image.height, checksum }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
