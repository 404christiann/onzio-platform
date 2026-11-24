import { getVideo } from "@/lib/bunny-stream";
import { fetchVideoThumbnail } from "@/lib/bunny-thumbnail";
import { HERO_POSTER_MIN_WIDTH, isHeroMp4GraceOpen } from "@/lib/hero-video-lifecycle";
import { heroPosterAssetId } from "@/lib/hero-video-poster-id";

/**
 * Makes the hero poster for a video: the still Bunny already generates, run through the normal image pipeline and
 * published as a media asset whose id depends only on the club and the video (see hero-video-poster-id).
 *
 * Two rules shape this file.
 *  - It never throws. A poster problem must never stop a video going live, so every failure comes back as a result
 *    and the caller carries on without a poster; the daily job tries again.
 *  - It loads the image pipeline (sharp, libvips) lazily and inside the try. The webhook and cron routes import this
 *    module, and a native-library load failure must cost a poster, not the route.
 *
 * It has no database client of its own: everything that touches the database or storage lives in media-processing.
 */

export type HeroPosterTiming = { landedAt?: string | null; startedAt?: string | null };

export type HeroPosterResult =
  | { status: "ready"; assetId: string }
  /** The still is not there yet and the video landed recently: the caller waits (the webhook answers 503 so Bunny retries). */
  | { status: "processing" }
  /** No poster this time. The video goes live with the poster it has, and the daily job retries. */
  | { status: "unavailable"; reason: string };

const unavailable = (clubId: string, reason: string): HeroPosterResult => {
  // One line, a club id and a reason code: no URL, no header, no key.
  console.error("hero poster unavailable", { clubId, reason });
  return { status: "unavailable", reason };
};

export async function prepareHeroPoster(input: {
  clubId: string;
  videoGuid: string;
  /** The Bunny collection the club's pending row names; a video in any other collection is refused. */
  collectionId: string;
  timing: HeroPosterTiming;
  now?: number;
}): Promise<HeroPosterResult> {
  try {
    const assetId = heroPosterAssetId(input.clubId, input.videoGuid);
    const media = await import("@/lib/media-processing");
    if (await media.systemPhotoExists(input.clubId, assetId)) return { status: "ready", assetId };

    const video = await getVideo(input.videoGuid);
    if (!video) return unavailable(input.clubId, "VIDEO_MISSING");
    if (video.collectionId !== input.collectionId) return unavailable(input.clubId, "NOT_CLUB_VIDEO");

    const thumbnail = await fetchVideoThumbnail(input.videoGuid, video.thumbnailFileName);
    if (thumbnail.status === "transient") {
      return isHeroMp4GraceOpen(input.timing, input.now ?? Date.now()) ? { status: "processing" } : unavailable(input.clubId, thumbnail.reason);
    }
    if (thumbnail.status === "permanent") return unavailable(input.clubId, thumbnail.reason);

    try {
      await media.publishSystemPhoto({
        clubId: input.clubId,
        surface: "homepage",
        assetId,
        bytes: thumbnail.bytes,
        minimumWidth: HERO_POSTER_MIN_WIDTH,
        source: "hero-video-poster",
      });
    } catch (error) {
      const code = typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code) : "PUBLISH_FAILED";
      return unavailable(input.clubId, code);
    }
    return { status: "ready", assetId };
  } catch {
    return unavailable(input.clubId, "POSTER_FAILED");
  }
}

/**
 * Retires the poster made from a video that is being deleted, unless something still points at it. The poster id
 * is the one prepareHeroPoster would have used, so a video that never had a poster, and a hand-set poster (whose
 * id is random), are both left alone. Never throws.
 */
export async function retireHeroPoster(clubId: string, videoGuid: string): Promise<void> {
  try {
    const media = await import("@/lib/media-processing");
    await media.retirePublishedMedia({ clubId, actorId: null, assetId: heroPosterAssetId(clubId, videoGuid) });
  } catch (error) {
    // Not found is the normal case for a video that never had a poster.
    const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "unknown";
    if (code !== "MEDIA_ASSET_NOT_FOUND") console.error("hero poster cleanup failed", { clubId, reason: code });
  }
}
