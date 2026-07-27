export const CLUB_LOGO_BUCKET = "logos_v2";
export const DEFAULT_CLUB_LOGO_PATH = "Rose City FC Patch Color.png";

export function clubLogoUrl(
  path: string = DEFAULT_CLUB_LOGO_PATH,
): string {
  if (!path) return "";
  if (path.startsWith("/")) return path;
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const bucket = /^[0-9a-f-]{36}\//i.test(path)
    ? "onzio-media"
    : CLUB_LOGO_BUCKET;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodedPath}`;
}
