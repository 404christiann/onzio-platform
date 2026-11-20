import { afterEach, describe, expect, it, vi } from "vitest";
import { homepageDraft, SAVE_OPERATION } from "../fixtures/homepage-editor";
import { buildHomepageSaveRequest } from "@/lib/homepage-editor/adapter";
import { resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { createHomepageEditorState, reduceHomepageEditor, type HomepageEditorState } from "@/lib/homepage-editor/model";
import { defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { HeroVideoApiError, fetchHomepageRevision, finalizeHeroVideo, startHeroVideoUpload } from "@/lib/homepage-editor/hero-video-client";
import {
  HERO_VIDEO_MAX_POLLS, applySwapRevision, megabytes, createHeroVideoController, heroVideoErrorMessage, type HeroVideoDeps,
} from "@/lib/homepage-editor/hero-video-upload";

const tus = vi.hoisted(() => ({ instances: [] as { file: unknown; options: Record<string, (...a: unknown[]) => void> & { headers: Record<string, string>; metadata: Record<string, string>; retryDelays: number[]; endpoint: string }; start: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }[] }));
vi.mock("tus-js-client", () => ({
  Upload: class {
    start = vi.fn(); abort = vi.fn(async () => undefined);
    constructor(public file: unknown, public options: never) { tus.instances.push(this as never); }
  },
}));

const STATUS = { liveGuid: "live-1", previousGuid: "prev-1", replacesUsedToday: 2, replacesPerDay: 5, maxBytes: 524_288_000 };
const RANGE = { revisionBefore: "rev-1", revisionAfter: "rev-2" };
const TICKET = { videoGuid: "new-guid", upload: { endpoint: "https://video.bunnycdn.com/tusupload", libraryId: 723074, videoId: "new-guid", expire: 1_900_000_000, signature: "sig" }, maxBytes: STATUS.maxBytes };
const video = (size = 10_000_000, type = "video/mp4") => ({ name: "hero.mp4", size, type }) as unknown as File;
const apiError = (code: string, httpStatus = 422) => new HeroVideoApiError(code, "server words", httpStatus);

function harness(overrides: Partial<HeroVideoDeps> = {}) {
  const handlers: { current: Parameters<HeroVideoDeps["startUpload"]>[2] | null } = { current: null };
  const abort = vi.fn();
  const deps: HeroVideoDeps = {
    getStatus: vi.fn(async () => STATUS),
    start: vi.fn(async () => TICKET),
    finalize: vi.fn(async () => ({ status: "processing" as const })),
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
    const { controller, handlers, abort } = await uploading();
    controller.cancel();
    expect(abort).toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ phase: "idle", status: STATUS, error: null });
    handlers.current!.onError(new Error("aborted"));
    handlers.current!.onSuccess();
    expect(controller.getState().phase).toBe("idle");
  });

  it("polls finalize every 5 seconds while processing, then refetches the revision and goes live", async () => {
    const finalize = vi.fn()
      .mockResolvedValueOnce({ status: "processing" }).mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "live", liveGuid: "new-guid", previousGuid: "live-1", ...RANGE });
    const getStatus = vi.fn().mockResolvedValueOnce(STATUS).mockResolvedValue({ ...STATUS, liveGuid: "new-guid", previousGuid: "live-1", replacesUsedToday: 3 });
    const { controller, handlers, deps } = harness({ finalize, getStatus });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess();
    await settle();
    expect(finalize).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenCalledWith(5000);
    expect(deps.refreshRevision).toHaveBeenCalledTimes(1);
    expect(deps.refreshRevision).toHaveBeenCalledWith({ before: "rev-1", after: "rev-2" });
    expect(controller.getState()).toMatchObject({ phase: "live", revisionWarning: false, revisionConflict: false, status: { liveGuid: "new-guid", previousGuid: "live-1", replacesUsedToday: 3 } });
    expect(controller.getState().message).toMatch(/live on your site.*did not need Save/);
  });

  it("an already-live finalize still refetches the revision", async () => {
    const finalize = vi.fn().mockResolvedValue({ status: "live", liveGuid: "new-guid", previousGuid: "live-1", ...RANGE });
    const { controller, handlers, deps } = harness({ finalize });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState().phase).toBe("live");
    expect(deps.refreshRevision).toHaveBeenCalledTimes(1);
  });

  it("warns, rather than failing, when the revision cannot be refetched after going live", async () => {
    const finalize = vi.fn().mockResolvedValue({ status: "live", liveGuid: "new-guid", previousGuid: "live-1", ...RANGE });
    const { controller, handlers } = harness({ finalize, refreshRevision: vi.fn(async () => { throw new Error("offline"); }) });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "live", revisionWarning: true });
  });

  it("gives up after about 30 minutes with a still-processing message and lets the person check again", async () => {
    const finalize = vi.fn().mockResolvedValue({ status: "processing" });
    const { controller, handlers } = harness({ finalize });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(finalize).toHaveBeenCalledTimes(HERO_VIDEO_MAX_POLLS);
    expect(controller.getState()).toMatchObject({ phase: "error", error: { code: "PROCESSING_TIMEOUT", retry: "finalize" } });
    expect(controller.getState().error?.message).toMatch(/still processing/);
    finalize.mockResolvedValueOnce({ status: "live", liveGuid: "new-guid", previousGuid: "live-1", ...RANGE });
    await controller.retryFinalize();
    expect(controller.getState().phase).toBe("live");
  });

  it("an interrupted upload explains that nothing changed and lets the person choose a file again", async () => {
    const { controller, handlers } = await uploading();
    handlers.current!.onError(new Error("network"));
    expect(controller.getState()).toMatchObject({ phase: "error", error: { code: "UPLOAD_FAILED", retry: null } });
    expect(controller.getState().error?.message).toMatch(/unchanged/);
    await controller.replace(video());
    expect(controller.getState().phase).toBe("uploading");
  });

  it("repeated network failures while polling offer a finalize retry that re-polls", async () => {
    const finalize = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const { controller, handlers } = harness({ finalize });
    await controller.load(); await controller.replace(video());
    handlers.current!.onSuccess(); await settle();
    expect(controller.getState()).toMatchObject({ phase: "error", error: { code: "NETWORK", retry: "finalize" } });
    finalize.mockResolvedValueOnce({ status: "live", liveGuid: "new-guid", previousGuid: "live-1", ...RANGE });
    await controller.retryFinalize();
    expect(controller.getState().phase).toBe("live");
  });

  it.each([
    ["start", "DAILY_LIMIT", /all 5 video replacements/],
    ["start", "FILE_TOO_LARGE", /too large/],
    ["start", "UNSUPPORTED_TYPE", /not a video/],
    ["start", "VIDEO_NOT_CONFIGURED", /not set up/],
    ["finalize", "VIDEO_FAILED", /could not process/],
    ["finalize", "RESOLUTION_TOO_LOW", /at least 720p/],
    ["finalize", "NOT_CLUB_VIDEO", /does not belong/],
    ["finalize", "HERO_VIDEO_CHANGED", /changed somewhere else/],
    ["finalize", "HOMEPAGE_NOT_READY", /isn't set up/],
  ])("maps %s error %s to plain English", async (where, code, pattern) => {
    const rejection = vi.fn().mockRejectedValue(apiError(code));
    const { controller, handlers } = harness(where === "start" ? { start: rejection } : { finalize: rejection });
    await controller.load(); await controller.replace(video());
    if (where === "finalize") { handlers.current!.onSuccess(); await settle(); }
    const state = controller.getState();
    expect(state.phase).toBe("error");
    expect(state.error?.message).toMatch(pattern);
    expect(state.error?.message).not.toMatch(code);
    expect(state.error?.retry).toBeNull();
    expect(state.status).toBeTruthy();
  });

  it("every documented code has its own message", () => {
    for (const code of ["FILE_TOO_LARGE", "UNSUPPORTED_TYPE", "DAILY_LIMIT", "VIDEO_NOT_CONFIGURED", "HERO_VIDEO_NOT_AVAILABLE", "VIDEO_FAILED", "RESOLUTION_TOO_LOW", "NOT_CLUB_VIDEO", "HERO_VIDEO_CHANGED", "HOMEPAGE_NOT_READY", "NO_PREVIOUS_VIDEO"]) {
      expect(heroVideoErrorMessage(code)).not.toBe(heroVideoErrorMessage("SOMETHING_ELSE"));
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "processing" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "live", liveGuid: "g", previousGuid: "p" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "DAILY_LIMIT", message: "x" }), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await startHeroVideoUpload({ name: "a.mp4", size: 5, type: "video/mp4" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "start", fileName: "a.mp4", fileSize: 5, mimeType: "video/mp4" });
    expect(await finalizeHeroVideo("g")).toEqual({ status: "processing" });
    expect(await finalizeHeroVideo("g")).toEqual({ status: "live", liveGuid: "g", previousGuid: "p" });
    await expect(startHeroVideoUpload({ name: "a.mp4", size: 5, type: "video/mp4" })).rejects.toMatchObject({ code: "DAILY_LIMIT", httpStatus: 429 });
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
    expect(upload.options.headers).toEqual({ AuthorizationSignature: "sig", AuthorizationExpire: "1900000000", VideoId: "new-guid", LibraryId: "723074" });
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
    const finalize = vi.fn().mockResolvedValue({ status: "live", liveGuid: "new-guid", previousGuid: "live-1", ...live });
    const { controller, handlers } = harness({ finalize, refreshRevision });
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
