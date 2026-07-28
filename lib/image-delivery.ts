export type ImageDeliveryKind =
  | "photograph"
  | "hero-photo"
  | "roster-photo"
  | "shop-photo"
  | "club-logo"
  | "flag"
  | "sponsor-logo"
  | "opponent-crest"
  | "small-graphic";

const UNOPTIMIZED_KINDS = new Set<ImageDeliveryKind>([
  "club-logo",
  "flag",
  "sponsor-logo",
  "opponent-crest",
  "small-graphic",
]);

const ORIGIN_FALLBACK_KINDS = new Set<ImageDeliveryKind>(["roster-photo"]);

export type ImageDeliveryMode =
  | "vercel-optimized"
  | "vercel-optimized-with-origin-fallback"
  | "unoptimized";

export type ResilientImageAttempt = "optimized" | "raw" | "failed";

export function imageDeliveryProps(kind: ImageDeliveryKind): {
  unoptimized?: true;
} {
  return UNOPTIMIZED_KINDS.has(kind) ? { unoptimized: true } : {};
}

export function getImageDeliveryMode(
  kind: string,
): ImageDeliveryMode {
  if (UNOPTIMIZED_KINDS.has(kind as ImageDeliveryKind)) {
    return "unoptimized";
  }
  return ORIGIN_FALLBACK_KINDS.has(kind as ImageDeliveryKind)
    ? "vercel-optimized-with-origin-fallback"
    : "vercel-optimized";
}

export function nextImageDeliveryAttempt(
  attempt: ResilientImageAttempt,
): ResilientImageAttempt {
  if (attempt === "optimized") return "raw";
  return "failed";
}

export function assertAllowedImageUrl(url: string): string {
  if (/\/storage\/v1\/render\/image\//.test(url)) {
    const error = new Error(
      "Supabase runtime image transformations are forbidden",
    ) as Error & { code: string };
    error.code = "SUPABASE_TRANSFORM_FORBIDDEN";
    throw error;
  }
  return url;
}
