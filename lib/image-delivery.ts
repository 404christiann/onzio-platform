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

export type ImageDeliveryMode = "unoptimized";

export type ResilientImageAttempt = "raw" | "failed";

export function imageDeliveryProps(kind: ImageDeliveryKind): {
  unoptimized: true;
} {
  void kind;
  return { unoptimized: true };
}

export function getImageDeliveryMode(
  kind: string,
): ImageDeliveryMode {
  void kind;
  return "unoptimized";
}

export function nextImageDeliveryAttempt(
  _attempt: ResilientImageAttempt,
): ResilientImageAttempt {
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
