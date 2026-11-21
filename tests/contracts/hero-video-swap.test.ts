import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIVERSE_CITY_HERO_VIDEO, DIVERSE_CITY_STORY_VIDEO } from "@/lib/bunny-video";

const m = vi.hoisted(() => ({
  rpc: vi.fn(), maybeSingle: vi.fn(),
  findOrCreateCollection: vi.fn(), createVideo: vi.fn(), getVideo: vi.fn(), listCollectionVideos: vi.fn(),
  deleteVideo: vi.fn(), tusUploadAuthorization: vi.fn(), videoReadiness: vi.fn(),
}));
vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: () => ({
    schema: () => ({ rpc: m.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.maybeSingle }) }) }) }),
  }),
}));
vi.mock("@/lib/bunny-stream", () => ({
  BUNNY_STREAM_LIBRARY_ID: "723074",
  findOrCreateCollection: m.findOrCreateCollection, createVideo: m.createVideo, getVideo: m.getVideo,
  listCollectionVideos: m.listCollectionVideos, deleteVideo: m.deleteVideo,
  tusUploadAuthorization: m.tusUploadAuthorization, videoReadiness: m.videoReadiness,
}));

import {
  checkReadiness, getHeroVideoState, HERO_VIDEO_MAX_BYTES, HERO_VIDEO_MAX_SECONDS, HERO_VIDEO_MAX_STORED_BYTES, HeroVideoError, revertHeroVideo,
  safeDeleteHeroVideo, startHeroVideoUpload,
} from "@/lib/hero-video-swap";

const club = "club-1";
const COL = "col-1";
const NEW = "00000000-0000-4000-8000-000000000001";
const OLD = "00000000-0000-4000-8000-000000000002";
const PREV = "00000000-0000-4000-8000-000000000003";
const state = (live = "", previous = "") => m.maybeSingle.mockResolvedValue({ data: { presentation_config: { heroVideoGuid: live, previousHeroVideoGuid: previous } }, error: null });
const rpcByName = (map: Record<string, unknown>) => m.rpc.mockImplementation(async (name: string) => ({ data: map[name], error: null }));
const err = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as HeroVideoError;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.findOrCreateCollection.mockResolvedValue(COL);
  m.createVideo.mockResolvedValue("new-guid");
  m.tusUploadAuthorization.mockReturnValue({ endpoint: "e", libraryId: "723074", videoId: "new-guid", expire: 1, signature: "s" });
  m.getVideo.mockImplementation(async (guid: string) => ({ guid, collectionId: COL, status: 4, availableResolutions: ["720p"], hasMP4Fallback: true, width: 1, height: 1 }));
  m.videoReadiness.mockResolvedValue("ready");
  m.listCollectionVideos.mockResolvedValue([]);
  m.deleteVideo.mockResolvedValue(true);
  state();
});

describe("startHeroVideoUpload", () => {
  const ok = { fileName: "a.mp4", fileSize: 1000, mimeType: "video/mp4" };
  it.each([
    [{ ...ok, mimeType: "image/png" }, 415, "UNSUPPORTED_TYPE"],
    [{ ...ok, fileSize: 500 * 1024 * 1024 + 1 }, 413, "FILE_TOO_LARGE"],
    [{ ...ok, fileSize: 0 }, 413, "FILE_TOO_LARGE"],
    [{ ...ok, fileName: "x".repeat(201) }, 400, "INVALID_FILE_NAME"],
    [{ ...ok, durationSeconds: 601 }, 422, "VIDEO_TOO_LONG"],
  ])("rejects invalid input without consuming the counter", async (input, status, code) => {
    const e = await err(startHeroVideoUpload(club, input));
    expect([e.status, e.code]).toEqual([status, code]);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.createVideo).not.toHaveBeenCalled();
  });
  it("exposes a 10 minute duration cap", () => {
    expect(HERO_VIDEO_MAX_SECONDS).toBe(600);
  });
  it("rejects a declared duration over the cap with a plain 422, before the counter, the sweep or Bunny", async () => {
    const e = await err(startHeroVideoUpload(club, { ...ok, durationSeconds: 600.5 }));
    expect([e.status, e.code]).toEqual([422, "VIDEO_TOO_LONG"]);
    expect(e.message).toBe("That video is longer than 10 minutes. Choose a shorter clip.");
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.findOrCreateCollection).not.toHaveBeenCalled();
    expect(m.listCollectionVideos).not.toHaveBeenCalled();
    expect(m.createVideo).not.toHaveBeenCalled();
  });
  const started = { outcome: "ok", delete_guid: null, phase: "uploading", replace_counted: false, revision_before: null, revision_after: null, used: 0 };
  it.each([["exactly the cap", { durationSeconds: 600 }], ["a short clip", { durationSeconds: 90.25 }], ["no declared duration", {}]])("allows %s and does not count a replace until bytes land", async (_l, extra) => {
    rpcByName({ hero_video_replaces_today: 0, hero_video_event: [started] });
    const r = await startHeroVideoUpload(club, { ...ok, ...extra });
    expect(m.rpc.mock.calls.filter((call) => call[0] === "consume_hero_video_replace")).toEqual([]);
    expect(m.rpc).toHaveBeenCalledWith("hero_video_event", expect.objectContaining({ p_club_id: club, p_event: "start", p_video_guid: "new-guid", p_expected: ["uploading", "preparing", "live", "failed", "abandoned"] }));
    expect(r.videoGuid).toBe("new-guid");
  });
  it("answers 429 at the daily cap and creates nothing", async () => {
    rpcByName({ hero_video_replaces_today: 5 });
    const e = await err(startHeroVideoUpload(club, ok));
    expect([e.status, e.code]).toEqual([429, "DAILY_LIMIT"]);
    expect(m.createVideo).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.filter((call) => call[0] === "consume_hero_video_replace")).toEqual([]);
  });
  it("refuses a new file while a video is still preparing and deletes only the unused guid", async () => {
    rpcByName({
      hero_video_replaces_today: 1,
      hero_video_event: [{ outcome: "preparing", delete_guid: "new-guid", phase: "preparing", replace_counted: true, revision_before: null, revision_after: null, used: 1 }],
    });
    const e = await err(startHeroVideoUpload(club, ok));
    expect([e.status, e.code]).toEqual([409, "VIDEO_PREPARING"]);
    expect(m.deleteVideo).toHaveBeenCalledTimes(1);
    expect(m.deleteVideo).toHaveBeenCalledWith("new-guid");
    expect(m.rpc.mock.calls.filter((call) => call[0] === "consume_hero_video_replace")).toEqual([]);
  });
  it("superseding an in-progress upload deletes the old guid once", async () => {
    rpcByName({
      hero_video_replaces_today: 0,
      hero_video_event: [{ outcome: "ok", delete_guid: OLD, phase: "uploading", replace_counted: false, revision_before: null, revision_after: null, used: 0 }],
    });
    await startHeroVideoUpload(club, ok);
    expect(m.deleteVideo).toHaveBeenCalledTimes(1);
    expect(m.deleteVideo).toHaveBeenCalledWith(OLD);
  });
  it("checks the cap, then creates the video, and does not consume a replace at start", async () => {
    rpcByName({ hero_video_replaces_today: 0, hero_video_event: [started] });
    const r = await startHeroVideoUpload(club, ok);
    expect(m.rpc.mock.calls.filter((call) => call[0] === "consume_hero_video_replace")).toEqual([]);
    expect(m.rpc).toHaveBeenCalledWith("hero_video_event", expect.objectContaining({ p_event: "start" }));
    expect(m.createVideo).toHaveBeenCalledWith({ title: expect.stringMatching(/^Hero video 20/), collectionId: COL });
    expect(m.listCollectionVideos).not.toHaveBeenCalled();
    expect(r).toMatchObject({ videoGuid: "new-guid", maxBytes: 500 * 1024 * 1024, upload: { signature: "s" } });
  });
});

describe("getHeroVideoState", () => {
  it("reports the file, duration and daily limits the UI shows", async () => {
    state(OLD, PREV);
    rpcByName({ hero_video_replaces_today: 2 });
    expect(await getHeroVideoState(club)).toEqual({
      liveGuid: OLD, previousGuid: PREV, replacesUsedToday: 2, replacesPerDay: 5, maxBytes: 500 * 1024 * 1024, maxSeconds: 600,
      pending: null, failure: null, completion: null,
    });
  });
});

describe("startHeroVideoUpload does not sweep", () => {
  const ok = { fileName: "a.mp4", fileSize: 1000, mimeType: "video/mp4" };
  const started = { outcome: "ok", delete_guid: null, phase: "uploading", replace_counted: false, revision_before: null, revision_after: null, used: 0 };
  beforeEach(() => rpcByName({ hero_video_replaces_today: 0, hero_video_event: [started] }));

  it("does not list or delete collection videos while starting", async () => {
    m.listCollectionVideos.mockResolvedValue([{ guid: "00000000-0000-4000-8000-000000000010", status: 0, storageSize: 0, dateUploaded: new Date(Date.now() - 48 * 3600e3).toISOString() }]);
    await startHeroVideoUpload(club, ok);
    expect(m.listCollectionVideos).not.toHaveBeenCalled();
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });
  it("does not sweep when validation or the daily cap rejects the request", async () => {
    await err(startHeroVideoUpload(club, { ...ok, fileSize: 0 }));
    rpcByName({ hero_video_replaces_today: 5 });
    await err(startHeroVideoUpload(club, ok));
    expect(m.listCollectionVideos).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.filter((call) => call[0] === "consume_hero_video_replace")).toEqual([]);
  });
});

describe("safeDeleteHeroVideo", () => {
  it.each([["live", OLD, ""], ["previous", "", OLD]])("refuses the %s guid", async (_l, live, previous) => {
    state(live || NEW, previous);
    expect(await safeDeleteHeroVideo(club, COL, OLD)).toBe(false);
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });
  it.each([DIVERSE_CITY_HERO_VIDEO.guid, DIVERSE_CITY_STORY_VIDEO.guid])("refuses Diverse City guid %s", async (g) => {
    expect(await safeDeleteHeroVideo(club, COL, g)).toBe(false);
    expect(m.deleteVideo).not.toHaveBeenCalled();
    expect(m.getVideo).not.toHaveBeenCalled();
  });
  it("refuses videos in another collection or missing", async () => {
    m.getVideo.mockResolvedValueOnce({ guid: OLD, collectionId: "other" });
    expect(await safeDeleteHeroVideo(club, COL, OLD)).toBe(false);
    m.getVideo.mockResolvedValueOnce(null);
    expect(await safeDeleteHeroVideo(club, COL, OLD)).toBe(false);
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });
  it("deletes an unreferenced club video and swallows delete failures", async () => {
    expect(await safeDeleteHeroVideo(club, COL, OLD)).toBe(true);
    m.deleteVideo.mockRejectedValueOnce(new Error("boom"));
    expect(await safeDeleteHeroVideo(club, COL, OLD)).toBe(false);
  });
});

describe("checkReadiness", () => {
  const bunny = (over: Record<string, unknown> = {}) => m.getVideo.mockImplementation(async (guid: string) => ({
    guid, collectionId: COL, status: 4, availableResolutions: ["720p"], hasMP4Fallback: true, width: 1280, height: 720, storageSize: 1000, length: 30, ...over,
  }));
  it("rejects a video that is not in the club collection and deletes nothing", async () => {
    m.getVideo.mockResolvedValue({ guid: NEW, collectionId: "other", length: 1, storageSize: 1 });
    expect(await checkReadiness(club, NEW)).toEqual({ status: "rejected", code: "NOT_CLUB_VIDEO" });
    m.getVideo.mockResolvedValue(null);
    expect(await checkReadiness(club, NEW)).toEqual({ status: "rejected", code: "NOT_CLUB_VIDEO" });
    expect(m.deleteVideo).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("reports processing without writing or deleting", async () => {
    bunny();
    m.videoReadiness.mockResolvedValue("processing");
    expect(await checkReadiness(club, NEW)).toEqual({ status: "processing" });
    expect(m.deleteVideo).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each([["failed", "VIDEO_FAILED"], ["resolution_too_low", "RESOLUTION_TOO_LOW"]])("%s rejects without deleting", async (readiness, code) => {
    bunny();
    m.videoReadiness.mockResolvedValue(readiness);
    expect(await checkReadiness(club, NEW)).toEqual({ status: "rejected", code });
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });
  describe("stored size ceiling", () => {
    const FILE_LIMIT = 500 * 1024 * 1024;
    const CAP = 4 * FILE_LIMIT;
    it("exposes a 2,000 MiB stored ceiling separate from the 500 MiB file limit", () => {
      expect(HERO_VIDEO_MAX_BYTES).toBe(FILE_LIMIT);
      expect(HERO_VIDEO_MAX_STORED_BYTES).toBe(CAP);
    });
    it("accepts a file whose stored size is 1.2 GB and deletes nothing", async () => {
      bunny({ storageSize: 1_200_000_000 });
      expect(await checkReadiness(club, NEW)).toEqual({ status: "ready" });
      expect(m.deleteVideo).not.toHaveBeenCalled();
      expect(m.rpc.mock.calls.some((c) => c[0] === "swap_hero_video")).toBe(false);
    });
    it.each([["finished", 4], ["still processing", 2]])("rejects a %s video whose stored bytes exceed the ceiling without deleting", async (_l, status) => {
      bunny({ status, storageSize: CAP + 1 });
      expect(await checkReadiness(club, NEW)).toEqual({ status: "rejected", code: "STORED_SIZE_TOO_LARGE" });
      expect(m.deleteVideo).not.toHaveBeenCalled();
    });
    it("allows exactly the ceiling and rejects ceiling + 1", async () => {
      bunny({ storageSize: CAP });
      expect(await checkReadiness(club, NEW)).toEqual({ status: "ready" });
      bunny({ storageSize: CAP + 1 });
      expect(await checkReadiness(club, NEW)).toEqual({ status: "rejected", code: "STORED_SIZE_TOO_LARGE" });
      expect(m.deleteVideo).not.toHaveBeenCalled();
    });
  });
  describe("duration cap", () => {
    it.each([["finished", 4], ["still processing", 2]])("rejects a %s video longer than the cap without deleting", async (_l, status) => {
      bunny({ status, length: 601 });
      expect(await checkReadiness(club, NEW)).toEqual({ status: "rejected", code: "VIDEO_TOO_LONG" });
      expect(m.deleteVideo).not.toHaveBeenCalled();
      expect(m.listCollectionVideos).not.toHaveBeenCalled();
    });
    it("accepts a video of exactly the cap", async () => {
      bunny({ length: 600 });
      expect(await checkReadiness(club, NEW)).toEqual({ status: "ready" });
    });
    it.each([[0], [undefined]])("does not reject on length when Bunny has not reported it yet (%s)", async (length) => {
      bunny({ length });
      expect(await checkReadiness(club, NEW)).toEqual({ status: "ready" });
    });
    it("keeps the stored-size check ahead of a short video", async () => {
      bunny({ length: 120, storageSize: HERO_VIDEO_MAX_STORED_BYTES + 1 });
      expect(await checkReadiness(club, NEW)).toEqual({ status: "rejected", code: "STORED_SIZE_TOO_LARGE" });
    });
  });
});

describe("revertHeroVideo", () => {
  const input = { expectedLiveGuid: NEW, targetGuid: OLD };
  it.each(["reverted", "already_live"])("%s answers live", async (outcome) => {
    rpcByName({ revert_hero_video: [{ outcome, live_guid: OLD, previous_guid: NEW, revision_before: "r1", revision_after: "r2" }] });
    const wrote = outcome === "reverted";
    expect(await revertHeroVideo(club, input)).toEqual({ status: "live", liveGuid: OLD, previousGuid: NEW, revisionBefore: wrote ? "r1" : null, revisionAfter: wrote ? "r2" : null });
    expect(m.rpc).toHaveBeenCalledWith("revert_hero_video", { p_club_id: club, p_expected_live: NEW, p_target_guid: OLD });
  });
  it.each([["no_previous", "NO_PREVIOUS_VIDEO"], ["conflict", "HERO_VIDEO_CHANGED"]])("%s answers 409 and never deletes or consumes", async (outcome, code) => {
    rpcByName({ revert_hero_video: [{ outcome, live_guid: NEW, previous_guid: "" }] });
    const e = await err(revertHeroVideo(club, input));
    expect([e.status, e.code]).toEqual([409, code]);
    expect(m.deleteVideo).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.every((c) => c[0] === "revert_hero_video")).toBe(true);
  });
});
