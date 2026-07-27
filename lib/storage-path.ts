import { failContract } from "@/lib/contract-error";

export const MEDIA_SURFACES = [
  "about",
  "branding",
  "homepage",
  "roster",
  "schedule",
  "shop",
  "standings",
] as const;

export type MediaSurface = (typeof MEDIA_SURFACES)[number];
export type MediaExtension = "jpg" | "jpeg" | "png" | "webp";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSIONS = new Set<MediaExtension>(["jpg", "jpeg", "png", "webp"]);
const SURFACES = new Set<string>(MEDIA_SURFACES);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isMediaSurface(value: unknown): value is MediaSurface {
  return typeof value === "string" && SURFACES.has(value);
}

export function isMediaExtension(value: unknown): value is MediaExtension {
  return (
    typeof value === "string" &&
    EXTENSIONS.has(value.toLowerCase() as MediaExtension)
  );
}

export function buildStoragePath(input: {
  clubId: string;
  surface: string;
  assetId: string;
  extension: string;
}): string {
  if (!isUuid(input.clubId)) failContract("INVALID_CLUB_ID");
  if (!isMediaSurface(input.surface)) failContract("INVALID_MEDIA_SURFACE");
  if (!isUuid(input.assetId)) failContract("INVALID_ASSET_ID");
  if (!isMediaExtension(input.extension)) {
    failContract("UNSUPPORTED_MEDIA_TYPE");
  }

  return `${input.clubId.toLowerCase()}/${input.surface}/${input.assetId.toLowerCase()}.${input.extension.toLowerCase()}`;
}

export function parseStoragePath(path: string): {
  clubId: string;
  surface: MediaSurface;
  assetId: string;
  extension: MediaExtension;
} {
  if (
    typeof path !== "string" ||
    path.length > 240 ||
    path.includes("\\") ||
    path.includes("..") ||
    path.startsWith("/") ||
    path.endsWith("/")
  ) {
    failContract("INVALID_STORAGE_PATH");
  }

  const parts = path.split("/");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    failContract("INVALID_STORAGE_PATH");
  }

  const [clubId, surface, fileName] = parts;
  if (!isUuid(clubId)) failContract("INVALID_CLUB_ID");
  if (!isMediaSurface(surface)) failContract("INVALID_MEDIA_SURFACE");

  const fileMatch = /^(.+)\.([^.]+)$/.exec(fileName);
  if (!fileMatch) failContract("INVALID_STORAGE_PATH");
  const [, assetId, extension] = fileMatch;
  if (!isMediaExtension(extension)) failContract("UNSUPPORTED_MEDIA_TYPE");
  if (!isUuid(assetId)) failContract("INVALID_ASSET_ID");

  return {
    clubId: clubId.toLowerCase(),
    surface,
    assetId: assetId.toLowerCase(),
    extension: extension.toLowerCase() as MediaExtension,
  };
}
