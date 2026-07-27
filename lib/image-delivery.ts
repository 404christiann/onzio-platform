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

export function imageDeliveryProps(kind: ImageDeliveryKind): {
  unoptimized?: true;
} {
  return UNOPTIMIZED_KINDS.has(kind) ? { unoptimized: true } : {};
}

export function getImageDeliveryMode(
  kind: string,
): "vercel-optimized" | "unoptimized" {
  return UNOPTIMIZED_KINDS.has(kind as ImageDeliveryKind)
    ? "unoptimized"
    : "vercel-optimized";
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
