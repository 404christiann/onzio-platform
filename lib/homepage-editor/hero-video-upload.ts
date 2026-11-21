import {
  abandonHeroVideoUpload, HeroVideoApiError, fetchHomepageRevision, getHeroVideoStatus, markHeroVideoUploaded, revertHeroVideo, startHeroVideoUpload,
  type HeroVideoLive, type HeroVideoStart, type HeroVideoStatus, type HeroVideoUploadTicket,
} from "./hero-video-client";
import { readVideoDuration } from "./hero-video-duration";
import { startTusUpload, type TusUploadHandle, type TusUploadHandlers } from "./hero-video-tus";

export const HERO_VIDEO_POLL_MS = 5_000;
/** How long the upload-finished check stays up before preparing. */
export const HERO_VIDEO_UPLOAD_DONE_MS = 1_200;
/** How many display reads the old poll used to stop after. Watching now continues past this. */
export const HERO_VIDEO_MAX_POLLS = 360;
const AWAITING_KEY = "onzio.heroVideo.pending";

export const HERO_VIDEO_UPLOADING_COPY = "Uploading your video. Keep this page open until the upload finishes.";
export const HERO_VIDEO_PREPARING_COPY = "Preparing your video. This usually takes a few minutes. You can keep editing.";
export const HERO_VIDEO_LIVE_COPY = "Your new video is live.";

export type HeroVideoPhase = "loading" | "idle" | "uploading" | "uploaded" | "preparing" | "reverting" | "live" | "error";
export type HeroVideoError = { code: string; message: string; retry: "status" | "load" | null };
export type HeroVideoState = {
  phase: HeroVideoPhase;
  status: HeroVideoStatus | null;
  progress: { sent: number; total: number } | null;
  /** Set only when GET reported a processing percent. */
  encodeProgress: number | null;
  fileName: string | null;
  error: HeroVideoError | null;
  /** Plain-English line for the aria-live region and the visible status. */
  message: string;
  /** The swap is live but the editor could not learn the new page version: reload before saving. */
  revisionWarning: boolean;
  /** The homepage also changed elsewhere during the swap, so the base revision was left alone. */
  revisionConflict: boolean;
};

export type HeroVideoDeps = {
  getStatus: () => Promise<HeroVideoStatus>;
  start: (file: { name: string; size: number; type: string; durationSeconds?: number }) => Promise<HeroVideoStart>;
  /** The file's duration in seconds when the browser can read it, otherwise `undefined` (the server checks again later). */
  readDuration: (file: File) => Promise<number | undefined>;
  /** Records that the bytes arrived. Display polling never finalizes the swap. */
  markUploaded: (videoGuid: string) => Promise<void>;
  /** Drops a canceled or failed upload that never stored bytes. */
  abandon: (videoGuid: string) => Promise<void>;
  revert: (expectedLiveGuid: string, targetGuid: string) => Promise<HeroVideoLive>;
  startUpload: (file: File, ticket: HeroVideoUploadTicket, handlers: TusUploadHandlers) => TusUploadHandle;
  /**
   * Refetch the homepage revision and update only the editor's base revision, and only when the editor's base is
   * `before` and the fetched revision is `after`. "conflict" means it did not apply.
   */
  refreshRevision: (range: { before: string; after: string }) => Promise<"applied" | "conflict">;
  sleep: (ms: number) => Promise<void>;
};

export function defaultHeroVideoDeps(refreshRevision: HeroVideoDeps["refreshRevision"]): HeroVideoDeps {
  return {
    getStatus: getHeroVideoStatus, start: startHeroVideoUpload, readDuration: readVideoDuration, markUploaded: markHeroVideoUploaded, abandon: abandonHeroVideoUpload, revert: revertHeroVideo,
    startUpload: startTusUpload, refreshRevision, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  };
}

/** Binary megabytes (1 MB = 1024 * 1024 bytes), so a 500 MiB limit reads "500 MB". */
export const megabytes = (bytes: number) => { const mb = bytes / 1024 / 1024; return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`; };

/** One plain-English sentence per server error code. */
export function heroVideoErrorMessage(code: string, context: { maxBytes?: number; replacesPerDay?: number } = {}): string {
  switch (code) {
    case "FILE_TOO_LARGE": return `That video is too large${context.maxBytes ? `. The limit is ${megabytes(context.maxBytes)}` : ""}. Choose a smaller file.`;
    case "VIDEO_TOO_LONG": return "This video is longer than 10 minutes. Use a shorter clip.";
    case "STORED_SIZE_TOO_LARGE": return "This video was too long or too large once processed, so it was removed. Use a shorter clip (up to 10 minutes).";
    case "UNSUPPORTED_TYPE": return "That file is not a video we can use. Choose an MP4 or MOV video.";
    case "DAILY_LIMIT": return `You have used all ${context.replacesPerDay ?? 5} video replacements for today. Try again tomorrow.`;
    case "VIDEO_NOT_CONFIGURED": return "Video uploads are not set up for this site yet. Contact Onzio.";
    case "HERO_VIDEO_NOT_AVAILABLE": return "The hero video can't be changed for this site.";
    case "VIDEO_FAILED": return "That video could not be processed. Try exporting it again as an MP4 and upload it again.";
    case "RESOLUTION_TOO_LOW": return "That video is too small. Use a video that is at least 720p (1280 by 720).";
    case "NOT_CLUB_VIDEO": return "That video does not belong to this club. Upload it again.";
    case "HERO_VIDEO_CHANGED": return "The hero video was changed somewhere else while you were working. We loaded the latest one. Try again if you still want to change it.";
    case "HOMEPAGE_NOT_READY": return "Your homepage isn't set up yet, so the video can't go live. Save the homepage once, then try again.";
    case "NO_PREVIOUS_VIDEO": return "There is no previous hero video to go back to.";
    case "UNAUTHORIZED": case "FORBIDDEN": case "UNAUTHENTICATED": return "You don't have permission to change the hero video. Sign in again or ask an owner.";
    default: return "Something went wrong with the hero video. Your current video is unchanged. Try again in a moment.";
  }
}

/**
 * The safety rule for the editor's base revision after a swap that wrote the homepage: apply `after` only when the
 * editor's base is still `before` and the server is now at `after`. Anything else means another save may sit in
 * between, so nothing is applied and the caller reports "conflict".
 */
export async function applySwapRevision(
  io: { baseRevision: () => string | undefined; fetchRevision: () => Promise<string>; apply: (revision: string) => void },
  range: { before: string; after: string },
): Promise<"applied" | "conflict"> {
  if (io.baseRevision() !== range.before) return "conflict";
  const revision = await io.fetchRevision();
  if (revision !== range.after || io.baseRevision() !== range.before) return "conflict";
  io.apply(revision);
  return "applied";
}

const idle = (status: HeroVideoStatus | null): HeroVideoState => ({ phase: "idle", status, progress: null, encodeProgress: null, fileName: null, error: null, message: "", revisionWarning: false, revisionConflict: false });
const BUSY = new Set<HeroVideoPhase>(["loading", "uploading", "uploaded", "preparing", "reverting"]);

function readAwaiting(): string | null {
  try { return globalThis.sessionStorage?.getItem(AWAITING_KEY) ?? null; } catch { return null; }
}
function writeAwaiting(guid: string) {
  try { globalThis.sessionStorage?.setItem(AWAITING_KEY, guid); } catch { /* private mode */ }
}
function clearAwaiting() {
  try { globalThis.sessionStorage?.removeItem(AWAITING_KEY); } catch { /* private mode */ }
}
const isBusy = (phase: HeroVideoPhase) => BUSY.has(phase);

export type HeroVideoController = ReturnType<typeof createHeroVideoController>;

export function createHeroVideoController(deps: HeroVideoDeps) {
  let state: HeroVideoState = { ...idle(null), phase: "loading" };
  const listeners = new Set<() => void>();
  let run = 0;
  let handle: TusUploadHandle | null = null;
  let pendingGuid: string | null = null;
  let uploadGuid: string | null = null;
  let disposed = false;

  const set = (patch: Partial<HeroVideoState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const ctx = () => ({ maxBytes: state.status?.maxBytes, replacesPerDay: state.status?.replacesPerDay });
  const alive = (token: number) => !disposed && token === run;
  const fail = (error: unknown, retry: HeroVideoError["retry"] = null) => {
    const code = error instanceof HeroVideoApiError ? error.code : "NETWORK";
    const message = code === "NETWORK" ? "We couldn't reach the server. Check your connection and try again." : heroVideoErrorMessage(code, ctx());
    set({ phase: "error", progress: null, encodeProgress: null, error: { code, message, retry }, message });
  };

  const failWith = (code: string, message: string) => set({ phase: "error", progress: null, encodeProgress: null, error: { code, message, retry: null }, message });

  async function reloadStatus() {
    try { set({ status: await deps.getStatus() }); } catch { /* keep what is shown */ }
  }

  async function complete(live: HeroVideoLive, kind: "replace" | "revert") {
    let revisionWarning = false;
    let revisionConflict = false;
    // Only a request that wrote the homepage reports a revision range; otherwise the revision is not ours to touch.
    if (typeof live.revisionBefore === "string" && typeof live.revisionAfter === "string") {
      try { revisionConflict = await deps.refreshRevision({ before: live.revisionBefore, after: live.revisionAfter }) === "conflict"; }
      catch { revisionWarning = true; }
    }
    const before = state.status;
    set({ status: before ? { ...before, liveGuid: live.liveGuid, previousGuid: live.previousGuid, replacesUsedToday: before.replacesUsedToday + (kind === "replace" ? 1 : 0) } : before });
    await reloadStatus();
    clearAwaiting();
    set({
      phase: "live", progress: null, encodeProgress: null, error: null, fileName: null, revisionWarning, revisionConflict,
      message: kind === "replace" ? HERO_VIDEO_LIVE_COPY : "The previous hero video is live again on your site. It went live by itself and did not need Save.",
    });
  }

  function liveFromStatus(status: HeroVideoStatus, guid: string): HeroVideoLive {
    const completion = status.completion?.videoGuid === guid ? status.completion : null;
    return {
      status: "live",
      liveGuid: status.liveGuid,
      previousGuid: status.previousGuid,
      revisionBefore: completion?.revisionBefore ?? null,
      revisionAfter: completion?.revisionAfter ?? null,
    };
  }

  /**
   * Display-only. GET reports a processing percent and notices when the webhook
   * or the cron has already made the video live or failed. It never calls finalize.
   * It keeps reading while this tab is open, so a late result does not wait for a reload.
   */
  async function watch(guid: string, token: number) {
    pendingGuid = guid;
    writeAwaiting(guid);
    set({ phase: "preparing", progress: null, encodeProgress: null, error: null, message: HERO_VIDEO_PREPARING_COPY });
    // Idle only after this tab has seen the row as preparing and it then disappears. An uploading
    // row, or no row yet, means the finish call may have failed while the bytes are already stored.
    let confirmedPreparing = false;
    while (alive(token)) {
      let status: HeroVideoStatus;
      try { status = await deps.getStatus(); }
      catch {
        if (!alive(token)) return;
        await deps.sleep(HERO_VIDEO_POLL_MS);
        continue;
      }
      if (!alive(token)) return;
      if (status.failure) {
        pendingGuid = null;
        clearAwaiting();
        set({ status });
        return fail(new HeroVideoApiError(status.failure.code, "", 422));
      }
      const stillPending = status.pending?.videoGuid === guid;
      if (stillPending && status.pending?.phase !== "uploading") confirmedPreparing = true;
      if (status.liveGuid === guid && !stillPending) {
        pendingGuid = null;
        set({ status });
        return complete(liveFromStatus(status, guid), "replace");
      }
      // The row was cleared after we had seen it preparing, and this guid did not go live.
      if (!stillPending && confirmedPreparing) {
        pendingGuid = null;
        clearAwaiting();
        set({ ...idle(status) });
        return;
      }
      const encodeProgress = stillPending && typeof status.pending?.encodeProgress === "number" ? status.pending.encodeProgress : null;
      set({ phase: "preparing", status, progress: null, encodeProgress, error: null, message: HERO_VIDEO_PREPARING_COPY });
      await deps.sleep(HERO_VIDEO_POLL_MS);
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },

    async load() {
      const token = ++run;
      set({ ...idle(null), phase: "loading" });
      try {
        const status = await deps.getStatus();
        if (!alive(token)) return;
        if (status.pending?.videoGuid) {
          set({ ...idle(status), phase: "preparing", message: HERO_VIDEO_PREPARING_COPY, encodeProgress: typeof status.pending.encodeProgress === "number" ? status.pending.encodeProgress : null });
          void watch(status.pending.videoGuid, token);
          return;
        }
        if (status.failure?.code) {
          set({ ...idle(status) });
          fail(new HeroVideoApiError(status.failure.code, "", 422));
          return;
        }
        const awaiting = readAwaiting();
        if (awaiting && status.liveGuid === awaiting) {
          set({ ...idle(status) });
          await complete(liveFromStatus(status, awaiting), "replace");
          return;
        }
        set({ ...idle(status) });
      } catch (error) { if (alive(token)) fail(error, "load"); }
    },

    async replace(file: File) {
      if (isBusy(state.phase) || !state.status) return;
      const { maxBytes } = state.status;
      if (!file.type.startsWith("video/")) return set({ phase: "error", error: { code: "UNSUPPORTED_TYPE", message: heroVideoErrorMessage("UNSUPPORTED_TYPE"), retry: null }, message: heroVideoErrorMessage("UNSUPPORTED_TYPE") });
      if (file.size > maxBytes) return set({ phase: "error", error: { code: "FILE_TOO_LARGE", message: heroVideoErrorMessage("FILE_TOO_LARGE", ctx()), retry: null }, message: heroVideoErrorMessage("FILE_TOO_LARGE", ctx()) });
      const { maxSeconds } = state.status;
      const token = ++run;
      set({ phase: "uploading", fileName: file.name, progress: { sent: 0, total: file.size }, encodeProgress: null, error: null, revisionWarning: false, revisionConflict: false, message: HERO_VIDEO_UPLOADING_COPY });
      // Read the duration before start so a clip that is too long never uses one of the day's replaces. An unreadable
      // duration (undefined) skips this early check; the server checks Bunny's real length at finalize.
      let durationSeconds: number | undefined;
      try { durationSeconds = await deps.readDuration(file); } catch { durationSeconds = undefined; }
      if (!alive(token)) return;
      if (durationSeconds !== undefined && durationSeconds > maxSeconds) return failWith("VIDEO_TOO_LONG", heroVideoErrorMessage("VIDEO_TOO_LONG"));
      let ticket: HeroVideoStart;
      try { ticket = await deps.start({ name: file.name, size: file.size, type: file.type, ...(durationSeconds === undefined ? {} : { durationSeconds }) }); } catch (error) { if (alive(token)) fail(error); return; }
      if (!alive(token)) { void deps.abandon(ticket.videoGuid).catch(() => undefined); return; }
      uploadGuid = ticket.videoGuid;
      const abandonUpload = () => { const guid = uploadGuid; uploadGuid = null; if (guid) void deps.abandon(guid).catch(() => undefined); };
      handle = deps.startUpload(file, ticket.upload, {
        onProgress: (sent, total) => { if (alive(token)) set({ progress: { sent, total } }); },
        onError: () => {
          if (!alive(token)) return;
          handle = null;
          abandonUpload();
          set({ phase: "error", progress: null, error: { code: "UPLOAD_FAILED", message: "The upload was interrupted and could not continue. Your current hero video is unchanged. Choose the file to try again.", retry: null }, message: "The upload failed. Your current hero video is unchanged." });
        },
        onSuccess: () => {
          if (!alive(token)) return;
          handle = null;
          // Bytes are stored. Cancel and a tus error must not abandon this row.
          uploadGuid = null;
          set({ phase: "uploaded", progress: null, error: null, message: "" });
          void (async () => {
            try { await deps.markUploaded(ticket.videoGuid); } catch { /* the webhook and the cron still finish a video whose bytes arrived */ }
            if (!alive(token)) return;
            await deps.sleep(HERO_VIDEO_UPLOAD_DONE_MS);
            if (!alive(token)) return;
            await watch(ticket.videoGuid, token);
          })();
        },
      });
    },

    cancel() {
      if (state.phase !== "uploading") return;
      run++;
      handle?.abort(); handle = null;
      const guid = uploadGuid;
      uploadGuid = null;
      if (guid) void deps.abandon(guid).catch(() => undefined);
      set({ ...idle(state.status), message: "Upload canceled. Your current hero video is unchanged." });
    },

    async retryStatus() {
      if (state.phase !== "preparing" || !pendingGuid) return;
      await watch(pendingGuid, ++run);
    },

    async revert() {
      const status = state.status;
      if (isBusy(state.phase) || !status?.previousGuid) return;
      const token = ++run;
      set({ phase: "reverting", error: null, revisionWarning: false, revisionConflict: false, message: "Going back to the previous hero video…" });
      try {
        const live = await deps.revert(status.liveGuid, status.previousGuid);
        if (alive(token)) await complete(live, "revert");
      } catch (error) {
        if (!alive(token)) return;
        if (error instanceof HeroVideoApiError && (error.code === "HERO_VIDEO_CHANGED" || error.code === "NO_PREVIOUS_VIDEO")) await reloadStatus();
        fail(error);
      }
    },

    dismiss() { if (state.phase === "error" || state.phase === "live") set({ ...idle(state.status), message: "" }); },

    dispose() { disposed = true; handle?.abort(); handle = null; listeners.clear(); },
  };
}

export { fetchHomepageRevision };
