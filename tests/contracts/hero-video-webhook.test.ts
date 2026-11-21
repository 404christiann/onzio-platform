import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyBunnyStreamStatus, verifyBunnyStreamSignature } from "@/lib/bunny-stream-webhook";

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
vi.mock("@/lib/bunny-stream", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/bunny-stream")>();
  return {
    ...actual,
    findOrCreateCollection: m.findOrCreateCollection, createVideo: m.createVideo, getVideo: m.getVideo,
    listCollectionVideos: m.listCollectionVideos, deleteVideo: m.deleteVideo,
    tusUploadAuthorization: m.tusUploadAuthorization, videoReadiness: m.videoReadiness,
  };
});

import { POST } from "@/app/api/webhooks/bunny-stream/route";
import { GET } from "@/app/api/cron/hero-video/route";
import { applyBunnyStreamWebhook, getHeroVideoState, runHeroVideoBackstop } from "@/lib/hero-video-swap";

const SECRET = "read-only-library-key";
const CLUB = "11111111-1111-4111-8111-111111111111";
const COL = "col-1";
const NEW = "00000000-0000-4000-8000-000000000001";
const OLD = "00000000-0000-4000-8000-000000000002";
const PREV = "00000000-0000-4000-8000-000000000003";
const swapped = { outcome: "swapped", live_guid: NEW, previous_guid: OLD, deletable_guid: PREV, revision_before: "r1", revision_after: "r2" };

function sign(raw: string, secret = SECRET) {
  return createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}
function event(status: number, guid = NEW, library = 723074) {
  return JSON.stringify({ VideoLibraryId: library, VideoGuid: guid, Status: status });
}
function headers(raw: string, extra: Record<string, string> = {}) {
  return { "x-bunnystream-signature": sign(raw), "x-bunnystream-signature-version": "v1", "x-bunnystream-signature-algorithm": "hmac-sha256", ...extra };
}
const rpcByName = (map: Record<string, unknown>) => m.rpc.mockImplementation(async (name: string) => ({ data: name in map ? map[name] : null, error: null }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("BUNNY_STREAM_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("BUNNY_STREAM_API_KEY", "k");
  m.findOrCreateCollection.mockResolvedValue(COL);
  m.listCollectionVideos.mockResolvedValue([]);
  m.deleteVideo.mockResolvedValue(true);
  m.videoReadiness.mockResolvedValue("ready");
  m.getVideo.mockImplementation(async (guid: string) => ({
    guid, collectionId: COL, status: 4, availableResolutions: ["720p"], hasMP4Fallback: true,
    width: 1280, height: 720, storageSize: 1000, length: 30, dateUploaded: "2026-11-21T00:00:00Z", encodeProgress: 100,
  }));
  m.maybeSingle.mockResolvedValue({ data: { presentation_config: { heroVideoGuid: OLD, previousHeroVideoGuid: PREV } }, error: null });
  rpcByName({
    lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "preparing" }],
    swap_hero_video: [swapped],
    settle_hero_video_pending: "ok",
    read_hero_video_pending: [],
    hero_video_replaces_today: 1,
    list_hero_video_pending: [],
  });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("Bunny Stream webhook signature", () => {
  const raw = event(3);
  it("accepts the documented v1 hmac-sha256 of the raw body", () => {
    expect(verifyBunnyStreamSignature({ rawBody: raw, signature: sign(raw), version: "v1", algorithm: "hmac-sha256", secret: SECRET })).toBe(true);
  });
  it.each([
    ["wrong secret", { signature: sign(raw, "other") }],
    ["re-serialized body", { rawBody: JSON.stringify(JSON.parse(raw)) + " " }],
    ["missing version", { version: null }],
    ["wrong version", { version: "v2" }],
    ["wrong algorithm", { algorithm: "hmac-sha1" }],
    ["uppercase hex", { signature: sign(raw).toUpperCase() }],
    ["short signature", { signature: "abcd" }],
    ["missing secret", { secret: "" }],
  ])("rejects %s", (_label, over) => {
    expect(verifyBunnyStreamSignature({ rawBody: raw, signature: sign(raw), version: "v1", algorithm: "hmac-sha256", secret: SECRET, ...over })).toBe(false);
  });
  it("classifies finished, failed, and in-progress webhook statuses separately from the video object", () => {
    expect(classifyBunnyStreamStatus(3)).toBe("finalize");
    expect(classifyBunnyStreamStatus(5)).toBe("fail");
    expect(classifyBunnyStreamStatus(8)).toBe("fail");
    expect(classifyBunnyStreamStatus(7)).toBe("preparing");
    expect(classifyBunnyStreamStatus(9)).toBe("ignore");
  });
});

describe("hero video webhook route", () => {
  function post(raw: string, headerOver?: Record<string, string> | null) {
    const init = headerOver === null ? {} : headers(raw, headerOver);
    return POST(new Request("https://alpha.example/api/webhooks/bunny-stream", { method: "POST", headers: init, body: raw }));
  }

  it("rejects a missing or wrong signature before any lookup", async () => {
    const raw = event(3);
    expect((await post(raw, null)).status).toBe(401);
    expect((await post(raw, { "x-bunnystream-signature": sign(raw, "nope") })).status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.getVideo).not.toHaveBeenCalled();
  });

  it("rejects an unknown library and ignores a guid that is not this club's pending upload", async () => {
    const unknown = event(3, NEW, 999);
    expect((await post(unknown)).status).toBe(404);
    expect(m.getVideo).not.toHaveBeenCalled();
    rpcByName({ lookup_hero_video_pending: [] });
    const response = await post(event(3));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, outcome: "ignored" });
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
  });

  it("ignores a guid whose collection is not the club collection", async () => {
    m.getVideo.mockResolvedValueOnce({ guid: NEW, collectionId: "someone-else", encodeProgress: null });
    const response = await post(event(3));
    expect(await response.json()).toMatchObject({ outcome: "ignored" });
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });

  it("finalizes a finished encode and is idempotent when the video is already live", async () => {
    const raw = event(3);
    m.maybeSingle.mockReset();
    m.maybeSingle
      .mockResolvedValueOnce({ data: { presentation_config: { heroVideoGuid: OLD, previousHeroVideoGuid: PREV } }, error: null })
      .mockResolvedValue({ data: { presentation_config: { heroVideoGuid: NEW, previousHeroVideoGuid: OLD } }, error: null });
    const first = await post(raw);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, outcome: "live" });
    expect(m.rpc).toHaveBeenCalledWith("swap_hero_video", expect.objectContaining({ p_club_id: CLUB, p_new_guid: NEW }));
    expect(m.deleteVideo).toHaveBeenCalledWith(PREV);
    expect(m.rpc).toHaveBeenCalledWith("settle_hero_video_pending", expect.objectContaining({ p_phase: "live", p_revision_before: "r1", p_revision_after: "r2" }));

    m.maybeSingle.mockResolvedValue({ data: { presentation_config: { heroVideoGuid: NEW, previousHeroVideoGuid: OLD } }, error: null });
    m.deleteVideo.mockClear();
    m.rpc.mockClear();
    rpcByName({
      lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "live" }],
      settle_hero_video_pending: "ok",
    });
    const second = await applyBunnyStreamWebhook({ rawBody: raw, ...{
      signature: sign(raw), version: "v1", algorithm: "hmac-sha256",
    } });
    expect(second).toEqual({ httpStatus: 200, body: { received: true, outcome: "already_live" } });
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });

  it("does not put a reverted video live again when Finished arrives late", async () => {
    m.maybeSingle.mockResolvedValue({ data: { presentation_config: { heroVideoGuid: OLD, previousHeroVideoGuid: NEW } }, error: null });
    rpcByName({ lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "live" }] });
    const response = await post(event(3));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, outcome: "already_live" });
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
    expect(m.getVideo).not.toHaveBeenCalled();
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });

  it("returns 503 when Finished arrives before the MP4 is ready, so the delivery is retried", async () => {
    m.videoReadiness.mockResolvedValue("processing");
    const response = await post(event(3));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ outcome: "processing" });
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
  });

  it("cleans up a failed encode with the existing delete guard", async () => {
    const response = await post(event(5));
    expect(await response.json()).toEqual({ received: true, outcome: "failed" });
    expect(m.deleteVideo).toHaveBeenCalledWith(NEW);
    expect(m.rpc).toHaveBeenCalledWith("settle_hero_video_pending", expect.objectContaining({ p_phase: "failed", p_failure_code: "VIDEO_FAILED" }));
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
  });

  it("marks an upload finished event as preparing without swapping", async () => {
    rpcByName({
      lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "uploading" }],
      record_hero_video_pending: "ok",
    });
    const response = await post(event(7));
    expect(await response.json()).toEqual({ received: true, outcome: "preparing" });
    expect(m.rpc).toHaveBeenCalledWith("record_hero_video_pending", expect.objectContaining({ p_phase: "preparing", p_video_guid: NEW }));
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
  });
});

describe("pending hero video state", () => {
  it("GET reports preparing, with a percent only when Bunny has one", async () => {
    rpcByName({
      hero_video_replaces_today: 2,
      read_hero_video_pending: [{ video_guid: NEW, collection_id: COL, phase: "preparing", failure_code: null, revision_before: null, revision_after: null }],
    });
    m.getVideo.mockResolvedValueOnce({ guid: NEW, collectionId: COL, encodeProgress: 42 });
    const state = await getHeroVideoState(CLUB);
    expect(state.pending).toEqual({ videoGuid: NEW, encodeProgress: 42 });
    expect(state.failure).toBeNull();

    m.getVideo.mockResolvedValueOnce({ guid: NEW, collectionId: COL, encodeProgress: null });
    expect((await getHeroVideoState(CLUB)).pending).toEqual({ videoGuid: NEW, encodeProgress: null });
  });

  it("hides an in-progress byte upload and reports a stored failure", async () => {
    m.maybeSingle.mockResolvedValue({ data: { presentation_config: { heroVideoGuid: OLD, previousHeroVideoGuid: "" } }, error: null });
    rpcByName({
      hero_video_replaces_today: 1,
      read_hero_video_pending: [{ video_guid: NEW, collection_id: COL, phase: "uploading", failure_code: null, revision_before: null, revision_after: null }],
    });
    expect((await getHeroVideoState(CLUB)).pending).toBeNull();
    rpcByName({
      hero_video_replaces_today: 1,
      read_hero_video_pending: [{ video_guid: NEW, collection_id: COL, phase: "failed", failure_code: "VIDEO_FAILED", revision_before: null, revision_after: null }],
    });
    expect((await getHeroVideoState(CLUB)).failure).toEqual({ code: "VIDEO_FAILED" });
  });
});

describe("hero video cron backstop", () => {
  function cron(authorization?: string) {
    return GET(new Request("https://onzio.example/api/cron/hero-video", { headers: authorization ? { authorization } : undefined }));
  }

  it("fails closed without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    delete process.env.CRON_SECRET;
    expect((await cron()).status).toBe(401);
    expect((await cron("Bearer secret")).status).toBe(401);
  });

  it("finalizes a ready pending upload and sweeps one that is not ready yet", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const fresh = "00000000-0000-4000-8000-00000000000a";
    const waiting = "00000000-0000-4000-8000-000000000009";
    m.listCollectionVideos.mockResolvedValue([{ guid: fresh, status: 2, storageSize: 0, dateUploaded: new Date().toISOString() }]);
    m.videoReadiness.mockResolvedValueOnce("ready").mockResolvedValueOnce("processing");
    rpcByName({
      list_hero_video_pending: [
        { club_id: CLUB, video_guid: NEW, collection_id: COL, phase: "preparing" },
        { club_id: CLUB, video_guid: waiting, collection_id: COL, phase: "uploading" },
      ],
      swap_hero_video: [{ ...swapped, deletable_guid: null }],
      settle_hero_video_pending: "ok",
    });
    const response = await cron("Bearer secret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { configured: true, inspected: 2, finalized: 1, swept: 1, failed: 0 }, error: null });
    expect(m.rpc).toHaveBeenCalledWith("swap_hero_video", expect.objectContaining({ p_new_guid: NEW }));
    expect(m.deleteVideo).not.toHaveBeenCalledWith(fresh);
  });

  it("clears a stale upload that never received any bytes and leaves a fresh one", async () => {
    const stale = "00000000-0000-4000-8000-00000000000b";
    const fresh = "00000000-0000-4000-8000-00000000000c";
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600e3).toISOString();
    m.getVideo.mockImplementation(async (guid: string) => ({
      guid, collectionId: COL, status: 0, availableResolutions: [], hasMP4Fallback: false,
      width: 0, height: 0, length: 0, encodeProgress: null,
      storageSize: guid === stale || guid === fresh ? 0 : 1000,
      dateUploaded: guid === fresh ? hoursAgo(1) : hoursAgo(3),
    }));
    m.videoReadiness.mockResolvedValue("processing");
    m.listCollectionVideos.mockResolvedValue([]);
    rpcByName({
      list_hero_video_pending: [
        { club_id: CLUB, video_guid: stale, collection_id: COL, phase: "uploading" },
        { club_id: CLUB, video_guid: fresh, collection_id: COL, phase: "uploading" },
      ],
      settle_hero_video_pending: "ok",
    });
    const result = await runHeroVideoBackstop();
    expect(m.deleteVideo).toHaveBeenCalledWith(stale);
    expect(m.deleteVideo).not.toHaveBeenCalledWith(fresh);
    expect(m.rpc).toHaveBeenCalledWith("settle_hero_video_pending", expect.objectContaining({ p_video_guid: stale, p_phase: "clear" }));
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
    expect(result.finalized).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("skips the run when the video host is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("BUNNY_STREAM_API_KEY", "");
    const response = await cron("Bearer secret");
    expect(await response.json()).toEqual({ data: { configured: false, inspected: 0, finalized: 0, swept: 0, failed: 0 }, error: null });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("runHeroVideoBackstop counts an unexpected failure without deleting the live video", async () => {
    m.getVideo.mockRejectedValue(new Error("down"));
    rpcByName({ list_hero_video_pending: [{ club_id: CLUB, video_guid: NEW, collection_id: COL, phase: "preparing" }] });
    const result = await runHeroVideoBackstop();
    expect(result.failed).toBe(1);
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });
});
