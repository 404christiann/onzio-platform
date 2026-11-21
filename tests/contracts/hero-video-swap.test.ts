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
  finalizeHeroVideo, getHeroVideoState, HERO_VIDEO_MAX_BYTES, HERO_VIDEO_MAX_SECONDS, HERO_VIDEO_MAX_STORED_BYTES, HeroVideoError, revertHeroVideo,
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
  it.each([["exactly the cap", { durationSeconds: 600 }], ["a short clip", { durationSeconds: 90.25 }], ["no declared duration", {}]])("allows %s and consumes the counter once", async (_l, extra) => {
    rpcByName({ consume_hero_video_replace: [{ allowed: true, used: 1, cap: 5 }] });
    const r = await startHeroVideoUpload(club, { ...ok, ...extra });
    expect(m.rpc).toHaveBeenCalledWith("consume_hero_video_replace", { p_club_id: club, p_cap: 5 });
    expect(m.rpc).toHaveBeenCalledWith("record_hero_video_pending", expect.objectContaining({ p_club_id: club, p_phase: "uploading", p_video_guid: "new-guid" }));
    expect(r.videoGuid).toBe("new-guid");
  });
  it("answers 429 at the daily cap and creates nothing", async () => {
    rpcByName({ consume_hero_video_replace: [{ allowed: false, used: 5, cap: 5 }] });
    const e = await err(startHeroVideoUpload(club, ok));
    expect([e.status, e.code]).toEqual([429, "DAILY_LIMIT"]);
    expect(m.createVideo).not.toHaveBeenCalled();
  });
  it("consumes once then creates the video and returns the upload authorization", async () => {
    rpcByName({ consume_hero_video_replace: [{ allowed: true, used: 1, cap: 5 }] });
    const r = await startHeroVideoUpload(club, ok);
    expect(m.rpc).toHaveBeenCalledWith("consume_hero_video_replace", { p_club_id: club, p_cap: 5 });
    expect(m.rpc).toHaveBeenCalledWith("record_hero_video_pending", expect.objectContaining({ p_club_id: club, p_phase: "uploading" }));
    expect(m.createVideo).toHaveBeenCalledWith({ title: expect.stringMatching(/^Hero video 20/), collectionId: COL });
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

describe("startHeroVideoUpload sweep", () => {
  const ok = { fileName: "a.mp4", fileSize: 1000, mimeType: "video/mp4" };
  const ago = (hours: number) => new Date(Date.now() - hours * 3600e3).toISOString();
  const item = (guid: string, status: number, hours: number) => ({ guid, status, storageSize: 0, dateUploaded: ago(hours) });
  const G = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
  beforeEach(() => rpcByName({ consume_hero_video_replace: [{ allowed: true, used: 1, cap: 5 }] }));

  it("deletes abandoned (0/6 older than 2h) and old (24h) videos, keeps the rest, before creating the video", async () => {
    state(G(1), G(2));
    m.listCollectionVideos.mockResolvedValue([
      item(G(10), 0, 3), item(G(11), 6, 3), item(G(12), 4, 25), item(G(13), 2, 25),
      item(G(14), 0, 1), item(G(15), 4, 3), item(G(1), 0, 30), item(G(2), 4, 30),
      item(DIVERSE_CITY_HERO_VIDEO.guid, 4, 90), item(DIVERSE_CITY_STORY_VIDEO.guid, 0, 90),
    ]);
    await startHeroVideoUpload(club, ok);
    expect(m.deleteVideo.mock.calls.map((c) => c[0]).sort()).toEqual([G(10), G(11), G(12), G(13)].sort());
    expect(m.deleteVideo.mock.invocationCallOrder[0]).toBeLessThan(m.createVideo.mock.invocationCallOrder[0]);
  });
  it("a sweep failure does not fail start", async () => {
    m.listCollectionVideos.mockRejectedValue(new Error("bunny down"));
    await expect(startHeroVideoUpload(club, ok)).resolves.toMatchObject({ videoGuid: "new-guid" });
    m.listCollectionVideos.mockResolvedValue([item(G(10), 0, 3)]);
    m.deleteVideo.mockRejectedValue(new Error("nope"));
    await expect(startHeroVideoUpload(club, ok)).resolves.toMatchObject({ videoGuid: "new-guid" });
  });
  it("does not sweep when validation or the daily cap rejects the request", async () => {
    await err(startHeroVideoUpload(club, { ...ok, fileSize: 0 }));
    rpcByName({ consume_hero_video_replace: [{ allowed: false }] });
    await err(startHeroVideoUpload(club, ok));
    expect(m.listCollectionVideos).not.toHaveBeenCalled();
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

describe("finalizeHeroVideo", () => {
  const swapped = { outcome: "swapped", live_guid: NEW, previous_guid: OLD, deletable_guid: PREV, revision_before: "r1", revision_after: "r2" };
  it("404s for a video that is not in the club collection, never swapping or deleting", async () => {
    m.getVideo.mockResolvedValue({ guid: NEW, collectionId: "other" });
    expect((await err(finalizeHeroVideo(club, NEW))).code).toBe("NOT_CLUB_VIDEO");
    m.getVideo.mockResolvedValue(null);
    expect((await err(finalizeHeroVideo(club, NEW))).status).toBe(404);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });
  it("returns 202 while processing", async () => {
    m.videoReadiness.mockResolvedValue("processing");
    expect(await finalizeHeroVideo(club, NEW)).toEqual({ httpStatus: 202, body: { status: "processing" } });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each([["failed", "VIDEO_FAILED"], ["resolution_too_low", "RESOLUTION_TOO_LOW"]])("%s deletes the upload and answers 422", async (readiness, code) => {
    m.videoReadiness.mockResolvedValue(readiness);
    const e = await err(finalizeHeroVideo(club, NEW));
    expect([e.status, e.code]).toEqual([422, code]);
    expect(m.deleteVideo).toHaveBeenCalledExactlyOnceWith(NEW);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  describe("stored size ceiling", () => {
    const FILE_LIMIT = 500 * 1024 * 1024;
    const CAP = 4 * FILE_LIMIT;
    const bunny = (over: Record<string, unknown>) => m.getVideo.mockImplementation(async (guid: string) => ({
      guid, collectionId: COL, status: 4, availableResolutions: ["720p"], hasMP4Fallback: true, width: 1280, height: 720, storageSize: 0, ...over,
    }));
    it("exposes a 2,000 MiB stored ceiling separate from the 500 MiB file limit", () => {
      expect(HERO_VIDEO_MAX_BYTES).toBe(FILE_LIMIT);
      expect(HERO_VIDEO_MAX_STORED_BYTES).toBe(CAP);
    });
    it("swaps a 450 MiB declared upload whose original plus renditions is 1.2 GB, deleting nothing", async () => {
      rpcByName({ consume_hero_video_replace: [{ allowed: true, used: 1, cap: 5 }], swap_hero_video: [{ ...swapped, deletable_guid: null }] });
      await startHeroVideoUpload(club, { fileName: "a.mp4", fileSize: 450 * 1024 * 1024, mimeType: "video/mp4" });
      bunny({ storageSize: 1_200_000_000 });
      const result = await finalizeHeroVideo(club, NEW);
      expect(result.httpStatus).toBe(200);
      expect(m.rpc.mock.calls.some((c) => c[0] === "swap_hero_video")).toBe(true);
      expect(m.deleteVideo).not.toHaveBeenCalled();
    });
    it.each([["finished", 4], ["still processing", 2]])("rejects a %s video whose stored bytes exceed the ceiling with 413, deleting it and never swapping", async (_l, status) => {
      rpcByName({ swap_hero_video: [swapped] });
      bunny({ status, storageSize: CAP + 1 });
      m.videoReadiness.mockResolvedValue(status === 4 ? "ready" : "processing");
      const e = await err(finalizeHeroVideo(club, NEW));
      expect([e.status, e.code]).toEqual([413, "STORED_SIZE_TOO_LARGE"]);
      expect(e.message).toBe("Once processed, this video takes more than 2,000 MB, so it was removed. Use a shorter clip (up to 10 minutes).");
      expect(m.deleteVideo).toHaveBeenCalledWith(NEW);
      expect(m.rpc.mock.calls.some((c) => c[0] === "swap_hero_video")).toBe(false);
    });
    it("still rejects a client that declared 1000 bytes but stored 3 GB", async () => {
      rpcByName({ consume_hero_video_replace: [{ allowed: true, used: 1, cap: 5 }], swap_hero_video: [swapped] });
      await startHeroVideoUpload(club, { fileName: "a.mp4", fileSize: 1000, mimeType: "video/mp4" });
      bunny({ storageSize: 3_000_000_000 });
      const e = await err(finalizeHeroVideo(club, NEW));
      expect([e.status, e.code]).toEqual([413, "STORED_SIZE_TOO_LARGE"]);
      expect(m.deleteVideo).toHaveBeenCalledWith(NEW);
      expect(m.rpc.mock.calls.some((c) => c[0] === "swap_hero_video")).toBe(false);
    });
    it("allows exactly the ceiling and rejects ceiling + 1", async () => {
      rpcByName({ swap_hero_video: [swapped] });
      bunny({ storageSize: CAP });
      expect((await finalizeHeroVideo(club, NEW)).httpStatus).toBe(200);
      m.deleteVideo.mockClear();
      m.rpc.mockClear();
      bunny({ storageSize: CAP + 1 });
      expect((await err(finalizeHeroVideo(club, NEW))).code).toBe("STORED_SIZE_TOO_LARGE");
      expect(m.rpc).not.toHaveBeenCalled();
    });
    it.each([["live", NEW, ""], ["previous", "", NEW]])("never deletes an oversized video that is the %s guid", async (_l, live, previous) => {
      state(live, previous);
      bunny({ storageSize: CAP + 1 });
      expect((await err(finalizeHeroVideo(club, NEW))).code).toBe("STORED_SIZE_TOO_LARGE");
      expect(m.deleteVideo).not.toHaveBeenCalled();
      expect(m.rpc).not.toHaveBeenCalled();
    });
  });
  describe("duration cap", () => {
    const bunnyLength = (length: unknown, over: Record<string, unknown> = {}) => m.getVideo.mockImplementation(async (guid: string) => ({
      guid, collectionId: COL, status: 4, availableResolutions: ["720p"], hasMP4Fallback: true, width: 1280, height: 720, storageSize: 0, length, ...over,
    }));
    it.each([["finished", 4, "ready"], ["still processing", 2, "processing"]])("deletes a %s video longer than the cap, answers 422 and never swaps", async (_l, status, readiness) => {
      rpcByName({ swap_hero_video: [swapped] });
      bunnyLength(601, { status });
      m.videoReadiness.mockResolvedValue(readiness);
      const e = await err(finalizeHeroVideo(club, NEW));
      expect([e.status, e.code]).toEqual([422, "VIDEO_TOO_LONG"]);
      expect(e.message).toBe("That video is longer than 10 minutes, so it was removed. Use a shorter clip.");
      expect(m.deleteVideo).toHaveBeenCalledExactlyOnceWith(NEW);
      expect(m.rpc.mock.calls.some((c) => c[0] === "swap_hero_video")).toBe(false);
    });
    it("also sweeps stale club videos but not the one being finalized", async () => {
      bunnyLength(601);
      m.listCollectionVideos.mockResolvedValue([{ guid: OLD, status: 0, storageSize: 0, dateUploaded: new Date(Date.now() - 3 * 3600e3).toISOString() }]);
      await err(finalizeHeroVideo(club, NEW));
      expect(m.listCollectionVideos).toHaveBeenCalledWith(COL);
      expect(m.deleteVideo.mock.calls.map((c) => c[0]).sort()).toEqual([NEW, OLD].sort());
    });
    it("proceeds to the swap for a video of exactly the cap", async () => {
      rpcByName({ swap_hero_video: [swapped] });
      bunnyLength(600);
      expect((await finalizeHeroVideo(club, NEW)).httpStatus).toBe(200);
      expect(m.rpc.mock.calls.some((c) => c[0] === "swap_hero_video")).toBe(true);
    });
    it.each([[0], [undefined]])("does not reject on length when Bunny has not reported it yet (%s)", async (length) => {
      rpcByName({ swap_hero_video: [swapped] });
      bunnyLength(length);
      expect((await finalizeHeroVideo(club, NEW)).httpStatus).toBe(200);
      expect(m.rpc.mock.calls.some((c) => c[0] === "swap_hero_video")).toBe(true);
    });
    it("keeps the stored-size check: a short video that stores over the ceiling is still rejected with 413", async () => {
      bunnyLength(120, { storageSize: HERO_VIDEO_MAX_STORED_BYTES + 1 });
      const e = await err(finalizeHeroVideo(club, NEW));
      expect([e.status, e.code]).toEqual([413, "STORED_SIZE_TOO_LARGE"]);
    });
    it.each([["live", NEW, ""], ["previous", "", NEW]])("never deletes a too-long video that is the %s guid", async (_l, live, previous) => {
      state(live, previous);
      bunnyLength(601);
      expect((await err(finalizeHeroVideo(club, NEW))).code).toBe("VIDEO_TOO_LONG");
      expect(m.deleteVideo).not.toHaveBeenCalled();
      expect(m.rpc).not.toHaveBeenCalled();
    });
  });
  it.each([["failed"], ["resolution_too_low"]])("%s failure also sweeps stale club videos but not the one being finalized", async (readiness) => {
    m.videoReadiness.mockResolvedValue(readiness);
    m.listCollectionVideos.mockResolvedValue([{ guid: OLD, status: 0, storageSize: 0, dateUploaded: new Date(Date.now() - 3 * 3600e3).toISOString() }]);
    await err(finalizeHeroVideo(club, NEW));
    expect(m.listCollectionVideos).toHaveBeenCalledWith(COL);
    expect(m.deleteVideo.mock.calls.map((c) => c[0]).sort()).toEqual([NEW, OLD].sort());
  });
  it("swaps, deletes the deletable guid, and sweeps only old unreferenced club videos", async () => {
    state(OLD, PREV);
    rpcByName({ swap_hero_video: [swapped] });
    const stale = "00000000-0000-4000-8000-000000000009";
    const fresh = "00000000-0000-4000-8000-00000000000a";
    m.listCollectionVideos.mockResolvedValue([
      { guid: stale, dateUploaded: new Date(Date.now() - 48 * 3600e3).toISOString() },
      { guid: fresh, dateUploaded: new Date(Date.now() - 3600e3).toISOString() },
      { guid: OLD, dateUploaded: new Date(Date.now() - 48 * 3600e3).toISOString() },
    ]);
    // after the swap the config reads new live/previous
    m.maybeSingle.mockResolvedValueOnce({ data: { presentation_config: { heroVideoGuid: OLD, previousHeroVideoGuid: PREV } }, error: null });
    m.maybeSingle.mockResolvedValue({ data: { presentation_config: { heroVideoGuid: NEW, previousHeroVideoGuid: OLD } }, error: null });
    const r = await finalizeHeroVideo(club, NEW);
    expect(m.rpc).toHaveBeenCalledWith("swap_hero_video", { p_club_id: club, p_new_guid: NEW, p_library_id: "723074", p_expected_live: OLD });
    expect(r).toEqual({ httpStatus: 200, body: { status: "live", liveGuid: NEW, previousGuid: OLD, revisionBefore: "r1", revisionAfter: "r2" } });
    expect(m.deleteVideo.mock.calls.map((c) => c[0]).sort()).toEqual([PREV, stale].sort());
  });
  it("is idempotent when already live: no swap, no delete", async () => {
    state(NEW, OLD);
    expect(await finalizeHeroVideo(club, NEW)).toEqual({ httpStatus: 200, body: { status: "live", liveGuid: NEW, previousGuid: OLD, revisionBefore: null, revisionAfter: null } });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });
  it.each([["conflict", "HERO_VIDEO_CHANGED"], ["missing_row", "HOMEPAGE_NOT_READY"]])("%s deletes nothing", async (outcome, code) => {
    rpcByName({ swap_hero_video: [{ outcome, live_guid: "", previous_guid: "", deletable_guid: null }] });
    const e = await err(finalizeHeroVideo(club, NEW));
    expect([e.status, e.code]).toEqual([409, code]);
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });
  it("keeps the uploaded video when the swap RPC throws or errors", async () => {
    m.rpc.mockRejectedValueOnce(new Error("down"));
    await expect(finalizeHeroVideo(club, NEW)).rejects.toThrow("down");
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect((await err(finalizeHeroVideo(club, NEW))).status).toBe(500);
    expect(m.deleteVideo).not.toHaveBeenCalled();
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
