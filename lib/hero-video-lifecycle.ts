/**
 * One hero-upload lifecycle, shared by the route, the webhook, the cron, the
 * swap, and the admin client. SQL stores the phase. This module names the
 * clocks and the display state. Nothing here talks to Bunny or the database.
 */

export const UPLOAD_WINDOW_MS = 2 * 60 * 60 * 1000;
export const UPLOAD_GRACE_MS = 15 * 60 * 1000;
export const PREPARE_DEADLINE_MS = 2 * 60 * 60 * 1000;
export const ORPHAN_SWEEP_MS = 24 * 60 * 60 * 1000;
export const HERO_VIDEO_POLL_MS = 5_000;
export const HERO_VIDEO_UPLOAD_DONE_MS = 1_200;
export const HERO_VIDEO_LIVE_NOTICE_MS = 10 * 60 * 1000;

export const HERO_VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const HERO_VIDEO_MAX_SECONDS = 600;
export const HERO_VIDEO_MAX_STORED_BYTES = 4 * HERO_VIDEO_MAX_BYTES;
export const HERO_VIDEO_REPLACES_PER_DAY = 5;

export const HERO_VIDEO_UPLOADING_COPY = "Uploading your video. Keep this page open until the upload finishes.";
export const HERO_VIDEO_PREPARING_COPY = "Preparing your video. This usually takes a few minutes. You can keep editing.";
export const HERO_VIDEO_LIVE_COPY = "Your new video is live.";
export const HERO_VIDEO_OTHER_UPLOAD_NOTE = "An upload is in progress in another window, or it was interrupted. Choosing a new video replaces it.";
export const HERO_VIDEO_SUPERSEDED_COPY = "A newer upload replaced this one.";

export type HeroStoredPhase = "uploading" | "preparing" | "live" | "failed" | "abandoned";
export type HeroEffective = "idle" | "uploading" | "uploading_overdue" | "preparing" | "preparing_overdue" | "live" | "failed" | "abandoned";
export type HeroVideoEventName = "start" | "land" | "ready" | "reject" | "abandon" | "expire";

export type HeroLifecycleRow = {
  phase: HeroStoredPhase;
  deadlineAt: string | null;
  /** The row's updated_at. A live row is announced only while this is inside HERO_VIDEO_LIVE_NOTICE_MS. */
  updatedAt?: string | null;
};

/** Milliseconds the SQL stores as deadline_at when an upload starts. The tus token itself expires at UPLOAD_WINDOW_MS. */
export function uploadDeadlineMs() {
  return UPLOAD_WINDOW_MS + UPLOAD_GRACE_MS;
}

/** True while a live row is young enough to announce. A missing or unreadable updated_at is never announced. */
export function isHeroLiveNoticeFresh(updatedAt: string | null | undefined, now: number) {
  const updated = Date.parse(updatedAt ?? "");
  return !Number.isNaN(updated) && now - updated < HERO_VIDEO_LIVE_NOTICE_MS;
}

/**
 * What the editor should show. Overdue is derived from deadline_at. A live row
 * is live for HERO_VIDEO_LIVE_NOTICE_MS after updated_at and idle after that,
 * so a later page load never announces an old swap. A missing row is idle.
 */
export function effectiveHeroUploadState(row: HeroLifecycleRow | null | undefined, now: number): HeroEffective {
  if (!row) return "idle";
  if (row.phase === "live") return isHeroLiveNoticeFresh(row.updatedAt, now) ? "live" : "idle";
  if (row.phase === "failed" || row.phase === "abandoned") return row.phase;
  const deadline = Date.parse(row.deadlineAt ?? "");
  const overdue = !Number.isNaN(deadline) && now >= deadline;
  if (row.phase === "uploading") return overdue ? "uploading_overdue" : "uploading";
  if (row.phase === "preparing") return overdue ? "preparing_overdue" : "preparing";
  return "idle";
}

/** Bunny video status: 0 is still being uploaded, 6 is UploadFailed. Either one has no usable file. */
export function videoHasBytes(video: { status: number } | null | undefined) {
  return !!video && video.status >= 1 && video.status !== 6;
}

/**
 * The cron may abandon an upload only once its deadline has passed and Bunny
 * still has no bytes. A slow upload inside the window stays.
 */
export function shouldExpireUpload(row: HeroLifecycleRow, now: number, hasBytes: boolean) {
  if (hasBytes || row.phase !== "uploading") return false;
  return effectiveHeroUploadState(row, now) === "uploading_overdue";
}

/** The cron may fail a prepare only once its deadline has passed and the file is still not ready. */
export function shouldExpirePrepare(row: HeroLifecycleRow, now: number) {
  if (row.phase !== "preparing") return false;
  return effectiveHeroUploadState(row, now) === "preparing_overdue";
}
