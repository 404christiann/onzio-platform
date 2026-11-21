import {
  HeroVideoApiError, fetchHomepageRevision, finalizeHeroVideo, getHeroVideoStatus, revertHeroVideo, startHeroVideoUpload,
  type HeroVideoFinalize, type HeroVideoLive, type HeroVideoStart, type HeroVideoStatus, type HeroVideoUploadTicket,
} from "./hero-video-client";
import { startTusUpload, type TusUploadHandle, type TusUploadHandlers } from "./hero-video-tus";

export const HERO_VIDEO_POLL_MS = 5_000;
/** About 30 minutes of polling. */
export const HERO_VIDEO_MAX_POLLS = 360;
const MAX_NETWORK_FAILURES = 3;

export type HeroVideoPhase = "loading" | "idle" | "uploading" | "processing" | "reverting" | "live" | "error";
export type HeroVideoError = { code: string; message: string; retry: "finalize" | "load" | null };
export type HeroVideoState = {
  phase: HeroVideoPhase;
  status: HeroVideoStatus | null;
  progress: { sent: number; total: number } | null;
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
  start: (file: { name: string; size: number; type: string }) => Promise<HeroVideoStart>;
  finalize: (videoGuid: string) => Promise<HeroVideoFinalize>;
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
    getStatus: getHeroVideoStatus, start: startHeroVideoUpload, finalize: finalizeHeroVideo, revert: revertHeroVideo,
    startUpload: startTusUpload, refreshRevision, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  };
}

/** Binary megabytes (1 MB = 1024 * 1024 bytes), so a 500 MiB limit reads "500 MB". */
export const megabytes = (bytes: number) => { const mb = bytes / 1024 / 1024; return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`; };

/** One plain-English sentence per server error code. */
export function heroVideoErrorMessage(code: string, context: { maxBytes?: number; replacesPerDay?: number } = {}): string {
  switch (code) {
    case "FILE_TOO_LARGE": return `That video is too large${context.maxBytes ? `. The limit is ${megabytes(context.maxBytes)}` : ""}. Choose a smaller file.`;
    case "UNSUPPORTED_TYPE": return "That file is not a video we can use. Choose an MP4 or MOV video.";
    case "DAILY_LIMIT": return `You have used all ${context.replacesPerDay ?? 5} video replacements for today. Try again tomorrow.`;
    case "VIDEO_NOT_CONFIGURED": return "Video uploads are not set up for this site yet. Contact Onzio.";
    case "HERO_VIDEO_NOT_AVAILABLE": return "The hero video can't be changed for this site.";
    case "VIDEO_FAILED": return "Bunny could not process that video. Try exporting it again as an MP4 and upload it again.";
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

const idle = (status: HeroVideoStatus | null): HeroVideoState => ({ phase: "idle", status, progress: null, fileName: null, error: null, message: "", revisionWarning: false, revisionConflict: false });
const BUSY = new Set<HeroVideoPhase>(["loading", "uploading", "processing", "reverting"]);
const isBusy = (phase: HeroVideoPhase) => BUSY.has(phase);

export type HeroVideoController = ReturnType<typeof createHeroVideoController>;

export function createHeroVideoController(deps: HeroVideoDeps) {
  let state: HeroVideoState = { ...idle(null), phase: "loading" };
  const listeners = new Set<() => void>();
  let run = 0;
  let handle: TusUploadHandle | null = null;
  let pendingGuid: string | null = null;
  let disposed = false;

  const set = (patch: Partial<HeroVideoState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const ctx = () => ({ maxBytes: state.status?.maxBytes, replacesPerDay: state.status?.replacesPerDay });
  const alive = (token: number) => !disposed && token === run;
  const fail = (error: unknown, retry: HeroVideoError["retry"] = null) => {
    const code = error instanceof HeroVideoApiError ? error.code : "NETWORK";
    const message = code === "NETWORK" ? "We couldn't reach the server. Check your connection and try again." : heroVideoErrorMessage(code, ctx());
    set({ phase: "error", progress: null, error: { code, message, retry }, message });
  };

  const failWith = (code: string, message: string) => set({ phase: "error", progress: null, error: { code, message, retry: null }, message });

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
    set({
      phase: "live", progress: null, error: null, fileName: null, revisionWarning, revisionConflict,
      message: kind === "replace"
        ? "Your new hero video is live on your site. It went live by itself and did not need Save."
        : "The previous hero video is live again on your site. It went live by itself and did not need Save.",
    });
  }

  async function poll(guid: string, token: number) {
    pendingGuid = guid;
    set({ phase: "processing", progress: null, error: null, message: "Bunny is preparing your video. This usually takes a few minutes. You can keep editing." });
    let failures = 0;
    for (let attempt = 0; attempt < HERO_VIDEO_MAX_POLLS; attempt++) {
      let result: HeroVideoFinalize;
      try { result = await deps.finalize(guid); failures = 0; }
      catch (error) {
        if (!alive(token)) return;
        if (error instanceof HeroVideoApiError) {
          if (error.code === "HERO_VIDEO_CHANGED") await reloadStatus();
          pendingGuid = null;
          // Past the browser's own size check, so FILE_TOO_LARGE here means Bunny reported more bytes than declared.
          if (error.code === "FILE_TOO_LARGE") return failWith(error.code, `That video is larger than ${state.status ? megabytes(state.status.maxBytes) : "500 MB"} once uploaded, so it was removed. Choose a smaller file.`);
          return fail(error, null);
        }
        if (++failures >= MAX_NETWORK_FAILURES) return fail(error, "finalize");
        await deps.sleep(HERO_VIDEO_POLL_MS);
        if (!alive(token)) return;
        continue;
      }
      if (!alive(token)) return;
      if (result.status === "live") { pendingGuid = null; return complete(result, "replace"); }
      await deps.sleep(HERO_VIDEO_POLL_MS);
      if (!alive(token)) return;
    }
    const message = "Your video is still processing. This is taking longer than usual. You can keep editing and come back to this page later.";
    set({ phase: "error", error: { code: "PROCESSING_TIMEOUT", message, retry: "finalize" }, message });
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },

    async load() {
      const token = ++run;
      set({ ...idle(null), phase: "loading" });
      try { const status = await deps.getStatus(); if (alive(token)) set({ ...idle(status) }); }
      catch (error) { if (alive(token)) { fail(error, "load"); } }
    },

    async replace(file: File) {
      if (isBusy(state.phase) || !state.status) return;
      const { maxBytes } = state.status;
      if (!file.type.startsWith("video/")) return set({ phase: "error", error: { code: "UNSUPPORTED_TYPE", message: heroVideoErrorMessage("UNSUPPORTED_TYPE"), retry: null }, message: heroVideoErrorMessage("UNSUPPORTED_TYPE") });
      if (file.size > maxBytes) return set({ phase: "error", error: { code: "FILE_TOO_LARGE", message: heroVideoErrorMessage("FILE_TOO_LARGE", ctx()), retry: null }, message: heroVideoErrorMessage("FILE_TOO_LARGE", ctx()) });
      const token = ++run;
      set({ phase: "uploading", fileName: file.name, progress: { sent: 0, total: file.size }, error: null, revisionWarning: false, revisionConflict: false, message: `Uploading ${file.name}…` });
      let ticket: HeroVideoStart;
      try { ticket = await deps.start(file); } catch (error) { if (alive(token)) fail(error); return; }
      if (!alive(token)) return;
      handle = deps.startUpload(file, ticket.upload, {
        onProgress: (sent, total) => { if (alive(token)) set({ progress: { sent, total } }); },
        onError: () => {
          if (!alive(token)) return;
          handle = null;
          set({ phase: "error", progress: null, error: { code: "UPLOAD_FAILED", message: "The upload was interrupted and could not continue. Your current hero video is unchanged. Choose the file to try again.", retry: null }, message: "The upload failed. Your current hero video is unchanged." });
        },
        onSuccess: () => { if (!alive(token)) return; handle = null; void poll(ticket.videoGuid, token); },
      });
    },

    cancel() {
      if (state.phase !== "uploading") return;
      run++;
      handle?.abort(); handle = null;
      set({ ...idle(state.status), message: "Upload canceled. Your current hero video is unchanged." });
    },

    async retryFinalize() {
      if (state.phase !== "error" || !pendingGuid || state.error?.retry !== "finalize") return;
      await poll(pendingGuid, ++run);
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
