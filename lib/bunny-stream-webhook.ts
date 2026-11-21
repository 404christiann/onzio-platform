import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bunny Stream encode webhook (https://bunny.net/docs/stream/webhooks).
 * The signature is HMAC-SHA256 of the exact raw body, keyed with the library
 * Read-Only API key, lowercase hex. The version and algorithm headers are required.
 * The webhook status numbers are not the video object's status numbers.
 */

export const BUNNY_STREAM_SIGNATURE_VERSION = "v1";
export const BUNNY_STREAM_SIGNATURE_ALGORITHM = "hmac-sha256";

export type BunnyStreamWebhookEvent = {
  videoLibraryId: number;
  videoGuid: string;
  status: number;
  isLiveStream: boolean;
};

export type BunnyStreamWebhookAction = "ready" | "reject" | "land" | "upload_failed" | "ignore";

export function verifyBunnyStreamSignature(input: {
  rawBody: string;
  signature: string | null;
  version: string | null;
  algorithm: string | null;
  secret: string | null | undefined;
}): boolean {
  const { rawBody, signature, version, algorithm, secret } = input;
  if (!secret || version !== BUNNY_STREAM_SIGNATURE_VERSION || algorithm !== BUNNY_STREAM_SIGNATURE_ALGORITHM) return false;
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

/** Webhook status list from Bunny's Stream webhook docs. 8 is an abandoned upload, not a failed encode. */
const ACTIONS: Record<number, BunnyStreamWebhookAction> = { 0: "land", 1: "land", 2: "land", 3: "ready", 4: "land", 5: "reject", 7: "land", 8: "upload_failed" };

export const classifyBunnyStreamStatus = (status: number): BunnyStreamWebhookAction => ACTIONS[status] ?? "ignore";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseBunnyStreamWebhook(rawBody: string): BunnyStreamWebhookEvent | null {
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return null; }
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const library = record.VideoLibraryId;
  const guid = record.VideoGuid;
  const status = record.Status;
  if (typeof library !== "number" || !Number.isInteger(library)) return null;
  if (typeof guid !== "string" || !GUID.test(guid)) return null;
  if (typeof status !== "number" || !Number.isInteger(status)) return null;
  return { videoLibraryId: library, videoGuid: guid, status, isLiveStream: record.IsLiveStreamWebhook === true };
}
