import { afterEach, describe, expect, it, vi } from "vitest";
import { homepageDraft, SAVE_OPERATION } from "../fixtures/homepage-editor";
import { buildHomepageSaveRequest } from "@/lib/homepage-editor/adapter";
import { resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { createHomepageEditorState, getDirtyHomepageSections, reduceHomepageEditor, type HomepageEditorState } from "@/lib/homepage-editor/model";
import { defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { HeroVideoApiError, abandonHeroVideoUpload, fetchHomepagePresentation, fetchHomepageRevision, markHeroVideoUploaded, startHeroVideoUpload, type HeroVideoStatus } from "@/lib/homepage-editor/hero-video-client";
import { readVideoDuration } from "@/lib/homepage-editor/hero-video-duration";
import { HERO_VIDEO_REPLACES_PER_DAY } from "@/lib/hero-video-lifecycle";
import {
  HERO_VIDEO_FAILED_COPY, HERO_VIDEO_KEEP_OPEN_COPY, HERO_VIDEO_LEAVE_COPY, HERO_VIDEO_LIVE_COPY, HERO_VIDEO_OTHER_UPLOAD_NOTE, HERO_VIDEO_PROCESSING_COPY,
  HERO_VIDEO_SUPERSEDED_COPY, HERO_VIDEO_UPLOADING_COPY,
  applySwapRevision, megabytes, createHeroVideoController, heroVideoErrorMessage, heroVideoHint, viewFor, type HeroVideoDeps, type HeroVideoView,
} from "@/lib/homepage-editor/hero-video-upload";

const tus = vi.hoisted(() => ({ instances: [] as { file: unknown; options: Record<string, (...a: unknown[]) => void> & { headers: Record<string, string>; metadata: Record<string, string>; retryDelays: number[]; endpoint: string }; start: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }[] }));
vi.mock("tus-js-client", () => ({
  Upload: class {
    start = vi.fn(); abort = vi.fn(async () => undefined);
    constructor(public file: unknown, public options: never) { tus.instances.push(this as never); }
  },
}));

const STATUS = { liveGuid: "live-1", previousGuid: "prev-1", replacesUsedToday: 2, replacesPerDay: 10, maxBytes: 524_288_000, maxSeconds: 600 };
const RANGE = { revisionBefore: "rev-1", revisionAfter: "rev-2" };
const TICKET = { videoGuid: "new-guid", upload: { endpoint: "https://video.bunnycdn.com/tusupload", libraryId: 723074, videoId: "new-guid", expire: 1_900_000_000, signature: "sig", enabledResolutions: "240p,360p,480p,720p" }, maxBytes: STATUS.maxBytes };
const video = (size = 10_000_000, type = "video/mp4") => ({ name: "hero.mp4", size, type }) as unknown as File;
const apiError = (code: string, httpStatus = 422) => new HeroVideoApiError(code, "server words", httpStatus);

function harness(overrides: Partial<HeroVideoDeps> = {}) {
  const handlers: { current: Parameters<HeroVideoDeps["startUpload"]>[2] | null } = { current: null };
  const abort = vi.fn();
  const deps: HeroVideoDeps = {
    getStatus: vi.fn(async () => STATUS),
    start: vi.fn(async () => TICKET),
    readDuration: vi.fn(async () => undefined),
    markUploaded: vi.fn(async () => undefined),
    abandon: vi.fn(async () => undefined),
    revert: vi.fn(async () => ({ status: "live" as const, liveGuid: "prev-1", previousGuid: "live-1", ...RANGE })),
    startUpload: vi.fn((_file, _ticket, h) => { handlers.current = h; return { abort }; }),
    refreshRevision: vi.fn(async () => "applied" as const),
    refreshPresentation: vi.fn(async () => undefined),
    sleep: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps, handlers, abort, controller: createHeroVideoController(deps) };
}
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

afterEach(() => { vi.unstubAllGlobals(); tus.instances.length = 0; });

describe("hero video control: size text", () => {
  it("uses binary megabytes so the 500 MiB limit reads 500 MB", () => {
    expect(megabytes(524_288_000)).toBe("500 MB");
    expect(megabytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(megabytes(1024 * 1024 * 42.4)).toBe("42 MB");
  });
});

describe("hero video control: loading and pre-checks", () => {
  it("loads the live video, previous video and replace allowance", async () => {
    const { controller } = harness();
    expect(controller.getState().phase).toBe("loading");
    await controller.load();
    expect(controller.getState()).toMatchObject({ phase: "idle", status: STATUS });
  });

  it("rejects a non-video file and an oversized file before any request", async () => {
    const { controller, deps } = harness();
    await controller.load();
    await controller.replace(video(1000, "image/png"));
    expect(controller.getState().error?.code).toBe("UNSUPPORTED_TYPE");
    await controller.replace(video(STATUS.maxBytes + 1));
    expect(controller.getState().error?.message).toMatch(/too large.*500 MB/);
    expect(deps.start).not.toHaveBeenCalled();
    expect(controller.getState().status).toEqual(STATUS);
  });
});

describe("hero video control: duration cap", () => {
  const TOO_LONG = "This video is longer than 10 minutes. Use a shorter clip.";

  it("a stubbed duration of 601 s fails at once with the VIDEO_TOO_LONG message, never starting or using a slot", async () => {
    const { controller, deps } = harness({ readDuration: vi.fn(async () => 601) });
    await controller.load();
    await controller.replace(video());
    expect(controller.getState()).toMatchObject({ phase: "error", error: { code: "VIDEO_TOO_LONG", retry: null, message: TOO_LONG }, progress: null, status: STATUS });
    expect(controller.getState().message).toBe(TOO_LONG);
    expect(deps.start).not.toHaveBeenCalled();
    expect(deps.startUpload).not.toHaveBeenCalled();
    await controller.replace(video());
    expect(deps.readDuration).toHaveBeenCalledTimes(2);
    expect(deps.start).not.toHaveBeenCalled();
  });

  it("an unknown duration (undefined) still starts, without durationSeconds", async () => {
    const { controller, deps } = harness({ readDuration: vi.fn(async () => undefined) });
    await controller.load();
    await controller.replace(video());
    expect(controller.getState().phase).toBe("uploading");
    expect(deps.start).toHaveBeenCalledTimes(1);
    expect(deps.start).toHaveBeenCalledWith({ name: "hero.mp4", size: 10_000_000, type: "video/mp4" });
    expect(vi.mocked(deps.start).mock.calls[0][0]).not.toHaveProperty("durationSeconds");
  });

  it.each([[120], [600]])("a known duration of %s s starts with durationSeconds in the start request", async seconds => {
    const { controller, deps } = harness({ readDuration: vi.fn(async () => seconds) });
    await controller.load();
    const file = video();
    await controller.replace(file);
    expect(controller.getState().phase).toBe("uploading");
    expect(deps.readDuration).toHaveBeenCalledWith(file);
    expect(deps.start).toHaveBeenCalledExactlyOnceWith({ name: "hero.mp4", size: 10_000_000, type: "video/mp4", durationSeconds: seconds });
    expect(deps.startUpload).toHaveBeenCalledTimes(1);
  });

  it("reads the duration only after the type and size checks pass", async () => {
    const { controller, deps } = harness();
    await controller.load();
    await controller.replace(video(1000, "image/png"));
    await controller.replace(video(STATUS.maxBytes + 1));
    expect(deps.readDuration).not.toHaveBeenCalled();
  });

  it("stays busy while the metadata is read, so a second pick is ignored", async () => {
    let release: (seconds: number | undefined) => void = () => undefined;
    const readDuration = vi.fn(() => new Promise<number | undefined>(resolve => { release = resolve; }));
    const { controller, deps } = harness({ readDuration });
    await controller.load();
    const first = controller.replace(video());
    expect(controller.getState().phase).toBe("uploading");
    await controller.replace(video());
    expect(readDuration).toHaveBeenCalledTimes(1);
    release(30);
    await first;
    expect(deps.start).toHaveBeenCalledTimes(1);
  });

  it("canceling while the metadata is read means start is never called", async () => {
    let release: (seconds: number | undefined) => void = () => undefined;
    const readDuration = vi.fn(() => new Promise<number | undefined>(resolve => { release = resolve; }));
    const { controller, deps } = harness({ readDuration });
    await controller.load();
    const pending = controller.replace(video());
    controller.cancel();
    release(30);
    await pending;
    expect(deps.start).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ phase: "idle", error: null });
  });

  it("a reader that throws is treated as an unknown duration", async () => {
    const { controller, deps } = harness({ readDuration: vi.fn(async () => { throw new Error("no metadata"); }) });
    await controller.load();
    await controller.replace(video());
    expect(controller.getState().phase).toBe("uploading");
    expect(vi.mocked(deps.start).mock.calls[0][0]).not.toHaveProperty("durationSeconds");
  });
});

describe("hero video control: upload, processing and going live", () => {
  async function uploading() {
    const h = harness();
    await h.controller.load();
    await h.controller.replace(video());
    return h;
  }

  it("shows real byte progress and starts the tus upload with the signed ticket", async () => {
    const { controller, handlers, deps } = await uploading();
    expect(controller.getState()).toMatchObject({ phase: "uploading", fileName: "hero.mp4" });
    expect(deps.startUpload).toHaveBeenCalledWith(expect.anything(), TICKET.upload, expect.anything());
    handlers.current!.onProgress(2_500_000, 10_000_000);
    expect(controller.getState().progress).toEqual({ sent: 2_500_000, total: 10_000_000 });
  });

  it("cancel aborts the upload, keeps the current video and ignores late callbacks", async () => {
    const { controller, handlers, abort, deps } = await uploading();
    controller.cancel();
    expect(abort).toHaveBeenCalled();
    expect(deps.abandon).toHaveBeenCalledWith("new-guid");
    expect(controller.getState()).toMatchObject({ phase: "idle", status: STATUS, error: null });
    handlers.current!.onError(new Error("aborted"));
    handlers.current!.onSuccess();
    expect(controller.getState().phase).toBe("idle");
  });

  const preparing = { ...STATUS, pending: { videoGuid: "new-guid", encodeProgress: 40 as number | null, effective: "preparing" as const } };
  const liveStatus = { ...STATUS, liveGuid: "new-guid", previousGuid: "live-1", replacesUsedToday: 3, pending: { videoGuid: "new-guid", encodeProgress: null, effective: "live" as const }, completion: { videoGuid: "new-guid", ...RANGE } };

  it("goes straight from the upload to processing, polls GET for display only, and goes live when the swap is already done", async () => {
    const getStatus = vi.fn()
      .mockResolvedValueOnce(STATUS)
      .mockResolvedValueOnce(preparing)
      .mockResolvedValueOnce({ ...preparing, pending: { videoGuid: "new-guid", encodeProgress: 80, effective: "preparing" as const } })
      .mockResolvedValue(liveStatus);
    const { controller, handlers, deps } = harness({ getStatus });
    await controller.load(); await controller.replace(video());
    expect(controller.getState().message).toBe(HERO_VIDEO_UPLOADING_COPY);
    handlers.current!.onSuccess();
    await settle();
    expect(deps.markUploaded).toHaveBeenCalledWith("new-guid");
    expect(vi.mocked(deps.sleep).mock.calls.every(([ms]) => ms === 5000)).toBe(true);
    expect(deps.sleep).toHaveBeenCalledWith(5000);
    expect(deps.refreshRevision).toHaveBeenCalledTimes(1);
    expect(deps.refreshRevision).toHaveBeenCalledWith({ before: "rev-1", after: "rev-2" });
    expect(controller.getState()).toMatchObject({ phase: "live", revisionWarning: false, revisionConflict: false, status: { liveGuid: "new-guid", previousGuid: "live-1", replacesUsedToday: 3 } });
    expect(controller.getState().message).toBe(HERO_VIDEO_LIVE_COPY);
  });

  it("shows a processing percent only while GET reports one", async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValueOnce(preparing);
    const sleep = vi.fn(() => new Promise<void>(() => undefined));
    const { controller, handlers } = harness({ getStatus, sleep });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess();
    await settle();
    expect(controller.getState()).toMatchObject({ phase: "preparing", encodeProgress: 40, message: HERO_VIDEO_PROCESSING_COPY });
  });

  it("a returning visit during preparing shows preparing, not an empty form", async () => {
    const { controller } = harness({ getStatus: vi.fn(async () => preparing), sleep: vi.fn(() => new Promise<void>(() => undefined)) });
    await controller.load();
    expect(controller.getState()).toMatchObject({ phase: "preparing", message: HERO_VIDEO_PROCESSING_COPY, status: { pending: { videoGuid: "new-guid" } } });
    controller.dispose();
  });

  it("a swap that is already live still refetches the revision", async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(liveStatus);
    const { controller, handlers, deps } = harness({ getStatus });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState().phase).toBe("live");
    expect(deps.refreshRevision).toHaveBeenCalledTimes(1);
  });

  it("warns, rather than failing, when the revision cannot be refetched after going live", async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(liveStatus);
    const { controller, handlers } = harness({ getStatus, refreshRevision: vi.fn(async () => { throw new Error("offline"); }) });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "live", revisionWarning: true });
  });

  it("moves to live without a reload when GET changes after a long stretch of preparing", async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS);
    for (let i = 0; i < 30; i++) getStatus.mockResolvedValueOnce(preparing);
    getStatus.mockResolvedValue(liveStatus);
    const { controller, handlers } = harness({ getStatus });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "live", message: HERO_VIDEO_LIVE_COPY });
  });

  it("stays preparing when the finish call fails after the bytes landed, then goes live", async () => {
    const uploadingRow = { ...STATUS, pending: { videoGuid: "new-guid", encodeProgress: null, effective: "uploading" as const } };
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValueOnce(uploadingRow).mockResolvedValue(liveStatus);
    const markUploaded = vi.fn(async () => { throw new HeroVideoApiError("NETWORK", "offline", 0); });
    const phases: string[] = [];
    const { controller, handlers } = harness({ getStatus, markUploaded });
    controller.subscribe(() => phases.push(controller.getState().phase));
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(markUploaded).toHaveBeenCalledWith("new-guid");
    expect(phases).toContain("preparing");
    expect(controller.getState()).toMatchObject({ phase: "live", message: HERO_VIDEO_LIVE_COPY });
    expect(controller.getState().message).not.toMatch(/bunny|video service/i);
  });

  it("a reload during an upload stays idle with both buttons, even if sessionStorage still names the guid", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => "new-guid", setItem() {}, removeItem() {} });
    const uploadingRow = { ...STATUS, pending: { videoGuid: "new-guid", encodeProgress: null, phase: "uploading" as const, effective: "uploading" as const, deadlineAt: new Date(Date.now() + 3_600_000).toISOString() } };
    // A sleep that never returns: if a tab ever treats the remembered guid as its own it would poll forever, and this fails on the assertions instead.
    const { controller, deps } = harness({ getStatus: vi.fn(async () => uploadingRow), sleep: vi.fn(() => new Promise<void>(() => undefined)) });
    await controller.load();
    expect(controller.getState()).toMatchObject({ phase: "idle", message: HERO_VIDEO_OTHER_UPLOAD_NOTE });
    await controller.revert();
    expect(deps.revert).toHaveBeenCalled();
    await controller.replace(video());
    expect(deps.start).toHaveBeenCalled();
    controller.dispose();
  });

  it("cancel racing with land is a no-op and the tab stays preparing", async () => {
    const preparingRow = { ...STATUS, pending: { videoGuid: "new-guid", encodeProgress: null, phase: "preparing" as const, effective: "preparing" as const } };
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(preparingRow);
    const abandon = vi.fn(async () => ({ outcome: "stale" }));
    const sleep = vi.fn(() => new Promise<void>(() => undefined));
    const { controller } = harness({ getStatus, abandon, sleep });
    await controller.load();
    await controller.replace(video());
    controller.cancel();
    await settle();
    expect(abandon).toHaveBeenCalledWith("new-guid");
    expect(controller.getState().phase).toBe("preparing");
    controller.dispose();
  });

  it("a superseded upload says a newer upload replaced this one", async () => {
    const other = { ...STATUS, pending: { videoGuid: "other-guid", encodeProgress: null, phase: "uploading" as const, effective: "uploading" as const } };
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(other);
    const abandon = vi.fn(async () => ({ outcome: "stale" }));
    const { controller, handlers } = harness({ getStatus, abandon });
    await controller.load();
    await controller.replace(video());
    handlers.current!.onError(new Error("missing"));
    await settle();
    expect(controller.getState()).toMatchObject({ phase: "idle", message: HERO_VIDEO_SUPERSEDED_COPY });
  });

  it("an abandoned upload with no bytes leaves Replace and Revert enabled", async () => {
    const { controller, deps } = harness({ getStatus: vi.fn(async () => ({ ...STATUS, pending: null })) });
    await controller.load();
    expect(controller.getState().phase).toBe("idle");
    await controller.revert();
    expect(deps.revert).toHaveBeenCalled();
    const again = harness({ getStatus: vi.fn(async () => ({ ...STATUS, pending: null })) });
    await again.controller.load();
    await again.controller.replace(video());
    expect(again.deps.start).toHaveBeenCalled();
  });

  it("returns to idle when the pending row is gone and this video did not go live", async () => {
    const getStatus = vi.fn()
      .mockResolvedValueOnce(STATUS)
      .mockResolvedValueOnce(preparing)
      .mockResolvedValue({ ...STATUS, pending: null });
    const { controller, handlers } = harness({ getStatus });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "idle", status: { liveGuid: STATUS.liveGuid, pending: null }, error: null });
  });

  it("moves to failed without a reload when GET reports a failure while preparing", async () => {
    const getStatus = vi.fn()
      .mockResolvedValueOnce(STATUS)
      .mockResolvedValueOnce(preparing)
      .mockResolvedValue({ ...STATUS, pending: { videoGuid: "new-guid", encodeProgress: null, effective: "failed" as const }, failure: { code: "VIDEO_FAILED" } });
    const { controller, handlers } = harness({ getStatus });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "error", error: { code: "VIDEO_FAILED", message: HERO_VIDEO_FAILED_COPY }, barPercent: null });
  });

  it("an interrupted upload explains that nothing changed and lets the person choose a file again", async () => {
    const { controller, handlers } = await uploading();
    handlers.current!.onError(new Error("network"));
    expect(controller.getState()).toMatchObject({ phase: "error", error: { code: "UPLOAD_FAILED", retry: null } });
    expect(controller.getState().error?.message).toMatch(/unchanged/);
    await controller.replace(video());
    expect(controller.getState().phase).toBe("uploading");
  });

  it("keeps watching through network errors and moves to live when a later GET succeeds", async () => {
    const getStatus = vi.fn()
      .mockResolvedValueOnce(STATUS)
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue(liveStatus);
    const { controller, handlers } = harness({ getStatus });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "live", message: HERO_VIDEO_LIVE_COPY });
  });

  it.each([
    ["DAILY_LIMIT", /all 10 video replacements/],
    ["FILE_TOO_LARGE", /too large/],
    ["UNSUPPORTED_TYPE", /not a video/],
    ["VIDEO_NOT_CONFIGURED", /not set up/],
    ["VIDEO_TOO_LONG", /longer than 10 minutes.*shorter clip/],
    ["HERO_VIDEO_CHANGED", /changed somewhere else/],
  ])("the start request's %s keeps its own plain-English message", async (code, pattern) => {
    const { controller } = harness({ start: vi.fn().mockRejectedValue(apiError(code)) });
    await controller.load(); await controller.replace(video());
    const state = controller.getState();
    expect(state.phase).toBe("error");
    expect(state.error?.message).toMatch(pattern);
    expect(state.error?.message).not.toMatch(code);
    expect(state.error?.retry).toBeNull();
    expect(state.status).toBeTruthy();
  });

  it("the daily-limit message uses the server's number, and the shared cap of 10 when the status is not loaded", () => {
    expect(HERO_VIDEO_REPLACES_PER_DAY).toBe(10);
    expect(heroVideoErrorMessage("DAILY_LIMIT", { replacesPerDay: 12 })).toBe("You have used all 12 video replacements for today. Try again tomorrow.");
    expect(heroVideoErrorMessage("DAILY_LIMIT")).toBe("You have used all 10 video replacements for today. Try again tomorrow.");
  });

  const TOO_LONG = "This video is longer than 10 minutes. Use a shorter clip.";
  const TOO_LOW = "This video is below 720p. Use a video that is at least 720p.";
  const TOO_BIG = "This video is too large once processed. Use a shorter clip (up to 10 minutes).";
  const failedStatus = (code: string) => ({ ...STATUS, pending: { videoGuid: "new-guid", encodeProgress: null, effective: "failed" as const }, failure: { code } });

  it.each(["MP4_MISSING", "RESOLUTION_MISSING", "VIDEO_FAILED", "NOT_CLUB_VIDEO", "PREPARE_TIMEOUT", "A_CODE_ADDED_LATER"])(
    "a failed row with code %s shows the one generic failure copy and Replace still starts an upload", async code => {
      const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(failedStatus(code));
      const { controller, handlers, deps } = harness({ getStatus });
      await controller.load(); await controller.replace(video());
      handlers.current!.onSuccess(); await settle();
      expect(controller.getState()).toMatchObject({ phase: "error", error: { code, message: HERO_VIDEO_FAILED_COPY, retry: null }, barPercent: null, status: { previousGuid: "prev-1" } });
      expect(controller.getState().error?.message).toBe("We couldn't finish this video. Try again or use a different file.");
      await controller.replace(video());
      expect(deps.start).toHaveBeenCalledTimes(2);
    });

  it.each([
    ["VIDEO_TOO_LONG", TOO_LONG],
    ["RESOLUTION_TOO_LOW", TOO_LOW],
    ["STORED_SIZE_TOO_LARGE", TOO_BIG],
  ])("a failed row with code %s tells the person what to change, and Replace still starts an upload", async (code, message) => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(failedStatus(code));
    const { controller, handlers, deps } = harness({ getStatus });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "error", error: { code, message, retry: null }, message, barPercent: null, status: { previousGuid: "prev-1" } });
    expect(controller.getState().error?.message).not.toBe(HERO_VIDEO_FAILED_COPY);
    expect(controller.getState().error?.message).not.toMatch(/bunny|video service|_/i);
    await controller.replace(video());
    expect(deps.start).toHaveBeenCalledTimes(2);
  });

  it("a failed row read on load shows the specific copy too, not only one the tab was watching", async () => {
    const { controller } = harness({ getStatus: vi.fn(async () => failedStatus("RESOLUTION_TOO_LOW")) });
    await controller.load();
    expect(controller.getState()).toMatchObject({ phase: "error", error: { code: "RESOLUTION_TOO_LOW", message: TOO_LOW } });
  });

  it("the minutes in the length and processed-size copy come from the status the server sent, falling back to the shared 10-minute cap", () => {
    expect(heroVideoErrorMessage("VIDEO_TOO_LONG")).toBe(TOO_LONG);
    expect(heroVideoErrorMessage("STORED_SIZE_TOO_LARGE")).toBe(TOO_BIG);
    expect(heroVideoErrorMessage("VIDEO_TOO_LONG", { maxSeconds: 300 })).toBe("This video is longer than 5 minutes. Use a shorter clip.");
    expect(heroVideoErrorMessage("STORED_SIZE_TOO_LARGE", { maxSeconds: 300 })).toBe("This video is too large once processed. Use a shorter clip (up to 5 minutes).");
    expect(heroVideoErrorMessage("RESOLUTION_TOO_LOW")).toBe(TOO_LOW);
  });

  it("the pre-upload length check and a failed row's length failure read the same", async () => {
    const pre = harness({ readDuration: vi.fn(async () => 601) });
    await pre.controller.load(); await pre.controller.replace(video());
    const server = harness({ getStatus: vi.fn(async () => failedStatus("VIDEO_TOO_LONG")) });
    await server.controller.load();
    expect(pre.controller.getState().error?.message).toBe(TOO_LONG);
    expect(server.controller.getState().error?.message).toBe(pre.controller.getState().error?.message);
  });

  it("after a failed video, Revert to previous still works", async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue({ ...STATUS, pending: { videoGuid: "new-guid", encodeProgress: null, effective: "failed" as const }, failure: { code: "MP4_MISSING" } });
    const { controller, handlers, deps } = harness({ getStatus });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState().phase).toBe("error");
    await controller.revert();
    expect(deps.revert).toHaveBeenCalledWith("live-1", "prev-1");
  });

  it("every documented code has its own message and none of them name the video host", () => {
    for (const code of ["FILE_TOO_LARGE", "UNSUPPORTED_TYPE", "DAILY_LIMIT", "VIDEO_NOT_CONFIGURED", "HERO_VIDEO_NOT_AVAILABLE", "VIDEO_TOO_LONG", "HERO_VIDEO_CHANGED", "HOMEPAGE_NOT_READY", "NO_PREVIOUS_VIDEO"]) {
      expect(heroVideoErrorMessage(code)).not.toBe(heroVideoErrorMessage("SOMETHING_ELSE"));
      expect(heroVideoErrorMessage(code)).not.toMatch(/bunny|video service/i);
    }
    for (const copy of [HERO_VIDEO_UPLOADING_COPY, HERO_VIDEO_KEEP_OPEN_COPY, HERO_VIDEO_PROCESSING_COPY, HERO_VIDEO_LEAVE_COPY, HERO_VIDEO_LIVE_COPY, HERO_VIDEO_FAILED_COPY]) {
      expect(copy).not.toMatch(/bunny|video service/i);
    }
  });

  it("ignores commands while busy", async () => {
    const { controller, deps } = await uploading();
    await controller.replace(video());
    await controller.revert();
    expect(deps.start).toHaveBeenCalledTimes(1);
    expect(deps.revert).not.toHaveBeenCalled();
  });
});

describe("hero video control: one progress bar from start to live", () => {
  const encoding = (encodeProgress: number | null) => ({ ...STATUS, pending: { videoGuid: "new-guid", encodeProgress, effective: "preparing" as const } });
  const live = { ...STATUS, liveGuid: "new-guid", previousGuid: "live-1", replacesUsedToday: 3, pending: { videoGuid: "new-guid", encodeProgress: null, effective: "live" as const }, completion: { videoGuid: "new-guid", ...RANGE } };

  /** Uploads one file, then lets each processing poll return the next status (the last one repeats). Records every bar value and label. */
  async function run(polls: HeroVideoStatus[]) {
    let release: () => void = () => undefined;
    let served = 0;
    const getStatus = vi.fn(async () => (served++ === 0 ? STATUS : polls[Math.min(served - 2, polls.length - 1)]));
    const sleep = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const h = harness({ getStatus, sleep });
    const seen: Array<{ phase: string; bar: number | null; message: string }> = [];
    h.controller.subscribe(() => { const s = h.controller.getState(); seen.push({ phase: s.phase, bar: s.barPercent, message: s.message }); });
    await h.controller.load();
    await h.controller.replace(video());
    return { ...h, seen, next: async () => { release(); await settle(); } };
  }

  it("maps upload bytes to 0-40 percent of the bar", async () => {
    const { controller, handlers } = await run([encoding(null)]);
    expect(controller.getState()).toMatchObject({ phase: "uploading", barPercent: 0, message: HERO_VIDEO_UPLOADING_COPY });
    handlers.current!.onProgress(5_000_000, 10_000_000);
    expect(controller.getState().barPercent).toBe(20);
    handlers.current!.onProgress(10_000_000, 10_000_000);
    expect(controller.getState().barPercent).toBe(40);
  });

  it("goes straight to Processing at 40 percent when the bytes land, with no separate upload-done phase", async () => {
    const { controller, handlers, seen } = await run([encoding(null)]);
    handlers.current!.onProgress(10_000_000, 10_000_000);
    handlers.current!.onSuccess();
    expect(controller.getState()).toMatchObject({ phase: "preparing", barPercent: 40, message: HERO_VIDEO_PROCESSING_COPY });
    await settle();
    expect(seen.map(entry => entry.phase)).not.toContain("uploaded");
    expect(controller.getState()).toMatchObject({ phase: "preparing", barPercent: 40, message: HERO_VIDEO_PROCESSING_COPY });
  });

  it("maps the processing percent to 40-100: 50 is 70, null holds at 40, 100 is the end of the bar", async () => {
    const { controller, handlers, next } = await run([encoding(50), encoding(null), encoding(100)]);
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "preparing", barPercent: 70, encodeProgress: 50 });
    await next();
    expect(controller.getState()).toMatchObject({ barPercent: 70, encodeProgress: null });
    await next();
    expect(controller.getState()).toMatchObject({ phase: "preparing", barPercent: 100, encodeProgress: 100 });
  });

  it("with no processing percent the bar holds at 40", async () => {
    const { controller, handlers } = await run([encoding(null)]);
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "preparing", barPercent: 40, encodeProgress: null });
  });

  it("never moves backwards: a smaller upload offset, a lower encode percent or a missing one keep the highest value shown", async () => {
    const { controller, handlers, seen, next } = await run([encoding(80), encoding(20), encoding(null), live]);
    handlers.current!.onProgress(8_000_000, 10_000_000);
    handlers.current!.onProgress(3_000_000, 10_000_000);
    expect(controller.getState().barPercent).toBe(32);
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState().barPercent).toBe(88);
    await next();
    await next();
    expect(controller.getState().barPercent).toBe(88);
    await next();
    expect(controller.getState()).toMatchObject({ phase: "live", barPercent: 100 });
    const bars = seen.map(entry => entry.bar).filter((bar): bar is number => bar !== null);
    expect(bars).toEqual([...bars].sort((a, b) => a - b));
  });

  it("the label reads Uploading, then Processing, then the live message, and live is the only success state", async () => {
    const { controller, handlers, seen, next } = await run([encoding(null), live]);
    handlers.current!.onSuccess(); await settle();
    await next();
    const labels = seen.map(entry => entry.message).filter((message, index, all) => message && message !== all[index - 1]);
    expect(labels.slice(0, 3)).toEqual([HERO_VIDEO_UPLOADING_COPY, HERO_VIDEO_PROCESSING_COPY, HERO_VIDEO_LIVE_COPY]);
    expect(HERO_VIDEO_UPLOADING_COPY).toBe("Uploading…");
    expect(HERO_VIDEO_PROCESSING_COPY).toBe("Processing…");
    expect(HERO_VIDEO_LIVE_COPY).toBe("Your new video is live.");
    expect(controller.getState()).toMatchObject({ phase: "live", barPercent: 100, message: HERO_VIDEO_LIVE_COPY });
    expect(seen.filter(entry => entry.phase === "live")).not.toHaveLength(0);
    expect(seen.filter(entry => entry.bar === 100 && entry.phase !== "live" && entry.phase !== "preparing")).toEqual([]);
  });

  it("a returning visit during processing resumes the bar from the server's percent", async () => {
    const { controller } = harness({ getStatus: vi.fn(async () => encoding(50)), sleep: vi.fn(() => new Promise<void>(() => undefined)) });
    await controller.load();
    expect(controller.getState()).toMatchObject({ phase: "preparing", barPercent: 70, message: HERO_VIDEO_PROCESSING_COPY });
    controller.dispose();
  });

  it("a returning visit inside the live window shows the full bar and the live message", async () => {
    const { controller } = harness({ getStatus: vi.fn(async () => live) });
    await controller.load();
    expect(controller.getState()).toMatchObject({ phase: "live", barPercent: 100, message: HERO_VIDEO_LIVE_COPY });
  });

  it("a revert going live has no bar, and a canceled, failed or idle upload has none either", async () => {
    const reverted = harness();
    await reverted.controller.load(); await reverted.controller.revert();
    expect(reverted.controller.getState()).toMatchObject({ phase: "live", barPercent: null });
    const canceled = await run([encoding(null)]);
    canceled.controller.cancel();
    expect(canceled.controller.getState()).toMatchObject({ phase: "idle", barPercent: null });
    const failed = await run([encoding(null)]);
    failed.handlers.current!.onError(new Error("network"));
    expect(failed.controller.getState()).toMatchObject({ phase: "error", barPercent: null });
    expect(harness().controller.getState().barPercent).toBeNull();
  });

  it("a new upload after a live one starts again from zero", async () => {
    const { controller, handlers, deps } = harness({ getStatus: vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(live) });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "live", barPercent: 100 });
    await controller.replace(video());
    expect(deps.start).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({ phase: "uploading", barPercent: 0 });
  });

  it("the page hint is the keep-open line while uploading, the leave line while processing, and nothing else", () => {
    expect(heroVideoHint("uploading")).toBe("Keep this page open until the upload finishes.");
    expect(heroVideoHint("preparing")).toBe("You can leave this page; we'll finish in the background.");
    for (const phase of ["loading", "idle", "reverting", "live", "error"] as const) expect(heroVideoHint(phase)).toBe("");
  });

  it("the navigation guard's trigger is unchanged: bytes moving is the uploading phase and nothing after it", async () => {
    const { controller, handlers } = await run([encoding(null)]);
    expect(controller.getState().phase).toBe("uploading");
    handlers.current!.onSuccess();
    expect(controller.getState().phase).toBe("preparing");
  });
});

describe("viewFor: what one status read means", () => {
  const row = (videoGuid: string, effective: NonNullable<HeroVideoStatus["pending"]>["effective"]) => ({ videoGuid, encodeProgress: null, effective });
  const NEW = "new-guid";
  const at = (effective: NonNullable<HeroVideoStatus["pending"]>["effective"], over: Partial<HeroVideoStatus> = {}): HeroVideoStatus => ({ ...STATUS, pending: row(NEW, effective), ...over });
  const cases: Array<[string, HeroVideoStatus, string | null, HeroVideoView]> = [
    ["load: no row", STATUS, null, "idle"],
    ["load: a live row inside the notice window", at("live", { liveGuid: NEW }), null, "live"],
    ["load: a live row after the notice window", at("idle", { liveGuid: NEW }), null, "idle"],
    ["load: a live row that was reverted since", at("live"), null, "idle"],
    ["load: preparing", at("preparing"), null, "preparing"],
    ["load: preparing past its deadline", at("preparing_overdue"), null, "timeout"],
    ["load: another window's upload", at("uploading"), null, "other_upload"],
    ["load: an upload past its deadline", at("uploading_overdue"), null, "timeout"],
    ["load: failed", at("failed"), null, "failed"],
    ["load: abandoned", at("abandoned"), null, "idle"],
    ["watching: no row and the guid is not live", STATUS, NEW, "idle"],
    ["watching: no row and the guid is live", { ...STATUS, liveGuid: NEW }, NEW, "live"],
    ["watching: live inside the notice window", at("live", { liveGuid: NEW }), NEW, "live"],
    ["watching: live after the notice window still finishes live", at("idle", { liveGuid: NEW }), NEW, "live"],
    ["watching: live but reverted since", at("live"), NEW, "idle"],
    ["watching: preparing", at("preparing"), NEW, "preparing"],
    ["watching: still uploading keeps polling", at("uploading"), NEW, "preparing"],
    ["watching: preparing past its deadline", at("preparing_overdue"), NEW, "timeout"],
    ["watching: uploading past its deadline", at("uploading_overdue"), NEW, "timeout"],
    ["watching: failed", at("failed"), NEW, "failed"],
    ["watching: abandoned", at("abandoned"), NEW, "idle"],
    ["watching: a newer upload replaced it", { ...STATUS, pending: row("other-guid", "uploading") }, NEW, "superseded"],
    ["watching: a newer failed row replaced it", { ...STATUS, pending: row("other-guid", "failed") }, NEW, "superseded"],
    ["watching: replaced, but this guid went live first", { ...STATUS, liveGuid: NEW, pending: row("other-guid", "uploading") }, NEW, "live"],
  ];
  it.each(cases)("%s", (_label, status, ownGuid, expected) => {
    expect(viewFor(status, ownGuid)).toBe(expected);
  });
  it("covers every view", () => {
    expect(new Set(cases.map(([, , , view]) => view))).toEqual(new Set(["idle", "other_upload", "timeout", "preparing", "live", "failed", "superseded"]));
  });
});

describe("hero video control: reload shows what the server says", () => {
  const GUID = "new-guid";
  const pending = (effective: NonNullable<HeroVideoStatus["pending"]>["effective"]) => ({ videoGuid: GUID, encodeProgress: null, effective });
  // Row: the server's status on load, what the tab shows, the failure code it carries, and whether choosing a new file starts an upload.
  const rows: Array<[string, HeroVideoStatus, string, string, string | null, boolean]> = [
    ["reload mid-upload", { ...STATUS, pending: pending("uploading") }, "idle", HERO_VIDEO_OTHER_UPLOAD_NOTE, null, true],
    ["reload mid-upload, past its deadline", { ...STATUS, pending: pending("uploading_overdue") }, "error", HERO_VIDEO_FAILED_COPY, "PREPARE_TIMEOUT", true],
    ["reload during preparing", { ...STATUS, pending: pending("preparing") }, "preparing", HERO_VIDEO_PROCESSING_COPY, null, false],
    ["reload after preparing timed out", { ...STATUS, pending: pending("preparing_overdue") }, "error", HERO_VIDEO_FAILED_COPY, "PREPARE_TIMEOUT", true],
    ["reload after an encode failure", { ...STATUS, pending: pending("failed"), failure: { code: "VIDEO_FAILED" } }, "error", HERO_VIDEO_FAILED_COPY, "VIDEO_FAILED", true],
    ["reload after a missing mp4", { ...STATUS, pending: pending("failed"), failure: { code: "MP4_MISSING" } }, "error", HERO_VIDEO_FAILED_COPY, "MP4_MISSING", true],
    ["reload after a missing resolution code the editor does not word", { ...STATUS, pending: pending("failed"), failure: { code: "RESOLUTION_MISSING" } }, "error", HERO_VIDEO_FAILED_COPY, "RESOLUTION_MISSING", true],
    ["reload after a video that is too long", { ...STATUS, pending: pending("failed"), failure: { code: "VIDEO_TOO_LONG" } }, "error", "This video is longer than 10 minutes. Use a shorter clip.", "VIDEO_TOO_LONG", true],
    ["reload after a video below 720p", { ...STATUS, pending: pending("failed"), failure: { code: "RESOLUTION_TOO_LOW" } }, "error", "This video is below 720p. Use a video that is at least 720p.", "RESOLUTION_TOO_LOW", true],
    ["reload after a video too large once processed", { ...STATUS, pending: pending("failed"), failure: { code: "STORED_SIZE_TOO_LARGE" } }, "error", "This video is too large once processed. Use a shorter clip (up to 10 minutes).", "STORED_SIZE_TOO_LARGE", true],
    ["reload after an abandoned upload", { ...STATUS, pending: pending("abandoned") }, "idle", "", null, true],
    ["reload inside the live notice window", { ...STATUS, liveGuid: GUID, pending: pending("live") }, "live", HERO_VIDEO_LIVE_COPY, null, true],
    ["reload after the live notice window", { ...STATUS, liveGuid: GUID, pending: pending("idle") }, "idle", "", null, true],
  ];
  it.each(rows)("%s", async (_label, status, phase, message, code, canReplace) => {
    // A browser that still remembers this upload changes nothing: ownership is only ever the server's pending row.
    const remembered = { getItem: () => GUID, setItem() {}, removeItem() {}, key: () => GUID, length: 1, clear() {} };
    vi.stubGlobal("sessionStorage", remembered);
    vi.stubGlobal("localStorage", remembered);
    const { controller, deps } = harness({ getStatus: vi.fn(async () => status), sleep: vi.fn(() => new Promise<void>(() => undefined)) });
    await controller.load();
    expect(controller.getState()).toMatchObject({ phase, message });
    if (phase === "error") expect(controller.getState().error).toMatchObject({ code, message });
    await controller.replace(video());
    expect(deps.start).toHaveBeenCalledTimes(canReplace ? 1 : 0);
    // Loading is read-only: it never lands, cancels, reverts or refreshes the editor revision.
    for (const quiet of [deps.markUploaded, deps.abandon, deps.revert, deps.refreshRevision]) expect(quiet).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("second tab: the other window's upload is shown without touching it, and its new file supersedes the first tab's", async () => {
    const server: { pending: { videoGuid: string; effective: "uploading" } | null } = { pending: null };
    const status = (): HeroVideoStatus => ({ ...STATUS, pending: server.pending && { ...server.pending, encodeProgress: null } });
    // The poll interval never returns, so a tab that wrongly keeps polling fails on the assertions instead of looping.
    const sleep = vi.fn(() => new Promise<void>(() => undefined));
    const tab = (guid: string) => harness({
      sleep,
      getStatus: vi.fn(async () => status()),
      start: vi.fn(async () => { server.pending = { videoGuid: guid, effective: "uploading" }; return { ...TICKET, videoGuid: guid }; }),
    });
    const a = tab("tab-a");
    const b = tab("tab-b");
    await a.controller.load();
    await a.controller.replace(video());
    expect(a.controller.getState().phase).toBe("uploading");

    await b.controller.load();
    expect(b.controller.getState()).toMatchObject({ phase: "idle", message: HERO_VIDEO_OTHER_UPLOAD_NOTE });
    expect(b.deps.markUploaded).not.toHaveBeenCalled();
    expect(b.deps.abandon).not.toHaveBeenCalled();
    await b.controller.replace(video());
    expect(b.controller.getState().phase).toBe("uploading");

    // The first tab's bytes land late. The server answers stale, and the tab says a newer upload replaced it.
    a.handlers.current!.onSuccess();
    await settle();
    expect(a.deps.markUploaded).toHaveBeenCalledWith("tab-a");
    expect(a.controller.getState()).toMatchObject({ phase: "idle", message: HERO_VIDEO_SUPERSEDED_COPY });
    expect(a.deps.abandon).not.toHaveBeenCalled();
    expect(b.controller.getState().phase).toBe("uploading");
    expect(server.pending?.videoGuid).toBe("tab-b");
    a.controller.dispose();
    b.controller.dispose();
  });
});

describe("hero video control: the live notice follows the server's window", () => {
  const livePending = (effective: "live" | "idle") => ({ videoGuid: "new-guid", encodeProgress: null, phase: "live" as const, effective, deadlineAt: null });
  const afterSwap = { ...STATUS, liveGuid: "new-guid", previousGuid: "live-1", replacesUsedToday: 3 };
  const fresh = { ...afterSwap, pending: livePending("live"), completion: { videoGuid: "new-guid", ...RANGE } };
  const old = { ...afterSwap, pending: livePending("idle"), completion: null };

  it("loading with a live row from an hour ago stays idle, with no notice, no revision refresh and the same replace count", async () => {
    const getStatus = vi.fn(async () => old);
    const { controller, deps } = harness({ getStatus });
    await controller.load();
    await settle();
    expect(controller.getState()).toMatchObject({ phase: "idle", message: "", error: null, revisionWarning: false, revisionConflict: false, status: { liveGuid: "new-guid", replacesUsedToday: 3 } });
    expect(deps.refreshRevision).not.toHaveBeenCalled();
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it("loading with a fresh completion shows the live notice but never refreshes the revision or bumps the replace count", async () => {
    const getStatus = vi.fn(async () => fresh);
    const { controller, deps } = harness({ getStatus });
    await controller.load();
    await settle();
    expect(controller.getState()).toMatchObject({ phase: "live", message: HERO_VIDEO_LIVE_COPY, error: null, revisionWarning: false, revisionConflict: false, status: { liveGuid: "new-guid", replacesUsedToday: 3 } });
    expect(deps.refreshRevision).not.toHaveBeenCalled();
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it("reloading twice with the same fresh completion never moves the replace count", async () => {
    const { controller, deps } = harness({ getStatus: vi.fn(async () => fresh) });
    await controller.load();
    await controller.load();
    expect(controller.getState().status?.replacesUsedToday).toBe(3);
    expect(deps.refreshRevision).not.toHaveBeenCalled();
  });

  it("the notice sets no timer and Replace works while it shows", async () => {
    vi.useFakeTimers();
    try {
      const { controller, deps } = harness({ getStatus: vi.fn(async () => fresh) });
      await controller.load();
      expect(vi.getTimerCount()).toBe(0);
      await controller.replace(video());
      expect(deps.start).toHaveBeenCalledTimes(1);
      controller.dispose();
    } finally { vi.useRealTimers(); }
  });

  it("an in-tab watch that reaches live refreshes the revision once with that completion's range", async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(fresh);
    const { controller, handlers, deps } = harness({ getStatus });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(deps.refreshRevision).toHaveBeenCalledExactlyOnceWith({ before: "rev-1", after: "rev-2" });
    expect(controller.getState()).toMatchObject({ phase: "live", message: HERO_VIDEO_LIVE_COPY, revisionConflict: false });
  });

  it("an in-tab watch that only sees the swap after the window closed still ends live, without a refresh it cannot make", async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(old);
    let polls = 0;
    const sleep = vi.fn(async () => { if (++polls > 25) await new Promise<void>(() => undefined); });
    const { controller, handlers, deps } = harness({ getStatus, sleep });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "live", message: HERO_VIDEO_LIVE_COPY });
    expect(deps.refreshRevision).not.toHaveBeenCalled();
    controller.dispose();
  });
});

describe("hero video control: revert", () => {
  it("reverts to the previous video, refetches the revision and refreshes the status", async () => {
    const swapped = { ...STATUS, liveGuid: "prev-1", previousGuid: "live-1", ...RANGE };
    const { controller, deps } = harness({ getStatus: vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(swapped) });
    await controller.load();
    await controller.revert();
    expect(deps.revert).toHaveBeenCalledWith("live-1", "prev-1");
    expect(deps.refreshRevision).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({ phase: "live", status: { liveGuid: "prev-1", previousGuid: "live-1", replacesUsedToday: 2 } });
  });

  it("does nothing when there is no previous video", async () => {
    const { controller, deps } = harness({ getStatus: vi.fn(async () => ({ ...STATUS, previousGuid: "" })) });
    await controller.load(); await controller.revert();
    expect(deps.revert).not.toHaveBeenCalled();
  });

  it("explains a concurrent change and reloads the latest status", async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue({ ...STATUS, liveGuid: "someone-else" });
    const { controller, deps } = harness({ getStatus, revert: vi.fn().mockRejectedValue(apiError("HERO_VIDEO_CHANGED", 409)) });
    await controller.load(); await controller.revert();
    expect(controller.getState()).toMatchObject({ phase: "error", status: { liveGuid: "someone-else" } });
    expect(deps.refreshRevision).not.toHaveBeenCalled();
  });
});

describe("hero video client and tus wrapper", () => {
  it("sends the documented bodies and reads error bodies as {code, message}", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(TICKET), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ outcome: "ok", status: "preparing" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ outcome: "abandoned", status: "idle" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "DAILY_LIMIT", message: "x" }), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await startHeroVideoUpload({ name: "a.mp4", size: 5, type: "video/mp4" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "start", fileName: "a.mp4", fileSize: 5, mimeType: "video/mp4" });
    expect(fetchMock.mock.calls[0][1].body).not.toContain("durationSeconds");
    expect(await markHeroVideoUploaded("g")).toMatchObject({ outcome: "ok" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "uploaded", videoGuid: "g" });
    expect(await abandonHeroVideoUpload("g")).toMatchObject({ outcome: "abandoned" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ action: "abandon", videoGuid: "g" });
    await expect(startHeroVideoUpload({ name: "a.mp4", size: 5, type: "video/mp4" })).rejects.toMatchObject({ code: "DAILY_LIMIT", httpStatus: 429 });
  });

  it("sends durationSeconds in the start body only when the browser could read it", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(TICKET), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await startHeroVideoUpload({ name: "a.mp4", size: 5, type: "video/mp4", durationSeconds: 120.5 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "start", fileName: "a.mp4", fileSize: 5, mimeType: "video/mp4", durationSeconds: 120.5 });
    await startHeroVideoUpload({ name: "a.mp4", size: 5, type: "video/mp4", durationSeconds: undefined });
    expect(fetchMock.mock.calls[1][1].body).not.toContain("durationSeconds");
  });

  it("starts tus with the signed headers, metadata and retry schedule", async () => {
    const { startTusUpload } = await import("@/lib/homepage-editor/hero-video-tus");
    const file = { name: "hero.mp4", type: "video/mp4", size: 3 } as unknown as File;
    const onProgress = vi.fn();
    const handle = startTusUpload(file, TICKET.upload, { onProgress, onSuccess: vi.fn(), onError: vi.fn() });
    const upload = tus.instances[0];
    expect(upload.start).toHaveBeenCalled();
    expect(upload.options.endpoint).toBe("https://video.bunnycdn.com/tusupload");
    expect(upload.options.retryDelays).toEqual([0, 3000, 5000, 10000, 20000]);
    expect(upload.options.headers).toEqual({ AuthorizationSignature: "sig", AuthorizationExpire: "1900000000", VideoId: "new-guid", LibraryId: "723074", EnabledResolutions: "240p,360p,480p,720p" });
    expect(upload.options.metadata).toEqual({ filetype: "video/mp4", title: "hero.mp4" });
    upload.options.onProgress(1, 3);
    expect(onProgress).toHaveBeenCalledWith(1, 3);
    handle.abort();
    expect(upload.abort).toHaveBeenCalled();
  });
});

describe("hero video control: the editor's base revision follows the swap and the draft survives", () => {
  const renderer = { templateKey: "cinematic@2", slideshowVariant: "cinematic", heroVariant: "editable" } as const;
  const capabilities = resolveHomepageCapabilities(renderer);
  const editorAt = () => {
    let state: HomepageEditorState = createHomepageEditorState({
      content: { ...homepageDraft(), revamp: defaultCinematicHomepageContent() }, revision: "rev-1", designRevision: "design", editableSections: capabilities.editableSections, maxPhotos: 7,
    });
    state = reduceHomepageEditor(state, { type: "field-changed", field: "hero.intro", value: "My unsaved intro" });
    return { get: () => state, set: (next: HomepageEditorState) => { state = next; } };
  };
  /** The same wiring useHomepageEditor.refreshBaseRevision uses: the pure rule plus the reducer action. */
  const wire = (editor: ReturnType<typeof editorAt>, fetched: string) => {
    const fetchRevision = vi.fn(async () => fetched);
    const refreshRevision: HeroVideoDeps["refreshRevision"] = range => applySwapRevision({
      baseRevision: () => editor.get().baseRevision, fetchRevision,
      apply: revision => editor.set(reduceHomepageEditor(editor.get(), { type: "base-revision-refreshed", revision })),
    }, range);
    return { refreshRevision, fetchRevision };
  };
  const swap = async (refreshRevision: HeroVideoDeps["refreshRevision"], live: Record<string, unknown>) => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue({
      ...STATUS, liveGuid: "new-guid", previousGuid: "live-1", pending: { videoGuid: "new-guid", encodeProgress: null, effective: "live" as const },
      completion: { videoGuid: "new-guid", revisionBefore: (live.revisionBefore ?? null) as string | null, revisionAfter: (live.revisionAfter ?? null) as string | null },
    });
    const { controller, handlers } = harness({ getStatus, refreshRevision });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    return controller;
  };

  it("a live swap refetches the revision into the editor without touching unsaved edits, and the next save sends it", async () => {
    const editor = editorAt();
    const draftBefore = structuredClone(editor.get().draft);
    const baselineBefore = structuredClone(editor.get().baseline);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ revision: "rev-2" }), { status: 200 })));
    const refreshRevision: HeroVideoDeps["refreshRevision"] = range => applySwapRevision({
      baseRevision: () => editor.get().baseRevision, fetchRevision: fetchHomepageRevision,
      apply: revision => editor.set(reduceHomepageEditor(editor.get(), { type: "base-revision-refreshed", revision })),
    }, range);
    const controller = await swap(refreshRevision, RANGE);

    expect(controller.getState()).toMatchObject({ phase: "live", revisionConflict: false });
    expect(editor.get().baseRevision).toBe("rev-2");
    expect(editor.get().draft).toEqual(draftBefore);
    expect(editor.get().baseline).toEqual(baselineBefore);
    const request = buildHomepageSaveRequest(editor.get(), renderer, SAVE_OPERATION);
    expect(request.expectedRevision).toBe("rev-2");
    expect(request.sections.hero?.intro).toBe("My unsaved intro");
  });

  it("the editor base differing from revisionBefore applies nothing and shows the conflict notice state", async () => {
    const editor = editorAt();
    editor.set({ ...editor.get(), baseRevision: "rev-other" });
    const { refreshRevision, fetchRevision } = wire(editor, "rev-2");
    const controller = await swap(refreshRevision, RANGE);
    expect(editor.get().baseRevision).toBe("rev-other");
    expect(fetchRevision).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ phase: "live", revisionConflict: true, revisionWarning: false });
  });

  it("a fetched revision different from revisionAfter applies nothing", async () => {
    const editor = editorAt();
    const { refreshRevision } = wire(editor, "rev-3-by-someone-else");
    const controller = await swap(refreshRevision, RANGE);
    expect(editor.get().baseRevision).toBe("rev-1");
    expect(controller.getState().revisionConflict).toBe(true);
  });

  it.each([[{ revisionBefore: null, revisionAfter: null }], [{}], [{ revisionBefore: "rev-1", revisionAfter: null }]])("missing revisions %j mean no refetch at all", async live => {
    const editor = editorAt();
    const { refreshRevision, fetchRevision } = wire(editor, "rev-2");
    const spy = vi.fn(refreshRevision);
    const controller = await swap(spy, live);
    expect(spy).not.toHaveBeenCalled();
    expect(fetchRevision).not.toHaveBeenCalled();
    expect(editor.get().baseRevision).toBe("rev-1");
    expect(controller.getState()).toMatchObject({ phase: "live", revisionConflict: false, revisionWarning: false });
  });

  it("a revert applies the same rule", async () => {
    const editor = editorAt();
    const { refreshRevision } = wire(editor, "rev-2");
    const { controller } = harness({ refreshRevision });
    await controller.load(); await controller.revert();
    expect(editor.get().baseRevision).toBe("rev-2");
  });

  it("an unchanged revision leaves the state object alone", () => {
    const state = createHomepageEditorState({ content: homepageDraft(), revision: "r", designRevision: "d", editableSections: capabilities.editableSections, maxPhotos: 7 });
    expect(reduceHomepageEditor(state, { type: "base-revision-refreshed", revision: "r" })).toBe(state);
  });
});

describe("hero video duration reader (browser metadata)", () => {
  const FILE = { name: "hero.mp4", type: "video/mp4", size: 3 } as unknown as File;
  type FakeVideo = {
    preload: string; muted: boolean; src: string; duration: number;
    onloadedmetadata: (() => void) | null; onerror: (() => void) | null;
    removeAttribute: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn>;
  };
  function env() {
    const video: FakeVideo = { preload: "", muted: false, src: "", duration: Number.NaN, onloadedmetadata: null, onerror: null, removeAttribute: vi.fn(), load: vi.fn() };
    const createElement = vi.fn(() => video);
    vi.stubGlobal("document", { createElement });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:hero-1");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    return { video, createElement, create, revoke };
  }
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("reads loadedmetadata on an off-DOM video with preload metadata, then revokes the object URL", async () => {
    const { video, createElement, create, revoke } = env();
    const result = readVideoDuration(FILE);
    expect(createElement).toHaveBeenCalledWith("video");
    expect(create).toHaveBeenCalledWith(FILE);
    expect(video).toMatchObject({ preload: "metadata", src: "blob:hero-1" });
    expect(revoke).not.toHaveBeenCalled();
    video.duration = 125.4;
    video.onloadedmetadata?.();
    expect(await result).toBe(125.4);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:hero-1");
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
  });

  it("resolves undefined on a media error (some HEVC .mov in Chrome) and still revokes the URL", async () => {
    const { video, revoke } = env();
    const result = readVideoDuration(FILE);
    video.onerror?.();
    expect(await result).toBeUndefined();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:hero-1");
  });

  it("resolves undefined after about 5 seconds without metadata and revokes the URL", async () => {
    vi.useFakeTimers();
    const { revoke } = env();
    let settled = false;
    const result = readVideoDuration(FILE).then(value => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBeUndefined();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:hero-1");
  });

  it.each([[Number.POSITIVE_INFINITY], [Number.NaN], [0]])("treats a duration of %s as unknown", async duration => {
    const { video, revoke } = env();
    const result = readVideoDuration(FILE);
    video.duration = duration;
    video.onloadedmetadata?.();
    expect(await result).toBeUndefined();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("settles once: a late event after the timeout neither resolves again nor revokes twice", async () => {
    vi.useFakeTimers();
    const { video, revoke } = env();
    const result = readVideoDuration(FILE);
    const lateLoaded = video.onloadedmetadata;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toBeUndefined();
    video.duration = 50;
    lateLoaded?.();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("resolves undefined and revokes nothing when the URL cannot be created", async () => {
    const { create, revoke } = env();
    create.mockImplementation(() => { throw new Error("blocked"); });
    expect(await readVideoDuration(FILE)).toBeUndefined();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("resolves undefined where there is no DOM", async () => {
    expect(await readVideoDuration(FILE)).toBeUndefined();
  });
});

describe("hero poster in the editor: the preview follows a swap or revert without a reload", () => {
  const renderer = { templateKey: "cinematic@2", slideshowVariant: "cinematic", heroVariant: "editable" } as const;
  const capabilities = resolveHomepageCapabilities(renderer);
  const art = (assetId: string | null, url: string | null, alt = "") => ({ assetId, url, alt });
  const presentationWith = (poster: ReturnType<typeof art>) => ({ ...defaultCinematicHomepageContent().presentation, heroVideoGuid: "new-guid", heroPoster: poster });
  const fresh = { ...STATUS, liveGuid: "new-guid", previousGuid: "live-1", pending: { videoGuid: "new-guid", encodeProgress: null, effective: "live" as const }, completion: { videoGuid: "new-guid", revisionBefore: "rev-1", revisionAfter: "rev-2" } };
  const swapped = async (over: Partial<HeroVideoDeps> = {}) => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue(fresh);
    const made = harness({ getStatus, ...over });
    await made.controller.load(); await made.controller.replace(video());
    made.handlers.current!.onSuccess(); await settle();
    return made;
  };

  it("a swap that goes live in this tab re-reads the presentation once", async () => {
    const { deps, controller } = await swapped();
    expect(deps.refreshPresentation).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({ phase: "live", message: HERO_VIDEO_LIVE_COPY });
  });

  it("a revert re-reads the presentation too", async () => {
    const { controller, deps } = harness();
    await controller.load(); await controller.revert();
    expect(deps.refreshPresentation).toHaveBeenCalledTimes(1);
  });

  it("the presentation is refreshed even when the revision check reports a conflict, since the poster is not part of that check", async () => {
    const { deps, controller } = await swapped({ refreshRevision: vi.fn(async () => "conflict" as const) });
    expect(deps.refreshPresentation).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({ phase: "live", revisionConflict: true });
  });

  it("a presentation read that fails never turns a live video into an error", async () => {
    const { controller } = await swapped({ refreshPresentation: vi.fn(async () => { throw new Error("offline"); }) });
    expect(controller.getState()).toMatchObject({ phase: "live", message: HERO_VIDEO_LIVE_COPY, error: null });
  });

  it("opening the page just after a swap went live refreshes the presentation once", async () => {
    const { controller, deps } = harness({ getStatus: vi.fn(async () => fresh) });
    await controller.load();
    expect(controller.getState()).toMatchObject({ phase: "live" });
    expect(deps.refreshPresentation).toHaveBeenCalledTimes(1);
  });

  it("an idle page makes no extra read", async () => {
    const { controller, deps } = harness();
    await controller.load();
    expect(deps.refreshPresentation).not.toHaveBeenCalled();
  });

  describe("the reducer", () => {
    const stateWith = (poster: ReturnType<typeof art>) => {
      const revamp = { ...defaultCinematicHomepageContent(), presentation: { ...defaultCinematicHomepageContent().presentation, heroPoster: poster } };
      return reduceHomepageEditor(
        createHomepageEditorState({ content: { ...homepageDraft(), revamp }, revision: "rev-1", designRevision: "d", editableSections: capabilities.editableSections, maxPhotos: 7 }),
        { type: "field-changed", field: "hero.intro", value: "My unsaved intro" },
      );
    };

    it("replaces the presentation in baseline and draft alike, keeps unsaved edits, and is never a pending change", () => {
      const state = stateWith(art("old-asset", "https://cdn.test/old.webp", "Hand-written"));
      const dirtyBefore = getDirtyHomepageSections(state);
      const next = reduceHomepageEditor(state, { type: "presentation-refreshed", presentation: presentationWith(art("new-asset", "https://cdn.test/new.webp")) });
      expect(next.baseline.revamp?.presentation.heroPoster).toEqual(art("new-asset", "https://cdn.test/new.webp"));
      expect(next.draft.revamp?.presentation.heroPoster).toEqual(art("new-asset", "https://cdn.test/new.webp"));
      expect(next.draft.revamp?.presentation.heroVideoGuid).toBe("new-guid");
      expect(next.draft.hero.intro).toBe("My unsaved intro");
      expect(getDirtyHomepageSections(next)).toEqual(dirtyBefore);
      expect(next.baseRevision).toBe(state.baseRevision);
      expect(state.draft.revamp?.presentation.heroPoster.assetId).toBe("old-asset");
    });

    it("keeps an unsaved header sponsor logo edit, still dirty, while the hero video and poster refresh", () => {
      const state = reduceHomepageEditor(stateWith(art("old-asset", "https://cdn.test/old.webp")), {
        type: "revamp-changed",
        content: (() => {
          const revamp = stateWith(art("old-asset", "https://cdn.test/old.webp")).draft.revamp!;
          return { ...revamp, presentation: { ...revamp.presentation, headerPartner: { ...revamp.presentation.headerPartner, alt: "My unsaved sponsor alt" } } };
        })(),
      });
      expect(getDirtyHomepageSections(state)).toContain("revamp");
      const server = { ...presentationWith(art("new-asset", "https://cdn.test/new.webp")), headerPartner: art(null, null, "") };
      const next = reduceHomepageEditor(state, { type: "presentation-refreshed", presentation: server });
      expect(next.draft.revamp?.presentation.headerPartner.alt).toBe("My unsaved sponsor alt");
      expect(next.baseline.revamp?.presentation.headerPartner.alt).toBe("");
      expect(next.draft.revamp?.presentation.heroPoster.assetId).toBe("new-asset");
      expect(next.draft.revamp?.presentation.heroVideoGuid).toBe("new-guid");
      expect(getDirtyHomepageSections(next)).toContain("revamp");
    });

    it("returns the same state object when the presentation did not change, or there is no cinematic draft", () => {
      const state = stateWith(art("a", "https://cdn.test/a.webp"));
      expect(reduceHomepageEditor(state, { type: "presentation-refreshed", presentation: state.draft.revamp!.presentation })).toBe(state);
      const plain = createHomepageEditorState({ content: homepageDraft(), revision: "r", designRevision: "d", editableSections: capabilities.editableSections, maxPhotos: 7 });
      expect(reduceHomepageEditor(plain, { type: "presentation-refreshed", presentation: presentationWith(art(null, null)) })).toBe(plain);
    });

    it("does not change what the next save sends", () => {
      const state = stateWith(art("old-asset", "https://cdn.test/old.webp"));
      const before = buildHomepageSaveRequest(state, renderer, SAVE_OPERATION);
      const next = reduceHomepageEditor(state, { type: "presentation-refreshed", presentation: presentationWith(art("new-asset", "https://cdn.test/new.webp")) });
      expect(buildHomepageSaveRequest(next, renderer, SAVE_OPERATION)).toEqual(before);
    });
  });

  describe("the presentation read", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("returns the revision and the presentation from one GET of the editor's own endpoint", async () => {
      const presentation = presentationWith(art("new-asset", "https://cdn.test/new.webp"));
      const stub = vi.fn(async () => new Response(JSON.stringify({ revision: "rev-2", content: { revamp: { presentation } } }), { status: 200 }));
      vi.stubGlobal("fetch", stub);
      expect(await fetchHomepagePresentation()).toEqual({ revision: "rev-2", presentation });
      expect(stub).toHaveBeenCalledWith("/api/admin/homepage", { credentials: "same-origin", cache: "no-store" });
    });
    it("gives null for a club with no cinematic content, and throws on a failed read", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ revision: "rev-2", content: {} }), { status: 200 })));
      expect(await fetchHomepagePresentation()).toEqual({ revision: "rev-2", presentation: null });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 500 })));
      await expect(fetchHomepagePresentation()).rejects.toThrow("nope");
    });
  });

  it("the Overview editor hands the controller the editor's refreshPresentation", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("components/admin/homepage/HomepageOverviewEditor.tsx", "utf8")).toContain("editor.refreshBaseRevision, editor.refreshPresentation");
    expect(readFileSync("lib/homepage-editor/useHomepageEditor.ts", "utf8")).toMatch(/refreshBaseRevision, refreshPresentation,/);
  });
});
