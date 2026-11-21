import {
  HERO_VIDEO_LIVE_COPY,
  HERO_VIDEO_OTHER_UPLOAD_NOTE,
  HERO_VIDEO_POLL_MS,
  HERO_VIDEO_PREPARING_COPY,
  HERO_VIDEO_SUPERSEDED_COPY,
  HERO_VIDEO_UPLOAD_DONE_MS,
  HERO_VIDEO_UPLOADING_COPY,
} from "@/lib/hero-video-lifecycle";
import {
  abandonHeroVideoUpload, HeroVideoApiError, fetchHomepageRevision, getHeroVideoStatus, markHeroVideoUploaded, revertHeroVideo, startHeroVideoUpload,
  type HeroVideoLive, type HeroVideoStart, type HeroVideoStatus, type HeroVideoUploadTicket,
} from "./hero-video-client";
import { readVideoDuration } from "./hero-video-duration";
import { startTusUpload, type TusUploadHandle, type TusUploadHandlers } from "./hero-video-tus";

export {
  HERO_VIDEO_LIVE_COPY, HERO_VIDEO_OTHER_UPLOAD_NOTE, HERO_VIDEO_POLL_MS,
  HERO_VIDEO_PREPARING_COPY, HERO_VIDEO_SUPERSEDED_COPY, HERO_VIDEO_UPLOAD_DONE_MS, HERO_VIDEO_UPLOADING_COPY,
};

export type HeroVideoPhase = "loading" | "idle" | "uploading" | "uploaded" | "preparing" | "reverting" | "live" | "error";
export type HeroVideoError = { code: string; message: string; retry: "status" | "load" | null };
export type HeroVideoState = {
  phase: HeroVideoPhase;
  status: HeroVideoStatus | null;
  progress: { sent: number; total: number } | null;
  encodeProgress: number | null;
  fileName: string | null;
  error: HeroVideoError | null;
  message: string;
  revisionWarning: boolean;
  revisionConflict: boolean;
};

export type HeroVideoDeps = {
  getStatus: () => Promise<HeroVideoStatus>;
  start: (file: { name: string; size: number; type: string; durationSeconds?: number }) => Promise<HeroVideoStart>;
  readDuration: (file: File) => Promise<number | undefined>;
  markUploaded: (videoGuid: string) => Promise<{ outcome?: string } | void>;
  abandon: (videoGuid: string) => Promise<{ outcome?: string } | void>;
  revert: (expectedLiveGuid: string, targetGuid: string) => Promise<HeroVideoLive>;
  startUpload: (file: File, ticket: HeroVideoUploadTicket, handlers: TusUploadHandlers) => TusUploadHandle;
  refreshRevision: (range: { before: string; after: string }) => Promise<"applied" | "conflict">;
  sleep: (ms: number) => Promise<void>;
};

export function defaultHeroVideoDeps(refreshRevision: HeroVideoDeps["refreshRevision"]): HeroVideoDeps {
  return {
    getStatus: getHeroVideoStatus, start: startHeroVideoUpload, readDuration: readVideoDuration, markUploaded: markHeroVideoUploaded, abandon: abandonHeroVideoUpload, revert: revertHeroVideo,
    startUpload: startTusUpload, refreshRevision, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  };
}

export const megabytes = (bytes: number) => { const mb = bytes / 1024 / 1024; return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`; };

export function heroVideoErrorMessage(code: string, context: { maxBytes?: number; replacesPerDay?: number } = {}): string {
  switch (code) {
    case "FILE_TOO_LARGE": return `That video is too large${context.maxBytes ? `. The limit is ${megabytes(context.maxBytes)}` : ""}. Choose a smaller file.`;
    case "VIDEO_TOO_LONG": return "This video is longer than 10 minutes. Use a shorter clip.";
    case "STORED_SIZE_TOO_LARGE": return "This video was too long or too large once processed, so it was removed. Use a shorter clip (up to 10 minutes).";
    case "UNSUPPORTED_TYPE": return "That file is not a video we can use. Choose an MP4 or MOV video.";
    case "DAILY_LIMIT": return `You have used all ${context.replacesPerDay ?? 5} video replacements for today. Try again tomorrow.`;
    case "VIDEO_NOT_CONFIGURED": return "Video uploads are not set up for this site yet. Contact Onzio.";
    case "HERO_VIDEO_NOT_AVAILABLE": return "The hero video can't be changed for this site.";
    case "VIDEO_PREPARING": return "A video is still being prepared. You can choose a new one when that finishes.";
    case "PREPARE_TIMEOUT": return "Preparing this video took too long. Choose the file to try again.";
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

const idle = (status: HeroVideoStatus | null, message = ""): HeroVideoState => ({
  phase: "idle", status, progress: null, encodeProgress: null, fileName: null, error: null, message, revisionWarning: false, revisionConflict: false,
});
const BLOCKS_REPLACE = new Set<HeroVideoPhase>(["loading", "uploading", "uploaded", "preparing", "reverting"]);

export type HeroVideoView = "idle" | "other_upload" | "timeout" | "preparing" | "live" | "failed" | "superseded";
const IDLE_NOTES: Partial<Record<HeroVideoView, string>> = {
  other_upload: HERO_VIDEO_OTHER_UPLOAD_NOTE, timeout: heroVideoErrorMessage("PREPARE_TIMEOUT"), superseded: HERO_VIDEO_SUPERSEDED_COPY,
};

/**
 * What one status read means, from the server's pending.effective alone. ownGuid is the upload this tab is
 * watching, null on load. A watching tab finishes live after the notice window and keeps polling an uploading row.
 */
export function viewFor(status: HeroVideoStatus, ownGuid: string | null): HeroVideoView {
  const { pending, liveGuid } = status;
  if (ownGuid && pending && pending.videoGuid !== ownGuid) return liveGuid === ownGuid ? "live" : "superseded";
  const effective = pending?.effective;
  if (ownGuid ? liveGuid === ownGuid : (effective === "live" && liveGuid === pending?.videoGuid)) return "live";
  if (effective === "failed") return "failed";
  if (effective === "preparing_overdue") return "timeout";
  if (effective === "uploading_overdue") return "other_upload";
  if (effective === "preparing") return "preparing";
  if (effective === "uploading") return ownGuid ? "preparing" : "other_upload";
  return "idle";
}

export type HeroVideoController = ReturnType<typeof createHeroVideoController>;

export function createHeroVideoController(deps: HeroVideoDeps) {
  let state: HeroVideoState = { ...idle(null), phase: "loading" };
  const listeners = new Set<() => void>();
  let run = 0;
  let handle: TusUploadHandle | null = null;
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
    if (typeof live.revisionBefore === "string" && typeof live.revisionAfter === "string") {
      try { revisionConflict = await deps.refreshRevision({ before: live.revisionBefore, after: live.revisionAfter }) === "conflict"; }
      catch { revisionWarning = true; }
    }
    const before = state.status;
    set({ status: before ? { ...before, liveGuid: live.liveGuid, previousGuid: live.previousGuid, replacesUsedToday: before.replacesUsedToday + (kind === "replace" ? 1 : 0) } : before });
    await reloadStatus();
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

  /** Shows what viewFor says. Resolves true while the tab should keep polling. */
  async function show(status: HeroVideoStatus, guid: string | null) {
    const view = viewFor(status, guid);
    if (view === "preparing") {
      const encode = status.pending?.encodeProgress;
      set({ phase: "preparing", status, progress: null, encodeProgress: typeof encode === "number" ? encode : null, error: null, message: HERO_VIDEO_PREPARING_COPY });
      return true;
    }
    if (view === "live" && guid) {
      set({ status });
      await complete(liveFromStatus(status, guid), "replace");
    } else if (view === "live") set({ ...idle(status), phase: "live", message: HERO_VIDEO_LIVE_COPY });
    else if (view === "failed") {
      set({ ...idle(status) });
      fail(new HeroVideoApiError(status.failure?.code ?? "VIDEO_FAILED", "", 422));
    } else set({ ...idle(status, IDLE_NOTES[view]) });
    return false;
  }

  /** Display-only poll. It never finalizes. */
  async function watch(guid: string, token: number) {
    set({ phase: "preparing", progress: null, encodeProgress: null, error: null, message: HERO_VIDEO_PREPARING_COPY });
    while (alive(token)) {
      let status: HeroVideoStatus | null = null;
      try { status = await deps.getStatus(); } catch { /* try again on the next poll */ }
      if (!alive(token)) return;
      if (status && !(await show(status, guid))) return;
      await deps.sleep(HERO_VIDEO_POLL_MS);
    }
  }

  /** Cancel and a tus error share this. Stale means the bytes had already landed: read once, and keep watching if the row is still ours. */
  function abandon(guid: string, token: number) {
    void deps.abandon(guid).then(async (result) => {
      if (!alive(token) || result?.outcome !== "stale") return;
      const status = await deps.getStatus();
      if (!alive(token)) return;
      const view = viewFor(status, guid);
      if (view === "superseded") set({ ...idle(status, HERO_VIDEO_SUPERSEDED_COPY) });
      else if (view === "preparing") return watch(guid, token);
    }).catch(() => undefined);
  }

  const onPageHide = () => {
    const guid = uploadGuid;
    if (!guid || !handle) return;
    try {
      void fetch("/api/admin/homepage/hero-video", {
        method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "abandon", videoGuid: guid }),
      });
    } catch { /* the deadline and the next start still clean this up */ }
  };

  if (typeof window !== "undefined") window.addEventListener("pagehide", onPageHide);

  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },

    async load() {
      const token = ++run;
      uploadGuid = null;
      handle = null;
      set({ ...idle(null), phase: "loading" });
      try {
        const status = await deps.getStatus();
        if (!alive(token)) return;
        // A swap this tab did not watch shows live without a revision refresh or a replace count change: the status just read is current.
        if (await show(status, null) && status.pending) void watch(status.pending.videoGuid, token);
      } catch (error) { if (alive(token)) fail(error, "load"); }
    },

    async replace(file: File) {
      if (BLOCKS_REPLACE.has(state.phase) || !state.status) return;
      const { maxBytes, maxSeconds } = state.status;
      if (!file.type.startsWith("video/")) return set({ phase: "error", error: { code: "UNSUPPORTED_TYPE", message: heroVideoErrorMessage("UNSUPPORTED_TYPE"), retry: null }, message: heroVideoErrorMessage("UNSUPPORTED_TYPE") });
      if (file.size > maxBytes) return set({ phase: "error", error: { code: "FILE_TOO_LARGE", message: heroVideoErrorMessage("FILE_TOO_LARGE", ctx()), retry: null }, message: heroVideoErrorMessage("FILE_TOO_LARGE", ctx()) });
      const token = ++run;
      set({ phase: "uploading", fileName: file.name, progress: { sent: 0, total: file.size }, encodeProgress: null, error: null, revisionWarning: false, revisionConflict: false, message: HERO_VIDEO_UPLOADING_COPY });
      let durationSeconds: number | undefined;
      try { durationSeconds = await deps.readDuration(file); } catch { durationSeconds = undefined; }
      if (!alive(token)) return;
      if (durationSeconds !== undefined && durationSeconds > maxSeconds) return failWith("VIDEO_TOO_LONG", heroVideoErrorMessage("VIDEO_TOO_LONG"));
      let ticket: HeroVideoStart;
      try { ticket = await deps.start({ name: file.name, size: file.size, type: file.type, ...(durationSeconds === undefined ? {} : { durationSeconds }) }); }
      catch (error) { if (alive(token)) fail(error); return; }
      if (!alive(token)) { void deps.abandon(ticket.videoGuid).catch(() => undefined); return; }
      uploadGuid = ticket.videoGuid;
      handle = deps.startUpload(file, ticket.upload, {
        onProgress: (sent, total) => { if (alive(token)) set({ progress: { sent, total } }); },
        onError: () => {
          if (!alive(token)) return;
          handle = null;
          const guid = uploadGuid;
          uploadGuid = null;
          set({ phase: "error", progress: null, error: { code: "UPLOAD_FAILED", message: "The upload was interrupted and could not continue. Your current hero video is unchanged. Choose the file to try again.", retry: null }, message: "The upload failed. Your current hero video is unchanged." });
          if (guid) abandon(guid, token);
        },
        onSuccess: () => {
          if (!alive(token)) return;
          handle = null;
          uploadGuid = null;
          set({ phase: "uploaded", progress: null, error: null, message: "" });
          void (async () => {
            try { await deps.markUploaded(ticket.videoGuid); } catch { /* webhook and cron still finish bytes that arrived */ }
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
      const token = ++run;
      handle?.abort();
      handle = null;
      const guid = uploadGuid;
      uploadGuid = null;
      set({ ...idle(state.status), message: "Upload canceled. Your current hero video is unchanged." });
      if (guid) abandon(guid, token);
    },

    async retryStatus() {
      const guid = state.status?.pending?.videoGuid;
      if (state.phase !== "preparing" || !guid) return;
      await watch(guid, ++run);
    },

    async revert() {
      const status = state.status;
      if (BLOCKS_REPLACE.has(state.phase) || !status?.previousGuid) return;
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

    dispose() {
      disposed = true;
      handle?.abort();
      handle = null;
      if (typeof window !== "undefined") window.removeEventListener("pagehide", onPageHide);
      listeners.clear();
    },
  };
}

export { fetchHomepageRevision };
