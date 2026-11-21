import {
  BUNNY_STREAM_LIBRARY_ID,
  createVideo,
  deleteVideo,
  findOrCreateCollection,
  getVideo,
  listCollectionVideos,
  tusUploadAuthorization,
  videoReadiness,
  type BunnyUploadAuthorization,
} from "@/lib/bunny-stream";
import { DIVERSE_CITY_HERO_VIDEO, DIVERSE_CITY_STORY_VIDEO } from "@/lib/bunny-video";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

// RC-HERO-VIDEO-SWAP: the only module allowed to use the service-role client
// for the hero-video swap RPCs. Server-only; the Bunny key never leaves it.

export const HERO_VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const HERO_VIDEO_REPLACES_PER_DAY = 5;
const UPLOAD_WINDOW_SECONDS = 2 * 60 * 60;
const SWEEP_AGE_MS = 24 * 60 * 60 * 1000;
const PROTECTED_GUIDS: ReadonlySet<string> = new Set([DIVERSE_CITY_HERO_VIDEO.guid, DIVERSE_CITY_STORY_VIDEO.guid]);

export class HeroVideoError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HeroVideoError";
    this.status = status;
    this.code = code;
  }
}

export type HeroVideoState = {
  liveGuid: string;
  previousGuid: string;
  replacesUsedToday: number;
  replacesPerDay: number;
  maxBytes: number;
};

export type HeroVideoLive = { status: "live"; liveGuid: string; previousGuid: string; revisionBefore: string | null; revisionAfter: string | null };
export type FinalizeResult =
  | { httpStatus: 200; body: HeroVideoLive }
  | { httpStatus: 202; body: { status: "processing" } };

type RpcResult = { data: unknown; error: { message?: string } | null };
const onzio = () => createServiceRoleClient().schema("onzio");

function revisions(row: { outcome: string; revision_before?: string | null; revision_after?: string | null }, wrote: string) {
  const did = row.outcome === wrote;
  return { revisionBefore: did ? row.revision_before ?? null : null, revisionAfter: did ? row.revision_after ?? null : null };
}

function firstRow<T>(result: RpcResult, what: string): T {
  if (result.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", `${what} failed.`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", `${what} returned nothing.`);
  return row as T;
}

async function readLive(clubId: string): Promise<{ liveGuid: string; previousGuid: string }> {
  const result = await onzio().from("homepage_revamp_content").select("presentation_config").eq("club_id", clubId).maybeSingle();
  if (result.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not read the homepage video.");
  const config = (result.data as { presentation_config?: { heroVideoGuid?: string; previousHeroVideoGuid?: string } } | null)?.presentation_config;
  return { liveGuid: config?.heroVideoGuid || "", previousGuid: config?.previousHeroVideoGuid || "" };
}

export async function getHeroVideoState(clubId: string): Promise<HeroVideoState> {
  const live = await readLive(clubId);
  const used = await onzio().rpc("hero_video_replaces_today", { p_club_id: clubId });
  if (used.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not read today's video replacement count.");
  return { ...live, replacesUsedToday: Number(used.data ?? 0), replacesPerDay: HERO_VIDEO_REPLACES_PER_DAY, maxBytes: HERO_VIDEO_MAX_BYTES };
}

export async function startHeroVideoUpload(
  clubId: string,
  input: { fileName: string; fileSize: number; mimeType: string },
): Promise<{ videoGuid: string; upload: BunnyUploadAuthorization; maxBytes: number }> {
  if (!input.mimeType.startsWith("video/")) throw new HeroVideoError(415, "UNSUPPORTED_TYPE", "Choose a video file.");
  if (!(input.fileSize > 0) || input.fileSize > HERO_VIDEO_MAX_BYTES) {
    throw new HeroVideoError(413, "FILE_TOO_LARGE", "That video is larger than 500 MB. Choose a smaller file.");
  }
  if (input.fileName.length > 200) throw new HeroVideoError(400, "INVALID_FILE_NAME", "That file name is too long.");

  const consumed = firstRow<{ allowed: boolean }>(
    await onzio().rpc("consume_hero_video_replace", { p_club_id: clubId, p_cap: HERO_VIDEO_REPLACES_PER_DAY }),
    "Replacement limit check",
  );
  if (!consumed.allowed) {
    throw new HeroVideoError(429, "DAILY_LIMIT", "You have reached today's limit of 5 video replacements. Try again tomorrow.");
  }
  const collectionId = await findOrCreateCollection(clubId);
  await sweepStale(clubId, collectionId);
  const videoGuid = await createVideo({ title: `Hero video ${new Date().toISOString()}`, collectionId });
  const expire = Math.floor(Date.now() / 1000) + UPLOAD_WINDOW_SECONDS;
  return { videoGuid, upload: tusUploadAuthorization(videoGuid, expire), maxBytes: HERO_VIDEO_MAX_BYTES };
}

/**
 * Delete a Bunny video only when it is provably this club's, not live, not
 * previous, and not a Diverse City asset. Never throws.
 */
export async function safeDeleteHeroVideo(clubId: string, collectionId: string, guid: string): Promise<boolean> {
  try {
    if (!guid || PROTECTED_GUIDS.has(guid)) return false;
    const state = await readLive(clubId);
    if (guid === state.liveGuid || guid === state.previousGuid) return false;
    const video = await getVideo(guid);
    if (!video || video.collectionId !== collectionId) return false;
    await deleteVideo(guid);
    return true;
  } catch (error) {
    console.error("hero video cleanup failed", { clubId, guid, error: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}

/**
 * Best-effort cleanup of club videos that can no longer matter. Never throws.
 * Created (0) or UploadFailed (6) videos older than the upload token window can
 * never complete; anything else older than 24 h that is not live or previous is
 * orphaned. `safeDeleteHeroVideo` still guards live, previous and Diverse City
 * guids, and `keepGuid` protects the video being finalized.
 */
async function sweepStale(clubId: string, collectionId: string, keepGuid?: string) {
  try {
    const videos = await listCollectionVideos(collectionId);
    const now = Date.now();
    for (const video of videos) {
      if (video.guid === keepGuid) continue;
      const uploaded = Date.parse(video.dateUploaded);
      if (Number.isNaN(uploaded)) continue;
      const age = now - uploaded;
      const abandoned = (video.status === 0 || video.status === 6) && age > UPLOAD_WINDOW_SECONDS * 1000;
      if (!abandoned && age <= SWEEP_AGE_MS) continue;
      await safeDeleteHeroVideo(clubId, collectionId, video.guid);
    }
  } catch (error) {
    console.error("hero video sweep failed", { clubId, error: error instanceof Error ? error.name : "unknown" });
  }
}

export async function finalizeHeroVideo(clubId: string, videoGuid: string): Promise<FinalizeResult> {
  const collectionId = await findOrCreateCollection(clubId);
  const video = await getVideo(videoGuid);
  if (!video || video.collectionId !== collectionId) {
    throw new HeroVideoError(404, "NOT_CLUB_VIDEO", "We could not find that upload. Start the upload again.");
  }
  // The browser uploads straight to Bunny, so the declared size at start is not trustworthy. Bunny's storageSize is
  // the total stored for the video (original plus renditions), so this is a hard ceiling on what Onzio stores per
  // video. It runs on every poll, including while processing.
  if (video.storageSize > HERO_VIDEO_MAX_BYTES) {
    await safeDeleteHeroVideo(clubId, collectionId, videoGuid);
    await sweepStale(clubId, collectionId, videoGuid);
    throw new HeroVideoError(413, "FILE_TOO_LARGE", "That video is larger than 500 MB. Choose a smaller file.");
  }
  const readiness = await videoReadiness(video);
  if (readiness === "failed") {
    await safeDeleteHeroVideo(clubId, collectionId, videoGuid);
    await sweepStale(clubId, collectionId, videoGuid);
    throw new HeroVideoError(422, "VIDEO_FAILED", "That video could not be processed. Try a different file.");
  }
  if (readiness === "resolution_too_low") {
    await safeDeleteHeroVideo(clubId, collectionId, videoGuid);
    await sweepStale(clubId, collectionId, videoGuid);
    throw new HeroVideoError(422, "RESOLUTION_TOO_LOW", "That video is lower than 720p. Choose a higher-resolution video.");
  }
  if (readiness === "processing") return { httpStatus: 202, body: { status: "processing" } };

  const state = await readLive(clubId);
  if (state.liveGuid === videoGuid) return { httpStatus: 200, body: { status: "live", liveGuid: state.liveGuid, previousGuid: state.previousGuid, revisionBefore: null, revisionAfter: null } };

  const swap = firstRow<{ outcome: string; live_guid: string; previous_guid: string; deletable_guid: string | null; revision_before?: string | null; revision_after?: string | null }>(
    await onzio().rpc("swap_hero_video", {
      p_club_id: clubId, p_new_guid: videoGuid, p_library_id: BUNNY_STREAM_LIBRARY_ID, p_expected_live: state.liveGuid,
    }),
    "Video swap",
  );
  if (swap.outcome === "conflict") throw new HeroVideoError(409, "HERO_VIDEO_CHANGED", "The homepage video changed while this was processing. Reload and try again.");
  if (swap.outcome === "missing_row") throw new HeroVideoError(409, "HOMEPAGE_NOT_READY", "The homepage is not set up for a video yet.");
  if (swap.outcome !== "swapped" && swap.outcome !== "already_live") throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not switch the homepage video.");

  if (swap.deletable_guid) await safeDeleteHeroVideo(clubId, collectionId, swap.deletable_guid);
  await sweepStale(clubId, collectionId, videoGuid);
  return { httpStatus: 200, body: { status: "live", liveGuid: swap.live_guid, previousGuid: swap.previous_guid ?? "", ...revisions(swap, "swapped") } };
}

export async function revertHeroVideo(clubId: string, input: { expectedLiveGuid: string; targetGuid: string }): Promise<HeroVideoLive> {
  const row = firstRow<{ outcome: string; live_guid: string; previous_guid: string; revision_before?: string | null; revision_after?: string | null }>(
    await onzio().rpc("revert_hero_video", { p_club_id: clubId, p_expected_live: input.expectedLiveGuid, p_target_guid: input.targetGuid }),
    "Video revert",
  );
  if (row.outcome === "no_previous") throw new HeroVideoError(409, "NO_PREVIOUS_VIDEO", "There is no earlier video to go back to.");
  if (row.outcome === "conflict") throw new HeroVideoError(409, "HERO_VIDEO_CHANGED", "The homepage video changed. Reload and try again.");
  if (row.outcome !== "reverted" && row.outcome !== "already_live") throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not go back to the earlier video.");
  return { status: "live", liveGuid: row.live_guid, previousGuid: row.previous_guid ?? "", ...revisions(row, "reverted") };
}
