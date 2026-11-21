import { afterEach, describe, expect, it, vi } from "vitest";
import { homepageDraft, SAVE_OPERATION } from "../fixtures/homepage-editor";
import { buildHomepageSaveRequest } from "@/lib/homepage-editor/adapter";
import { resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { createHomepageEditorState, reduceHomepageEditor, type HomepageEditorState } from "@/lib/homepage-editor/model";
import { defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { HeroVideoApiError, abandonHeroVideoUpload, fetchHomepageRevision, markHeroVideoUploaded, startHeroVideoUpload, type HeroVideoStatus } from "@/lib/homepage-editor/hero-video-client";
import { readVideoDuration } from "@/lib/homepage-editor/hero-video-duration";
import {
  HERO_VIDEO_LIVE_COPY, HERO_VIDEO_OTHER_UPLOAD_NOTE, HERO_VIDEO_PREPARING_COPY, HERO_VIDEO_SUPERSEDED_COPY, HERO_VIDEO_UPLOAD_DONE_MS, HERO_VIDEO_UPLOADING_COPY,
  applySwapRevision, megabytes, createHeroVideoController, heroVideoErrorMessage, viewFor, type HeroVideoDeps, type HeroVideoView,
} from "@/lib/homepage-editor/hero-video-upload";

const tus = vi.hoisted(() => ({ instances: [] as { file: unknown; options: Record<string, (...a: unknown[]) => void> & { headers: Record<string, string>; metadata: Record<string, string>; retryDelays: number[]; endpoint: string }; start: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }[] }));
vi.mock("tus-js-client", () => ({
  Upload: class {
    start = vi.fn(); abort = vi.fn(async () => undefined);
    constructor(public file: unknown, public options: never) { tus.instances.push(this as never); }
  },
}));

const STATUS = { liveGuid: "live-1", previousGuid: "prev-1", replacesUsedToday: 2, replacesPerDay: 5, maxBytes: 524_288_000, maxSeconds: 600 };
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

  it("shows the upload check, then polls GET for display only, and goes live when the swap is already done", async () => {
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
    expect(deps.sleep).toHaveBeenCalledWith(HERO_VIDEO_UPLOAD_DONE_MS);
    expect(deps.sleep).toHaveBeenCalledWith(5000);
    expect(deps.refreshRevision).toHaveBeenCalledTimes(1);
    expect(deps.refreshRevision).toHaveBeenCalledWith({ before: "rev-1", after: "rev-2" });
    expect(controller.getState()).toMatchObject({ phase: "live", revisionWarning: false, revisionConflict: false, status: { liveGuid: "new-guid", previousGuid: "live-1", replacesUsedToday: 3 } });
    expect(controller.getState().message).toBe(HERO_VIDEO_LIVE_COPY);
  });

  it("shows a processing percent only while GET reports one", async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValueOnce(preparing);
    const sleep = vi.fn(async (ms: number) => { if (ms !== HERO_VIDEO_UPLOAD_DONE_MS) await new Promise(() => undefined); });
    const { controller, handlers } = harness({ getStatus, sleep });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess();
    await settle();
    expect(controller.getState()).toMatchObject({ phase: "preparing", encodeProgress: 40, message: HERO_VIDEO_PREPARING_COPY });
  });

  it("a returning visit during preparing shows preparing, not an empty form", async () => {
    const { controller } = harness({ getStatus: vi.fn(async () => preparing), sleep: vi.fn(() => new Promise<void>(() => undefined)) });
    await controller.load();
    expect(controller.getState()).toMatchObject({ phase: "preparing", message: HERO_VIDEO_PREPARING_COPY, status: { pending: { videoGuid: "new-guid" } } });
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
    const sleep = vi.fn(async (ms: number) => { if (ms !== HERO_VIDEO_UPLOAD_DONE_MS) await new Promise<void>(() => undefined); });
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
    expect(controller.getState()).toMatchObject({ phase: "error", error: { code: "VIDEO_FAILED" } });
    expect(controller.getState().error?.message).toMatch(/could not be processed/);
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
    ["start", "DAILY_LIMIT", /all 5 video replacements/],
    ["start", "FILE_TOO_LARGE", /too large/],
    ["start", "UNSUPPORTED_TYPE", /not a video/],
    ["start", "VIDEO_NOT_CONFIGURED", /not set up/],
    ["start", "VIDEO_TOO_LONG", /longer than 10 minutes.*shorter clip/],
    ["finalize", "VIDEO_TOO_LONG", /longer than 10 minutes.*shorter clip/],
    ["finalize", "STORED_SIZE_TOO_LARGE", /too long or too large once processed, so it was removed.*shorter clip \(up to 10 minutes\)/],
    ["finalize", "VIDEO_FAILED", /could not be processed/],
    ["finalize", "RESOLUTION_TOO_LOW", /at least 720p/],
    ["finalize", "NOT_CLUB_VIDEO", /does not belong/],
    ["finalize", "HERO_VIDEO_CHANGED", /changed somewhere else/],
    ["finalize", "HOMEPAGE_NOT_READY", /isn't set up/],
  ])("maps %s error %s to plain English", async (where, code, pattern) => {
    const rejection = vi.fn().mockRejectedValue(apiError(code));
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue({ ...STATUS, pending: { videoGuid: "new-guid", encodeProgress: null, effective: "failed" as const }, failure: { code } });
    const { controller, handlers } = harness(where === "start" ? { start: rejection } : { getStatus });
    await controller.load(); await controller.replace(video());
    if (where === "finalize") { handlers.current!.onSuccess(); await settle(); }
    const state = controller.getState();
    expect(state.phase).toBe("error");
    expect(state.error?.message).toMatch(pattern);
    expect(state.error?.message).not.toMatch(code);
    expect(state.error?.retry).toBeNull();
    expect(state.status).toBeTruthy();
    if (where === "finalize") expect(state.error?.message).not.toMatch(/larger than 500 MB/);
    if (code === "STORED_SIZE_TOO_LARGE") expect(state.error?.message).not.toContain("under 500 MB");
  });

  it("every documented code has its own message and none of them name the video host", () => {
    for (const code of ["FILE_TOO_LARGE", "UNSUPPORTED_TYPE", "DAILY_LIMIT", "VIDEO_NOT_CONFIGURED", "HERO_VIDEO_NOT_AVAILABLE", "VIDEO_TOO_LONG", "STORED_SIZE_TOO_LARGE", "VIDEO_FAILED", "RESOLUTION_TOO_LOW", "NOT_CLUB_VIDEO", "HERO_VIDEO_CHANGED", "HOMEPAGE_NOT_READY", "NO_PREVIOUS_VIDEO"]) {
      expect(heroVideoErrorMessage(code)).not.toBe(heroVideoErrorMessage("SOMETHING_ELSE"));
      expect(heroVideoErrorMessage(code)).not.toMatch(/bunny|video service/i);
    }
    for (const copy of [HERO_VIDEO_UPLOADING_COPY, HERO_VIDEO_PREPARING_COPY, HERO_VIDEO_LIVE_COPY]) {
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
    ["load: an upload past its deadline", at("uploading_overdue"), null, "other_upload"],
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
    ["watching: uploading past its deadline", at("uploading_overdue"), NEW, "other_upload"],
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
  // Row: the server's status on load, what the tab shows, and whether choosing a new file starts an upload.
  const rows: Array<[string, HeroVideoStatus, string, string, boolean]> = [
    ["reload mid-upload", { ...STATUS, pending: pending("uploading") }, "idle", HERO_VIDEO_OTHER_UPLOAD_NOTE, true],
    ["reload mid-upload, past its deadline", { ...STATUS, pending: pending("uploading_overdue") }, "idle", HERO_VIDEO_OTHER_UPLOAD_NOTE, true],
    ["reload during preparing", { ...STATUS, pending: pending("preparing") }, "preparing", HERO_VIDEO_PREPARING_COPY, false],
    ["reload after preparing timed out", { ...STATUS, pending: pending("preparing_overdue") }, "idle", heroVideoErrorMessage("PREPARE_TIMEOUT"), true],
    ["reload after an encode failure", { ...STATUS, pending: pending("failed"), failure: { code: "VIDEO_FAILED" } }, "error", heroVideoErrorMessage("VIDEO_FAILED"), true],
    ["reload after an abandoned upload", { ...STATUS, pending: pending("abandoned") }, "idle", "", true],
    ["reload inside the live notice window", { ...STATUS, liveGuid: GUID, pending: pending("live") }, "live", HERO_VIDEO_LIVE_COPY, true],
    ["reload after the live notice window", { ...STATUS, liveGuid: GUID, pending: pending("idle") }, "idle", "", true],
  ];
  it.each(rows)("%s", async (_label, status, phase, message, canReplace) => {
    // A browser that still remembers this upload changes nothing: ownership is only ever the server's pending row.
    const remembered = { getItem: () => GUID, setItem() {}, removeItem() {}, key: () => GUID, length: 1, clear() {} };
    vi.stubGlobal("sessionStorage", remembered);
    vi.stubGlobal("localStorage", remembered);
    const { controller, deps } = harness({ getStatus: vi.fn(async () => status), sleep: vi.fn(() => new Promise<void>(() => undefined)) });
    await controller.load();
    expect(controller.getState()).toMatchObject({ phase, message });
    if (phase === "error") expect(controller.getState().error?.code).toBe("VIDEO_FAILED");
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
    const sleep = vi.fn(async (ms: number) => { if (ms !== HERO_VIDEO_UPLOAD_DONE_MS) await new Promise<void>(() => undefined); });
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
    const sleep = vi.fn(async (ms: number) => { if (ms !== HERO_VIDEO_UPLOAD_DONE_MS && ++polls > 25) await new Promise<void>(() => undefined); });
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
