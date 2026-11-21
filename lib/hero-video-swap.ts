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
import { classifyBunnyStreamStatus, parseBunnyStreamWebhook, verifyBunnyStreamSignature } from "@/lib/bunny-stream-webhook";
import { DIVERSE_CITY_HERO_VIDEO, DIVERSE_CITY_STORY_VIDEO } from "@/lib/bunny-video";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

// RC-HERO-VIDEO-SWAP: the only module allowed to use the service-role client
// for the hero-video swap RPCs. Server-only; the Bunny key never leaves it.

/**
 * Three separate limits.
 * - HERO_VIDEO_MAX_BYTES is the FILE limit: it is checked on the declared size at start and is a number the UI shows.
 * - HERO_VIDEO_MAX_SECONDS is the DURATION limit: it is checked on the declared duration at start (when the browser
 *   could read it) and on Bunny's measured `length` at finalize, and the UI shows it too. It is what keeps an honest
 *   upload under the stored ceiling: Bunny encodes each rendition at a fixed bitrate (720p 2,800, 480p 1,400,
 *   360p 800, 240p 600 kbps, about 0.7 MB/s for the 240p-720p ladder HERO_VIDEO_RESOLUTIONS builds), so renditions
 *   grow with duration, not with the size of the original. 600 s x 0.7 MB/s is about 420 MB of renditions, about
 *   840 MB even if the MP4 fallback stores a second copy, plus a 500 MB original is about 1,340 MB, under 2,000 MB.
 * - HERO_VIDEO_MAX_STORED_BYTES is a storage CEILING on Bunny's total `storageSize` (original plus renditions) at
 *   finalize. It is not user-facing: it only catches a client that lied about its size or duration.
 */
export const HERO_VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const HERO_VIDEO_MAX_SECONDS = 600;
export const HERO_VIDEO_MAX_STORED_BYTES = 4 * HERO_VIDEO_MAX_BYTES;
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

export type HeroVideoPending = { videoGuid: string; encodeProgress: number | null };
export type HeroVideoFailure = { code: string };
export type HeroVideoCompletion = { videoGuid: string; revisionBefore: string | null; revisionAfter: string | null };

export type HeroVideoState = {
  liveGuid: string;
  previousGuid: string;
  replacesUsedToday: number;
  replacesPerDay: number;
  maxBytes: number;
  maxSeconds: number;
  /** Set only while Bunny is preparing a finished upload. Hidden during the byte upload itself. */
  pending: HeroVideoPending | null;
  failure: HeroVideoFailure | null;
  completion: HeroVideoCompletion | null;
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

type PendingRow = {
  video_guid: string;
  collection_id: string;
  phase: string;
  failure_code: string | null;
  revision_before: string | null;
  revision_after: string | null;
};

function rowOf<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row ? row as T : null;
}

async function scalarRpc(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await onzio().rpc(name, args);
  if (result.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", `${name} failed.`);
  return typeof result.data === "string" ? result.data : "";
}

async function readPending(clubId: string): Promise<PendingRow | null> {
  const result = await onzio().rpc("read_hero_video_pending", { p_club_id: clubId });
  if (result.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not read the video that is still preparing.");
  return rowOf<PendingRow>(result.data);
}

export async function getHeroVideoState(clubId: string): Promise<HeroVideoState> {
  const live = await readLive(clubId);
  const used = await onzio().rpc("hero_video_replaces_today", { p_club_id: clubId });
  if (used.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not read today's video replacement count.");
  const pendingRow = await readPending(clubId);
  let encodeProgress: number | null = null;
  if (pendingRow?.phase === "preparing") {
    try {
      const video = await getVideo(pendingRow.video_guid);
      encodeProgress = video?.encodeProgress ?? null;
    } catch {
      encodeProgress = null;
    }
  }
  return {
    ...live,
    replacesUsedToday: Number(used.data ?? 0),
    replacesPerDay: HERO_VIDEO_REPLACES_PER_DAY,
    maxBytes: HERO_VIDEO_MAX_BYTES,
    maxSeconds: HERO_VIDEO_MAX_SECONDS,
    pending: pendingRow?.phase === "preparing" ? { videoGuid: pendingRow.video_guid, encodeProgress } : null,
    failure: pendingRow?.phase === "failed" && pendingRow.failure_code ? { code: pendingRow.failure_code } : null,
    completion: pendingRow?.phase === "live" ? {
      videoGuid: pendingRow.video_guid,
      revisionBefore: pendingRow.revision_before,
      revisionAfter: pendingRow.revision_after,
    } : null,
  };
}

export async function startHeroVideoUpload(
  clubId: string,
  input: { fileName: string; fileSize: number; mimeType: string; durationSeconds?: number },
): Promise<{ videoGuid: string; upload: BunnyUploadAuthorization; maxBytes: number }> {
  if (!input.mimeType.startsWith("video/")) throw new HeroVideoError(415, "UNSUPPORTED_TYPE", "Choose a video file.");
  if (!(input.fileSize > 0) || input.fileSize > HERO_VIDEO_MAX_BYTES) {
    throw new HeroVideoError(413, "FILE_TOO_LARGE", "That video is larger than 500 MB. Choose a smaller file.");
  }
  // Declared by the browser, so it is only a courtesy check before a slot is used; finalize re-checks Bunny's `length`.
  if (input.durationSeconds !== undefined && input.durationSeconds > HERO_VIDEO_MAX_SECONDS) {
    throw new HeroVideoError(422, "VIDEO_TOO_LONG", `That video is longer than ${HERO_VIDEO_MAX_SECONDS / 60} minutes. Choose a shorter clip.`);
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
  try {
    await scalarRpc("record_hero_video_pending", {
      p_club_id: clubId, p_video_guid: videoGuid, p_collection_id: collectionId, p_phase: "uploading",
    });
  } catch (error) {
    await safeDeleteHeroVideo(clubId, collectionId, videoGuid);
    throw error;
  }
  const expire = Math.floor(Date.now() / 1000) + UPLOAD_WINDOW_SECONDS;
  return { videoGuid, upload: tusUploadAuthorization(videoGuid, expire), maxBytes: HERO_VIDEO_MAX_BYTES };
}

/** The bytes are on the host. GET can now say preparing even if this tab closes. */
export async function markHeroVideoUploaded(clubId: string, videoGuid: string): Promise<void> {
  const outcome = await scalarRpc("record_hero_video_pending", {
    p_club_id: clubId, p_video_guid: videoGuid, p_collection_id: "", p_phase: "preparing",
  });
  if (outcome === "missing") throw new HeroVideoError(404, "NOT_CLUB_VIDEO", "We could not find that upload. Start the upload again.");
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
/**
 * An upload that never received bytes, older than the upload window.
 * Status 0 (Created) and 6 (UploadFailed) match the abandoned rule in sweepStale.
 * A later status can still report storageSize 0 while an encode is slow.
 */
function staleZeroByte(video: { storageSize: number; status: number; dateUploaded: string }) {
  if (video.storageSize !== 0) return false;
  if (video.status !== 0 && video.status !== 6) return false;
  const uploaded = Date.parse(video.dateUploaded);
  return !Number.isNaN(uploaded) && Date.now() - uploaded > UPLOAD_WINDOW_SECONDS * 1000;
}

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
  // The browser uploads straight to Bunny, so the declared size and duration at start are not trustworthy. Bunny's
  // `length` is what it measured, so it is the duration check that counts; 0 means Bunny has not read the file yet and
  // the next poll decides. Bunny's storageSize is the original plus every rendition, so it is compared with the stored
  // ceiling, not the 500 MB file limit. Both only grow or settle and the swap happens at the ready poll, so checking on
  // every poll decides at the poll that matters.
  if (video.length > HERO_VIDEO_MAX_SECONDS) {
    await safeDeleteHeroVideo(clubId, collectionId, videoGuid);
    await sweepStale(clubId, collectionId, videoGuid);
    throw new HeroVideoError(422, "VIDEO_TOO_LONG", `That video is longer than ${HERO_VIDEO_MAX_SECONDS / 60} minutes, so it was removed. Use a shorter clip.`);
  }
  if (video.storageSize > HERO_VIDEO_MAX_STORED_BYTES) {
    await safeDeleteHeroVideo(clubId, collectionId, videoGuid);
    await sweepStale(clubId, collectionId, videoGuid);
    throw new HeroVideoError(413, "STORED_SIZE_TOO_LARGE", `Once processed, this video takes more than 2,000 MB, so it was removed. Use a shorter clip (up to ${HERO_VIDEO_MAX_SECONDS / 60} minutes).`);
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

const TERMINAL_VIDEO = new Set(["VIDEO_FAILED", "VIDEO_TOO_LONG", "RESOLUTION_TOO_LOW", "STORED_SIZE_TOO_LARGE", "NOT_CLUB_VIDEO"]);

type PendingJob = { club_id: string; video_guid: string; collection_id: string; phase: string };

async function settlePending(
  clubId: string,
  videoGuid: string,
  phase: "live" | "failed" | "clear",
  failureCode: string | null,
  revisionBefore: string | null,
  revisionAfter: string | null,
) {
  await scalarRpc("settle_hero_video_pending", {
    p_club_id: clubId,
    p_video_guid: videoGuid,
    p_phase: phase,
    p_failure_code: failureCode,
    p_revision_before: revisionBefore,
    p_revision_after: revisionAfter,
  });
}

async function lookupPending(videoGuid: string): Promise<PendingJob | null> {
  const result = await onzio().rpc("lookup_hero_video_pending", { p_video_guid: videoGuid });
  if (result.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not look up that video.");
  return rowOf<PendingJob>(result.data);
}

/**
 * Bunny Stream encode callback. Signature is checked first. An unknown library
 * is rejected. A guid is handled only when it is the club's pending upload and
 * Bunny still reports it in that club's collection. Finished calls
 * finalizeHeroVideo (already_live on a retry). Failed uses safeDeleteHeroVideo.
 */
export async function applyBunnyStreamWebhook(input: {
  rawBody: string;
  signature: string | null;
  version: string | null;
  algorithm: string | null;
}): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const secret = process.env.BUNNY_STREAM_WEBHOOK_SECRET;
  if (!verifyBunnyStreamSignature({ ...input, secret })) {
    return { httpStatus: 401, body: { error: "INVALID_SIGNATURE" } };
  }
  const event = parseBunnyStreamWebhook(input.rawBody);
  if (!event) return { httpStatus: 400, body: { error: "INVALID_EVENT" } };
  if (String(event.videoLibraryId) !== BUNNY_STREAM_LIBRARY_ID) {
    return { httpStatus: 404, body: { error: "UNKNOWN_LIBRARY" } };
  }
  if (event.isLiveStream) return { httpStatus: 200, body: { received: true, outcome: "ignored" } };

  const job = await lookupPending(event.videoGuid);
  if (!job) return { httpStatus: 200, body: { received: true, outcome: "ignored" } };

  const action = classifyBunnyStreamStatus(event.status);
  if (action === "ignore") return { httpStatus: 200, body: { received: true, outcome: "ignored" } };
  // A Finished delivery can be retried for hours and can arrive after the admin reverted.
  // Only an upload that is still in flight may be finalized. A later one is a no-op.
  if (action === "finalize" && job.phase !== "uploading" && job.phase !== "preparing") {
    return { httpStatus: 200, body: { received: true, outcome: job.phase === "live" ? "already_live" : "ignored" } };
  }

  const video = await getVideo(event.videoGuid);
  if (!video) {
    await settlePending(job.club_id, event.videoGuid, "clear", null, null, null);
    return { httpStatus: 200, body: { received: true, outcome: "ignored" } };
  }
  if (video.collectionId !== job.collection_id) {
    return { httpStatus: 200, body: { received: true, outcome: "ignored" } };
  }

  if (action === "preparing") {
    if (job.phase === "uploading") {
      await scalarRpc("record_hero_video_pending", {
        p_club_id: job.club_id, p_video_guid: event.videoGuid, p_collection_id: job.collection_id, p_phase: "preparing",
      });
    }
    return { httpStatus: 200, body: { received: true, outcome: "preparing" } };
  }

  if (action === "fail") {
    await safeDeleteHeroVideo(job.club_id, job.collection_id, event.videoGuid);
    await settlePending(job.club_id, event.videoGuid, "failed", "VIDEO_FAILED", null, null);
    return { httpStatus: 200, body: { received: true, outcome: "failed" } };
  }

  try {
    const result = await finalizeHeroVideo(job.club_id, event.videoGuid);
    if (result.httpStatus === 202) {
      if (job.phase === "uploading") {
        await scalarRpc("record_hero_video_pending", {
          p_club_id: job.club_id, p_video_guid: event.videoGuid, p_collection_id: job.collection_id, p_phase: "preparing",
        });
      }
      // 2xx tells Bunny the event was delivered and it will not retry. The file is not playable yet.
      return { httpStatus: 503, body: { received: false, outcome: "processing" } };
    }
    const already = result.body.revisionBefore == null && result.body.revisionAfter == null;
    await settlePending(job.club_id, event.videoGuid, "live", null, result.body.revisionBefore ?? null, result.body.revisionAfter ?? null);
    return { httpStatus: 200, body: { received: true, outcome: already ? "already_live" : "live" } };
  } catch (error) {
    if (error instanceof HeroVideoError && TERMINAL_VIDEO.has(error.code)) {
      await settlePending(job.club_id, event.videoGuid, "failed", error.code, null, null);
      return { httpStatus: 200, body: { received: true, outcome: "failed" } };
    }
    throw error;
  }
}

export type HeroVideoBackstopResult = {
  configured: boolean;
  inspected: number;
  finalized: number;
  swept: number;
  failed: number;
};

/**
 * Daily backstop. Finalizes pending uploads Bunny has already finished, and
 * sweeps the rest with the same safeDeleteHeroVideo guards as a manual finalize.
 * A missing API key skips the run so the cron can ship before the key does.
 */
export async function runHeroVideoBackstop(): Promise<HeroVideoBackstopResult> {
  const result: HeroVideoBackstopResult = { configured: true, inspected: 0, finalized: 0, swept: 0, failed: 0 };
  if (!process.env.BUNNY_STREAM_API_KEY) return { ...result, configured: false };
  const listed = await onzio().rpc("list_hero_video_pending");
  if (listed.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not list videos that are still preparing.");
  const jobs = (Array.isArray(listed.data) ? listed.data : []) as PendingJob[];
  for (const job of jobs) {
    result.inspected += 1;
    try {
      const video = await getVideo(job.video_guid);
      if (video && staleZeroByte(video)) {
        const deleted = await safeDeleteHeroVideo(job.club_id, job.collection_id, job.video_guid);
        if (deleted) {
          await settlePending(job.club_id, job.video_guid, "clear", null, null, null);
          await sweepStale(job.club_id, job.collection_id);
          result.swept += 1;
          continue;
        }
      }
      const finished = await finalizeHeroVideo(job.club_id, job.video_guid);
      if (finished.httpStatus === 200) {
        await settlePending(job.club_id, job.video_guid, "live", null, finished.body.revisionBefore ?? null, finished.body.revisionAfter ?? null);
        result.finalized += 1;
      } else {
        await sweepStale(job.club_id, job.collection_id, job.video_guid);
        result.swept += 1;
      }
    } catch (error) {
      if (error instanceof HeroVideoError && TERMINAL_VIDEO.has(error.code)) {
        if (error.code === "NOT_CLUB_VIDEO") await settlePending(job.club_id, job.video_guid, "clear", null, null, null);
        else await settlePending(job.club_id, job.video_guid, "failed", error.code, null, null);
        result.swept += 1;
      } else {
        console.error("hero video backstop failed", { clubId: job.club_id, error: error instanceof Error ? error.name : "unknown" });
        result.failed += 1;
      }
    }
  }
  return result;
}
