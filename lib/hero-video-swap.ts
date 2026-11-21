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
  type BunnyVideo,
} from "@/lib/bunny-stream";
import { classifyBunnyStreamStatus, parseBunnyStreamWebhook, verifyBunnyStreamSignature } from "@/lib/bunny-stream-webhook";
import { DIVERSE_CITY_HERO_VIDEO, DIVERSE_CITY_STORY_VIDEO } from "@/lib/bunny-video";
import { createServiceRoleClient } from "@/lib/supabase-service-role";
import {
  HERO_VIDEO_MAX_BYTES,
  HERO_VIDEO_MAX_SECONDS,
  HERO_VIDEO_MAX_STORED_BYTES,
  HERO_VIDEO_REPLACES_PER_DAY,
  ORPHAN_SWEEP_MS,
  PREPARE_DEADLINE_MS,
  UPLOAD_WINDOW_MS,
  effectiveHeroUploadState,
  isHeroMp4GraceOpen,
  uploadDeadlineMs,
  type HeroEffective,
  type HeroStoredPhase,
  type HeroVideoEventName,
} from "@/lib/hero-video-lifecycle";

export {
  HERO_VIDEO_MAX_BYTES,
  HERO_VIDEO_MAX_SECONDS,
  HERO_VIDEO_MAX_STORED_BYTES,
  HERO_VIDEO_REPLACES_PER_DAY,
} from "@/lib/hero-video-lifecycle";

// RC-HERO-VIDEO-SWAP: the only module allowed to use the service-role client
// for the hero-video RPCs. Server-only. The Bunny key never leaves it.
// Every state change goes through applyHeroVideoEvent.

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

export type HeroVideoPending = {
  videoGuid: string;
  encodeProgress: number | null;
  phase: HeroStoredPhase;
  effective: HeroEffective;
  deadlineAt: string | null;
};
export type HeroVideoFailure = { code: string };
export type HeroVideoCompletion = { videoGuid: string; revisionBefore: string | null; revisionAfter: string | null };
export type HeroVideoState = {
  liveGuid: string;
  previousGuid: string;
  replacesUsedToday: number;
  replacesPerDay: number;
  maxBytes: number;
  maxSeconds: number;
  pending: HeroVideoPending | null;
  failure: HeroVideoFailure | null;
  completion: HeroVideoCompletion | null;
};
export type HeroVideoLive = { status: "live"; liveGuid: string; previousGuid: string; revisionBefore: string | null; revisionAfter: string | null };
export type Readiness =
  | { status: "processing" }
  | { status: "ready" }
  | { status: "rejected"; code: "VIDEO_FAILED" | "MP4_MISSING" | "VIDEO_TOO_LONG" | "RESOLUTION_TOO_LOW" | "STORED_SIZE_TOO_LARGE" | "NOT_CLUB_VIDEO" };

export type HeroVideoEventResult = {
  outcome: string;
  deleteGuid: string | null;
  phase: string | null;
  replaceCounted: boolean;
  revisionBefore: string | null;
  revisionAfter: string | null;
  used: number | null;
};

type RpcResult = { data: unknown; error: { message?: string } | null };
type PendingRow = {
  video_guid: string;
  collection_id: string;
  phase: HeroStoredPhase;
  failure_code: string | null;
  revision_before: string | null;
  revision_after: string | null;
  started_at?: string;
  landed_at?: string | null;
  deadline_at: string | null;
  replace_counted?: boolean;
  updated_at?: string | null;
};
type EventRow = {
  outcome: string;
  delete_guid: string | null;
  phase: string | null;
  replace_counted: boolean;
  revision_before: string | null;
  revision_after: string | null;
  used: number | null;
  collection_id: string | null;
};

const onzio = () => createServiceRoleClient().schema("onzio");

function firstRow<T>(result: RpcResult, what: string): T {
  if (result.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", `${what} failed.`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", `${what} returned nothing.`);
  return row as T;
}

function rowOf<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row ? row as T : null;
}

async function readLive(clubId: string): Promise<{ liveGuid: string; previousGuid: string }> {
  const result = await onzio().from("homepage_revamp_content").select("presentation_config").eq("club_id", clubId).maybeSingle();
  if (result.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not read the homepage video.");
  const config = (result.data as { presentation_config?: { heroVideoGuid?: string; previousHeroVideoGuid?: string } } | null)?.presentation_config;
  return { liveGuid: config?.heroVideoGuid || "", previousGuid: config?.previousHeroVideoGuid || "" };
}

async function readPending(clubId: string): Promise<PendingRow | null> {
  const result = await onzio().rpc("read_hero_video_pending", { p_club_id: clubId });
  if (result.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not read the video that is still preparing.");
  return rowOf<PendingRow>(result.data);
}

async function lookupPending(videoGuid: string): Promise<(PendingRow & { club_id: string }) | null> {
  const result = await onzio().rpc("lookup_hero_video_pending", { p_video_guid: videoGuid });
  if (result.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not look up that video.");
  return rowOf<PendingRow & { club_id: string }>(result.data);
}

/**
 * Delete a Bunny video only when it is this club's, not live, not previous,
 * and not a Diverse City asset. Never throws.
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

/** The only writer. The database commits the transition, then this deletes delete_guid once, from the collection the same row names. */
export async function applyHeroVideoEvent(input: {
  clubId: string;
  videoGuid: string;
  event: HeroVideoEventName;
  expected: HeroStoredPhase[];
  collectionId?: string | null;
  failureCode?: string | null;
  libraryId?: string | null;
  expectedLive?: string | null;
  cap?: number | null;
  deadlineMs?: number | null;
}): Promise<HeroVideoEventResult> {
  const result = await onzio().rpc("hero_video_event", {
    p_club_id: input.clubId,
    p_video_guid: input.videoGuid,
    p_event: input.event,
    p_expected: input.expected,
    p_collection_id: input.collectionId ?? null,
    p_failure_code: input.failureCode ?? null,
    p_library_id: input.libraryId ?? null,
    p_expected_live: input.expectedLive ?? null,
    p_cap: input.cap ?? null,
    p_deadline_ms: input.deadlineMs ?? null,
  });
  const row = firstRow<EventRow>(result, "Hero video event");
  const mapped: HeroVideoEventResult = {
    outcome: row.outcome,
    deleteGuid: row.delete_guid ?? null,
    phase: row.phase ?? null,
    replaceCounted: row.replace_counted === true,
    revisionBefore: row.revision_before ?? null,
    revisionAfter: row.revision_after ?? null,
    used: row.used ?? null,
  };
  if (mapped.deleteGuid) await safeDeleteHeroVideo(input.clubId, row.collection_id ?? "", mapped.deleteGuid);
  return mapped;
}

/**
 * Read-only. Never deletes a video or a row. effective comes from the stored
 * deadline and updated_at. A live row sends its completion, and reads as live,
 * only for HERO_VIDEO_LIVE_NOTICE_MS after the swap. After that it reads idle.
 */
export async function getHeroVideoState(clubId: string): Promise<HeroVideoState> {
  const live = await readLive(clubId);
  const used = await onzio().rpc("hero_video_replaces_today", { p_club_id: clubId });
  if (used.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not read today's video replacement count.");
  const pendingRow = await readPending(clubId);
  let encodeProgress: number | null = null;
  if (pendingRow?.phase === "preparing") {
    try { encodeProgress = (await getVideo(pendingRow.video_guid))?.encodeProgress ?? null; } catch { encodeProgress = null; }
  }
  const pending = pendingRow ? {
    videoGuid: pendingRow.video_guid,
    encodeProgress,
    phase: pendingRow.phase,
    effective: effectiveHeroUploadState({ phase: pendingRow.phase, deadlineAt: pendingRow.deadline_at, updatedAt: pendingRow.updated_at }, Date.now()),
    deadlineAt: pendingRow.deadline_at,
  } : null;
  return {
    ...live,
    replacesUsedToday: Number(used.data ?? 0),
    replacesPerDay: HERO_VIDEO_REPLACES_PER_DAY,
    maxBytes: HERO_VIDEO_MAX_BYTES,
    maxSeconds: HERO_VIDEO_MAX_SECONDS,
    pending,
    failure: pendingRow?.phase === "failed" && pendingRow.failure_code ? { code: pendingRow.failure_code } : null,
    completion: pendingRow && pending?.effective === "live" ? {
      videoGuid: pendingRow.video_guid,
      revisionBefore: pendingRow.revision_before,
      revisionAfter: pendingRow.revision_after,
    } : null,
  };
}

const dailyLimitError = () =>
  new HeroVideoError(429, "DAILY_LIMIT", `You have reached today's limit of ${HERO_VIDEO_REPLACES_PER_DAY} video replacements. Try again tomorrow.`);

export async function startHeroVideoUpload(
  clubId: string,
  input: { fileName: string; fileSize: number; mimeType: string; durationSeconds?: number },
): Promise<{ videoGuid: string; upload: BunnyUploadAuthorization; maxBytes: number }> {
  if (!input.mimeType.startsWith("video/")) throw new HeroVideoError(415, "UNSUPPORTED_TYPE", "Choose a video file.");
  if (!(input.fileSize > 0) || input.fileSize > HERO_VIDEO_MAX_BYTES) {
    throw new HeroVideoError(413, "FILE_TOO_LARGE", "That video is larger than 500 MB. Choose a smaller file.");
  }
  if (input.durationSeconds !== undefined && input.durationSeconds > HERO_VIDEO_MAX_SECONDS) {
    throw new HeroVideoError(422, "VIDEO_TOO_LONG", `That video is longer than ${HERO_VIDEO_MAX_SECONDS / 60} minutes. Choose a shorter clip.`);
  }
  if (input.fileName.length > 200) throw new HeroVideoError(400, "INVALID_FILE_NAME", "That file name is too long.");

  const used = await onzio().rpc("hero_video_replaces_today", { p_club_id: clubId });
  if (used.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not read today's video replacement count.");
  if (Number(used.data ?? 0) >= HERO_VIDEO_REPLACES_PER_DAY) {
    throw dailyLimitError();
  }

  const collectionId = await findOrCreateCollection(clubId);
  const videoGuid = await createVideo({ title: `Hero video ${new Date().toISOString()}`, collectionId });
  const event = await applyHeroVideoEvent({
    clubId,
    videoGuid,
    event: "start",
    expected: ["uploading", "preparing", "live", "failed", "abandoned"],
    collectionId,
    cap: HERO_VIDEO_REPLACES_PER_DAY,
    deadlineMs: uploadDeadlineMs(),
  });
  if (event.outcome === "at_cap") {
    throw dailyLimitError();
  }
  if (event.outcome === "preparing") {
    throw new HeroVideoError(409, "VIDEO_PREPARING", "A video is still being prepared. You can choose a new one when that finishes.");
  }
  if (event.outcome !== "ok") throw new HeroVideoError(409, "HERO_VIDEO_CHANGED", "The homepage video changed while this was starting. Reload and try again.");
  const expire = Math.floor(Date.now() / 1000) + UPLOAD_WINDOW_MS / 1000;
  return { videoGuid, upload: tusUploadAuthorization(videoGuid, expire), maxBytes: HERO_VIDEO_MAX_BYTES };
}

/** Bytes arrived. A row that is no longer uploading is left alone. */
export function markHeroVideoUploaded(clubId: string, videoGuid: string) {
  return applyHeroVideoEvent({ clubId, videoGuid, event: "land", expected: ["uploading"], deadlineMs: PREPARE_DEADLINE_MS });
}

/** Cancel, a tus error, or a presigned upload failure. A land that already won is a no-op. */
export function abandonHeroVideoUpload(clubId: string, videoGuid: string) {
  return applyHeroVideoEvent({ clubId, videoGuid, event: "abandon", expected: ["uploading"] });
}

export async function revertHeroVideo(clubId: string, input: { expectedLiveGuid: string; targetGuid: string }): Promise<HeroVideoLive> {
  const row = firstRow<{ outcome: string; live_guid: string; previous_guid: string; revision_before?: string | null; revision_after?: string | null }>(
    await onzio().rpc("revert_hero_video", { p_club_id: clubId, p_expected_live: input.expectedLiveGuid, p_target_guid: input.targetGuid }),
    "Video revert",
  );
  if (row.outcome === "no_previous") throw new HeroVideoError(409, "NO_PREVIOUS_VIDEO", "There is no earlier video to go back to.");
  if (row.outcome === "conflict") throw new HeroVideoError(409, "HERO_VIDEO_CHANGED", "The homepage video changed. Reload and try again.");
  if (row.outcome !== "reverted" && row.outcome !== "already_live") throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not go back to the earlier video.");
  const wrote = row.outcome === "reverted";
  return {
    status: "live",
    liveGuid: row.live_guid,
    previousGuid: row.previous_guid ?? "",
    revisionBefore: wrote ? row.revision_before ?? null : null,
    revisionAfter: wrote ? row.revision_after ?? null : null,
  };
}

/** The failure code stored on the row for each way a video can never become ready. The editor words VIDEO_TOO_LONG, RESOLUTION_TOO_LOW and STORED_SIZE_TOO_LARGE for the admin, so they say what to change. */
const READINESS_FAILURE_CODE = { failed: "VIDEO_FAILED", mp4_missing: "MP4_MISSING", resolution_missing: "RESOLUTION_TOO_LOW" } as const;

/** When the pending row's bytes landed, and when it started: the clocks the MP4 grace counts from. */
export type HeroVideoReadinessTiming = { landedAt?: string | null; startedAt?: string | null };

/**
 * Pure. It does not delete, swap, or write the pending row.
 * The webhook and the cron both decide through here, from one Stream API read and nothing else:
 * processing means the video is still encoding (the webhook answers 503 so Bunny retries),
 * rejected means it can never be ready (the caller sends a reject event and answers normally).
 * A Finished video with 720p but no MP4 copy yet is processing for HERO_VIDEO_MP4_GRACE_MS after the
 * bytes landed (timing), and rejected with MP4_MISSING after that, or at once when no time is known.
 * A missing 720p rendition or an Error status rejects at once. A Stream API error throws.
 */
export async function checkReadiness(clubId: string, videoGuid: string, timing: HeroVideoReadinessTiming = {}, now = Date.now()): Promise<Readiness> {
  const collectionId = await findOrCreateCollection(clubId);
  const video = await getVideo(videoGuid);
  if (!video || video.collectionId !== collectionId) return { status: "rejected", code: "NOT_CLUB_VIDEO" };
  if (video.length > HERO_VIDEO_MAX_SECONDS) return { status: "rejected", code: "VIDEO_TOO_LONG" };
  if (video.storageSize > HERO_VIDEO_MAX_STORED_BYTES) return { status: "rejected", code: "STORED_SIZE_TOO_LARGE" };
  const readiness = videoReadiness(video);
  if (readiness.status === "ready") return { status: "ready" };
  if (readiness.status === "not_ready") return { status: "processing" };
  if (readiness.reason === "mp4_missing" && isHeroMp4GraceOpen(timing, now)) return { status: "processing" };
  return { status: "rejected", code: READINESS_FAILURE_CODE[readiness.reason] };
}

const OPEN_PHASES: HeroStoredPhase[] = ["uploading", "preparing"];

const applyReady = (clubId: string, videoGuid: string) =>
  applyHeroVideoEvent({ clubId, videoGuid, event: "ready", expected: OPEN_PHASES, libraryId: BUNNY_STREAM_LIBRARY_ID });
const applyReject = (clubId: string, videoGuid: string, failureCode: string) =>
  applyHeroVideoEvent({ clubId, videoGuid, event: "reject", expected: OPEN_PHASES, failureCode });

const REFUSED = new Map([["INVALID_SIGNATURE", 401], ["INVALID_EVENT", 400], ["UNKNOWN_LIBRARY", 404]]);

/**
 * One outcome per delivery. Signature first, then one event.
 * Status 8 abandons. Status 3 goes live only while the row is still uploading or preparing.
 */
async function webhookOutcome(input: { rawBody: string; signature: string | null; version: string | null; algorithm: string | null }): Promise<string> {
  if (!verifyBunnyStreamSignature({ ...input, secret: process.env.BUNNY_STREAM_WEBHOOK_SECRET })) return "INVALID_SIGNATURE";
  const event = parseBunnyStreamWebhook(input.rawBody);
  if (!event) return "INVALID_EVENT";
  if (String(event.videoLibraryId) !== BUNNY_STREAM_LIBRARY_ID) return "UNKNOWN_LIBRARY";
  const job = event.isLiveStream ? null : await lookupPending(event.videoGuid);
  const action = classifyBunnyStreamStatus(event.status);
  if (!job || action === "ignore") return "ignored";
  const clubId = job.club_id;
  const guid = event.videoGuid;

  if (action === "upload_failed") return (await abandonHeroVideoUpload(clubId, guid)).outcome === "stale" ? "ignored" : "abandoned";
  if (action === "land") {
    await markHeroVideoUploaded(clubId, guid);
    return "preparing";
  }
  if (action === "reject") return (await applyReject(clubId, guid, "VIDEO_FAILED")).outcome === "stale" ? "ignored" : "failed";

  if (!OPEN_PHASES.includes(job.phase)) return job.phase === "live" ? "already_live" : "ignored";
  const readiness = await checkReadiness(clubId, guid, { landedAt: job.landed_at, startedAt: job.started_at });
  if (readiness.status === "processing") return "processing";
  if (readiness.status === "rejected") {
    if (readiness.code === "NOT_CLUB_VIDEO") return "ignored";
    await applyReject(clubId, guid, readiness.code);
    return "failed";
  }
  const { outcome } = await applyReady(clubId, guid);
  return outcome === "swapped" ? "live" : outcome === "stale" ? "already_live" : outcome;
}

/** Bunny Stream encode callback. Every delivery is answered from one place. */
export async function applyBunnyStreamWebhook(input: {
  rawBody: string;
  signature: string | null;
  version: string | null;
  algorithm: string | null;
}): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const outcome = await webhookOutcome(input);
  const refused = REFUSED.get(outcome);
  return {
    httpStatus: refused ?? (outcome === "processing" ? 503 : 200),
    body: refused ? { error: outcome } : { received: outcome !== "processing", outcome },
  };
}

export type HeroVideoBackstopResult = { configured: boolean; inspected: number; finalized: number; swept: number; failed: number };

async function sweepOrphans(clubId: string, collectionId: string, keepGuid?: string) {
  try {
    const videos = await listCollectionVideos(collectionId);
    const now = Date.now();
    for (const video of videos) {
      if (video.guid === keepGuid) continue;
      const uploaded = Date.parse(video.dateUploaded);
      if (Number.isNaN(uploaded) || now - uploaded <= ORPHAN_SWEEP_MS) continue;
      await safeDeleteHeroVideo(clubId, collectionId, video.guid);
    }
  } catch (error) {
    console.error("hero video sweep failed", { clubId, error: error instanceof Error ? error.name : "unknown" });
  }
}

/**
 * Lands, goes live, or rejects a video Bunny has bytes for. Anything else gets an
 * expire event, and the database acts only once the row's deadline has passed.
 */
async function finishOpen(job: PendingRow & { club_id: string }, video: BunnyVideo | null) {
  // Bunny status 0 is still uploading and 6 is UploadFailed. Neither has a usable file.
  if (video && video.status >= 1 && video.status !== 6) {
    if (job.phase === "uploading") await markHeroVideoUploaded(job.club_id, job.video_guid);
    const readiness = await checkReadiness(job.club_id, job.video_guid, { landedAt: job.landed_at, startedAt: job.started_at });
    if (readiness.status === "ready") return applyReady(job.club_id, job.video_guid);
    if (readiness.status === "rejected" && readiness.code !== "NOT_CLUB_VIDEO") return applyReject(job.club_id, job.video_guid, readiness.code);
  }
  const expired = await applyHeroVideoEvent({ clubId: job.club_id, videoGuid: job.video_guid, event: "expire", expected: [job.phase] });
  return expired.outcome === "stale" ? null : expired;
}

/**
 * Daily backstop for open rows. Each one is finished, or sent an expire event
 * that the database refuses until the deadline has passed. Orphan videos older
 * than a day are swept here, not during start.
 */
export async function runHeroVideoBackstop(): Promise<HeroVideoBackstopResult> {
  const result: HeroVideoBackstopResult = { configured: true, inspected: 0, finalized: 0, swept: 0, failed: 0 };
  if (!process.env.BUNNY_STREAM_API_KEY) return { ...result, configured: false };
  const listed = await onzio().rpc("list_hero_video_pending");
  if (listed.error) throw new HeroVideoError(500, "HERO_VIDEO_UNAVAILABLE", "We could not list videos that are still preparing.");
  const jobs = (Array.isArray(listed.data) ? listed.data : []) as Array<PendingRow & { club_id: string }>;
  for (const job of jobs) {
    result.inspected += 1;
    try {
      const finished = await finishOpen(job, await getVideo(job.video_guid));
      if (finished?.outcome === "swapped" || finished?.outcome === "already_live") {
        result.finalized += 1;
        continue;
      }
      if (finished) result.swept += 1;
      await sweepOrphans(job.club_id, job.collection_id, job.video_guid);
    } catch (error) {
      console.error("hero video backstop failed", { clubId: job.club_id, error: error instanceof Error ? error.name : "unknown" });
      result.failed += 1;
    }
  }
  return result;
}
