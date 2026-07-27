import type { MediaSurface } from "@/lib/storage-path";

export function onzioMediaStoragePathFromPublicUrl(
  url: string,
  expectedSurface: MediaSurface,
): string | null {
  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/onzio-media/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const path = decodeURIComponent(
      parsed.pathname.slice(markerIndex + marker.length),
    );
    const [clubId, surface, fileName, extra] = path.split("/");
    if (
      extra !== undefined ||
      surface !== expectedSurface ||
      !/^[0-9a-f-]{36}$/i.test(clubId ?? "") ||
      !/^[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i.test(fileName ?? "")
    ) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}
