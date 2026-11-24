import { createHash } from "node:crypto";

/**
 * The media asset id of the poster made from one video. Deterministic, so the webhook and the daily job, which can both
 * finish the same video, write the same asset and a retry after a crash finds what the first try left. A UUIDv5 (SHA-1 of
 * a fixed namespace and a name) computed here, with no dependency. Sharp-free on purpose: the swap module imports this
 * and must not load an image library. Change the `v1` in the name only if the poster recipe ever changes, so a path's
 * content never changes under a cached URL.
 */
const NAMESPACE = "7f1c4e0a-5d3b-4b6e-9a2f-6c8d1e0b3a42";

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

export function heroPosterAssetId(clubId: string, videoGuid: string): string {
  const hash = createHash("sha1")
    .update(uuidBytes(NAMESPACE))
    .update(`hero-poster/v1/${clubId.toLowerCase()}/${videoGuid.toLowerCase()}`)
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
