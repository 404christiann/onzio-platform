import { bunnyVideoThumbnailUrl } from "@/lib/bunny-video";

/**
 * The still Bunny makes for each video, read from the pull-zone CDN. Kept apart from lib/bunny-stream.ts on purpose:
 * that module only ever calls the authenticated Stream API, and this one only ever calls the CDN and never holds the
 * AccessKey, so no request can mix the two.
 */

/** Most bytes read from the CDN for a still. Bunny's are tens of KB; anything past this is not one. */
export const BUNNY_THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;
const THUMBNAIL_TIMEOUT_MS = 5_000;

export type BunnyThumbnailResult =
  | { status: "ok"; bytes: Buffer }
  /** Not there yet (404, a timeout, a 5xx, a dropped connection): worth asking again shortly. */
  | { status: "transient"; reason: "NOT_FOUND" | "TIMEOUT" | "UNAVAILABLE" }
  /** Will not get better by waiting: refused, redirected, too big, no Referer to send, or a malformed request. */
  | { status: "permanent"; reason: "FORBIDDEN" | "REDIRECTED" | "TOO_LARGE" | "NO_REFERER" | "BAD_REQUEST" };

/**
 * The Referer the CDN's hotlink rule wants. The rule only refuses an empty one, so this is not authentication and carries
 * no secret. The value comes from the environment and is never written into code or logs: BUNNY_STREAM_CDN_REFERER when
 * set, else the production site Vercel names for the project.
 */
function cdnReferer(): string | null {
  const configured = process.env.BUNNY_STREAM_CDN_REFERER?.trim();
  if (configured) return configured;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host.replace(/^https?:\/\//, "")}/` : null;
}

/**
 * Reads the still Bunny made for a video, from the pull-zone CDN. The Stream API has no endpoint that returns it, and the
 * CDN is not the API host: the AccessKey is never sent here. A fixed host, a guid-checked path, no redirects, a 5 s limit
 * and a byte cap. Never throws; the caller decides what each result means.
 */
export async function fetchVideoThumbnail(guid: string, fileName?: string | null): Promise<BunnyThumbnailResult> {
  const url = bunnyVideoThumbnailUrl(guid, fileName);
  if (!url) return { status: "permanent", reason: "BAD_REQUEST" };
  const referer = cdnReferer();
  if (!referer) return { status: "permanent", reason: "NO_REFERER" };
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", redirect: "manual", headers: { referer, accept: "image/*" }, signal: AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS) });
  } catch (error) {
    return { status: "transient", reason: error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "TIMEOUT" : "UNAVAILABLE" };
  }
  if (response.status >= 300 && response.status < 400) return { status: "permanent", reason: "REDIRECTED" };
  if (response.status === 404) return { status: "transient", reason: "NOT_FOUND" };
  if (response.status === 401 || response.status === 403) return { status: "permanent", reason: "FORBIDDEN" };
  if (!response.ok) return { status: "transient", reason: "UNAVAILABLE" };
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > BUNNY_THUMBNAIL_MAX_BYTES) return { status: "permanent", reason: "TOO_LARGE" };
  try {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > BUNNY_THUMBNAIL_MAX_BYTES) return { status: "permanent", reason: "TOO_LARGE" };
    return { status: "ok", bytes };
  } catch {
    return { status: "transient", reason: "UNAVAILABLE" };
  }
}
