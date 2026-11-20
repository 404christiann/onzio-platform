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

import { finalizeHeroVideo, HeroVideoError, revertHeroVideo, safeDeleteHeroVideo, startHeroVideoUpload } from "@/lib/hero-video-swap";

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
  ])("rejects invalid input without consuming the counter", async (input, status, code) => {
    const e = await err(startHeroVideoUpload(club, input));
    expect([e.status, e.code]).toEqual([status, code]);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.createVideo).not.toHaveBeenCalled();
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
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith("consume_hero_video_replace", { p_club_id: club, p_cap: 5 });
    expect(m.createVideo).toHaveBeenCalledWith({ title: expect.stringMatching(/^Hero video 20/), collectionId: COL });
    expect(r).toMatchObject({ videoGuid: "new-guid", maxBytes: 500 * 1024 * 1024, upload: { signature: "s" } });
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
